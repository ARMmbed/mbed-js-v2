'use strict';

module.exports = function(gulp) {
    const run = require('gulp-run');
    const util = require('gulp-util');
    const print = require('gulp-print');
    const filter = require('gulp-filter');
    const uglify = require('gulp-uglify');
    const rename = require('gulp-rename');
    const template = require('gulp-template');

    const browserify = require('browserify');
    const promisify = require('promisify-node');
    const uglifyify = require('uglifyify');

    const buffer = require('vinyl-buffer');
    const source = require('vinyl-source-stream');

    const npm = require('npm');

    const fs = require('fs');
    const del = require('del');
    const exec = require('child-process-promise').exec;

    const Path = require('path');

    const isWindows = require('os').platform() === 'win32';

    const node_package = JSON.parse(fs.readFileSync(Path.join(__dirname, '..', 'package.json')));

    const buildDir = Path.join(__dirname, '..', 'build');
    const jsBuildDir = Path.join(buildDir, 'out');

    gulp.task('bundle', function() {
        var noParse = [];

        try {
            noParse.push(require.resolve('bleno'));
        } catch (e) { /* empty */ }

        const b = browserify({
            entries: util.env.js, // Path.join(__dirname, '..', '..', 'source', 'js', 'main.js'),
            noParse: noParse,
            builtins: false
        });

        b.transform({
            global: true,
            compress: {
                dead_code: true,
                global_defs: {
                    __jerryscript: true
                }
            }
        }, uglifyify);

        return b.bundle()
                .pipe(source(node_package.name + '.bundle.min.js'))
                .pipe(buffer())

                // output bundled js
                .pipe(gulp.dest(buildDir));
    });

    // function cpp_name_sanitise(name) {
    //     let out_name = name.replace(new RegExp('-', 'g'), '_')
    //                        .replace(new RegExp('\\\\', 'g'), '_')
    //                        .replace(new RegExp('\\?', 'g'), '_')
    //                        .replace(new RegExp('\'', 'g'), '_')
    //                        .replace(new RegExp('"', 'g'), '_');

    //     if ("0123456789".indexOf(out_name[0]) != -1) {
    //         out_name = '_' + out_name;
    //     }

    //     return out_name;
    // }

    // function cpp_string_sanitise(string) {
    //     let out_str = string.replace(new RegExp('\\\\', 'g'), '\\\\')
    //                         .replace(new RegExp("\n", 'g'), "\\n")
    //                         .replace(new RegExp("\"", 'g'), '\\"');

    //     return out_str;
    // }

    gulp.task('generate-pins', ['make-build-dir'], function() {
        // @todo: properly spawn this. This breaks with a space in the path
        let script = Path.join(__dirname, '..', 'tools', 'generate_pins.py');
        return exec('python ' + script + ' ' + util.env.target,
                    { cwd: jsBuildDir });
    });

    gulp.task('cppify', ['bundle'], function() {
        // @todo: properly spawn this. This breaks with a space in the path
        let script = Path.join(__dirname, '..', 'jerryscript', 'tools', 'js2c.py');
        return exec([
            'python ' + script,
            ' --ignore pins.js',
            '--no-main',
            '--dest ' + buildDir,
            '--js-source ' + buildDir
        ].join(' '), { cwd: buildDir });
    });

    gulp.task('make-build-dir', function() {
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir);
        }

        if (!fs.existsSync(jsBuildDir)) {
            fs.mkdirSync(jsBuildDir);
        }
    });

    function dependencies(obj) {
        console.log(obj.dependencies)
        return obj.dependencies.map(Object.keys) + obj.dependencies.map(dependencies);
    }

    function list_libs() {
        return new Promise(function(resolve, reject) {
            npm.load({ production: true, depth: 0, progress: false }, function(err, npm) {
                var native_packages = [];
                npm.commands.ls([], true, function dependencies(err, data, lite) {
                    function recurse_dependencies(list) {
                        if (!list) {
                            return;
                        }

                        let keys = Object.keys(list);

                        for (let i = 0; i < keys.length; i++) {
                            if (list[keys[i]] && !list[keys[i]].missing) {
                                // check for mbedjs.json
                                var path = list[keys[i]].path + '/mbedjs.json';

                                try {
                                    fs.statSync(path);
                                } catch (e) {
                                    recurse_dependencies(list[keys[i]].dependencies);
                                    continue;
                                }

                                list[keys[i]].path = list[keys[i]].path.replace(new RegExp(/\\/, 'g'), "/");

                                var json_data = JSON.parse(fs.readFileSync(path));

                                native_packages.push({
                                    name: list[keys[i]].name,
                                    abs_source: json_data.source.map(function(dir) {
                                        return list[keys[i]].path.replace("\\", "/") + '/' + dir
                                    }),
                                    config: json_data
                                });
                                recurse_dependencies(list[keys[i]].dependencies);
                            }
                        }
                    }

                    recurse_dependencies(data.dependencies);

                    resolve(native_packages);
                });
            });
        });
    }

    function parse_pins(path) {
        return promisify(fs.readFile)(path, { encoding: 'utf-8' }).then(function(pin_data) {
            return pin_data.split('\n')
                    .filter(function(line) {
                        let bits = line.split(' ');
                        return bits.length == 4;
                    })
                    .map(function(line) {
                        let bits = line.split(' ');

                        return {
                            name: bits[1],
                            value: bits[3].slice(0, -1)
                        };
                    });
        });
    }

    gulp.task('generate-cpp', ['cppify', 'generate-pins'], function() {
        return list_libs()
                .then(function(libs) {
                    var native_list = libs.map(function(p) { return util.colors.cyan(p.name) });

                    if (native_list.length > 0) {
                        util.log("Found native packages: " + native_list.join(", "));
                    } else {
                        util.log("Found no native packages.");
                    }

                    var gulp_stream = gulp.src(__dirname + '/tmpl/mbed-js.h.tmpl')
                                        .pipe(rename('mbed-js.h'))
                                        .pipe(template({
                                            libraries: libs
                                        }))
                                        .pipe(gulp.dest(buildDir));
                });
    });

    gulp.task('default', ['generate-cpp']);
};
