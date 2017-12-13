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
    const spawn = require('child-process-promise').spawn;
    const find = require('find');

    const Path = require('path');

    const isWindows = require('os').platform() === 'win32';

    const node_package = JSON.parse(fs.readFileSync(Path.join(__dirname, '..', 'package.json')));

    const buildDir = Path.join(__dirname, '..', 'build');

    gulp.task('bundle', function() {
        var noParse = [];

        if (!util.env.js || !fs.existsSync(util.env.js)) {
            throw 'No main.js specified: Call `gulp --js path/to/main.js`';
        }

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

    gulp.task('pip-requirements', function() {
        return spawn(
            'pip',
            [ 'install', '-r', 'requirements.txt' ],
            { cwd: Path.join(__dirname, '..', 'tools')/*, stdio: 'inherit' */ });
    });

    gulp.task('generate-pins', ['make-build-dir', 'pip-requirements'], function() {
        let script = Path.join(__dirname, '..', 'tools', 'generate_pins.py');

        if (!util.env.target) {
            throw 'No target specified. Use `gulp --target=YOUR_TARGET`'
        }

        return spawn('python', [ script, util.env.target ], { cwd: buildDir });
    });

    gulp.task('cppify', ['bundle', 'pip-requirements'], function() {
        let script = Path.join(__dirname, '..', 'jerryscript', 'tools', 'js2c.py');

        let p = spawn('python', [
            script,
            '--ignore', 'pins.js',
            '--no-main',
            '--dest', buildDir,
            '--js-source', buildDir
        ], { cwd: buildDir/*, stdio: 'inherit' */ });

        return p;
    });

    gulp.task('make-build-dir', function() {
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir);
        }
    });

    function dependencies(obj) {
        console.log(obj.dependencies)
        return obj.dependencies.map(Object.keys) + obj.dependencies.map(dependencies);
    }

    function list_libs() {

        return new Promise((resolve, reject) => {
            find.file(/mbedjs\.json$/, process.cwd(), function(f) {
                let data = f.map(path => {
                    // @todo: async
                    let content = JSON.parse(fs.readFileSync(path, 'utf8'));

                    return {
                        name: content.name,
                        abs_source: content.source.map(dir => {
                            return Path.resolve(Path.dirname(path), dir);
                        }),
                        config: content
                    }
                });

                resolve(data);
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

    gulp.task('build', ['generate-cpp'], function() {
        let p = spawn('mbed', [ 'compile', '-m', util.env.target, '-t', 'GCC_ARM' ], { stdio: 'inherit' });

        return p;
    });

    if (util.env.build) {
        gulp.task('default', ['build']);
    }
    else {
        gulp.task('default', ['generate-cpp']);
    }
};
