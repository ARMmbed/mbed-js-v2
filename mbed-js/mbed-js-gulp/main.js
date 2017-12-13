'use strict';

module.exports = function(gulp) {
    const JERRYSCRIPT_REVISION = '8ebbfda996cf1dc27b64f84ec9122c19c6fb90f1';

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

    const isWindows = require('os').platform() === 'win32';

    const node_package = JSON.parse(fs.readFileSync('./package.json'));

    gulp.task('bundle', function() {
        var noParse = [];

        try {
            noParse.push(require.resolve('bleno'));
        } catch (e) { /* empty */ }

        const b = browserify({
            entries: node_package.main,
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
                .pipe(gulp.dest('./build/js/'));
    });

    function cpp_name_sanitise(name) {
        let out_name = name.replace(new RegExp('-', 'g'), '_')
                           .replace(new RegExp('\\\\', 'g'), '_')
                           .replace(new RegExp('\\?', 'g'), '_')
                           .replace(new RegExp('\'', 'g'), '_')
                           .replace(new RegExp('"', 'g'), '_');

        if ("0123456789".indexOf(out_name[0]) != -1) {
            out_name = '_' + out_name;
        }

        return out_name;
    }

    function cpp_string_sanitise(string) {
        let out_str = string.replace(new RegExp('\\\\', 'g'), '\\\\')
                            .replace(new RegExp("\n", 'g'), "\\n")
                            .replace(new RegExp("\"", 'g'), '\\"');

        return out_str;
    }

    gulp.task('cppify', ['getlibs', 'bundle'], function() {
        return exec("python jerryscript/targets/tools/js2c.py --ignore pins.js --no-main",
                    { cwd: './build' });
    });

    gulp.task('ignorefile', function() {
        return gulp.src(__dirname + '/tmpl/mbedignore.tmpl')
                   .pipe(rename('.mbedignore'))
                   .pipe(gulp.dest('./build/'));
    });

    gulp.task('makefile', ['make-build-dir'], function() {
        return gulp.src(__dirname + '/tmpl/Makefile.tmpl')
                   .pipe(rename('Makefile'))
                   .pipe(gulp.dest('./build/'));
    });

    // avoid deleting jerryscript et. al, since it makes subsequent builds really slow
    gulp.task('clean', function() {
        return del(['build/out']);
    });

    // delete all the things
    gulp.task('deepclean', function() {
        return del(['build']);
    });

    gulp.task('make-build-dir', function() {
        if (!fs.existsSync('./build')) {
            fs.mkdirSync('./build');
        }

        if (!fs.existsSync('./build/source')) {
            fs.mkdirSync('./build/source');
        }
    });

    gulp.task('get-jerryscript', ['makefile'], function() {
        if (!fs.existsSync('./build/jerryscript')) {
            let commands = [
                'git clone https://github.com/jerryscript-project/jerryscript',
                'cd jerryscript',
                'git checkout ' + JERRYSCRIPT_REVISION,
                'cd ..',
                'pip install -r jerryscript/targets/mbedos5/tools/requirements.txt',
            ];

            let cmd;
            if (isWindows) {
                cmd = commands.join(' & ');
            }
            else {
                cmd = commands.join('; ');
            }

            return run(cmd, { cwd: './build' }).exec();
        }
    });

    gulp.task('getlibs', ['get-jerryscript'], function() {
        return run('make getlibs', { cwd: './build/jerryscript/targets/mbedos5' }).exec();
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

    gulp.task('build', ['getlibs', 'cppify', 'ignorefile', 'makefile'], function() {
        return list_libs()
                .then(function(libs) {
                    var native_list = libs.map(function(p) { return util.colors.cyan(p.name) });

                    if (native_list.length > 0) {
                        util.log("Found native packages: " + native_list.join(", "));
                    } else {
                        util.log("Found no native packages.");
                    }

                    var gulp_stream = gulp.src(__dirname + '/tmpl/main.cpp.tmpl')
                                        .pipe(rename('main.cpp'))
                                        .pipe(template({
                                            libraries: libs
                                        }))
                                        .pipe(gulp.dest('./build/source/'));

                    return new Promise(function(resolve, reject) {
                        gulp_stream.on('end', function() {
                            // include the native_extras library if it exists
                            fs.stat("./native_extras", function(err) {
                                var lib_dirs = libs.map(function(lib) { return lib.abs_source.join(':'); });

                                if (!err) {
                                    lib_dirs.push("../../../../native_extras/");
                                }

                                var lib_source_files = lib_dirs.join(':');

                                resolve(run('make BOARD=' + util.env.target + ' EXTRAS=' + lib_source_files, { cwd: './build', verbosity: 3 }).exec()
                                .pipe(print())
                                .pipe(rename('build.log'))
                                .pipe(gulp.dest('./build')));
                            });
                        });
                    });
                })
    });

    gulp.task('default', ['build']);
};
