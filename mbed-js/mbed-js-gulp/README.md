# mbed-js-gulp

Rules for building jerryscript projects using npm, gulp and mbed. This can be
included in your projects to speed up the process of working with Jerryscript
and mbed.

For an example of using this, see [an example project](https://github.com/ARMmbed/mbed-js-example)

```bash
cd [your project directory]
npm install --save-dev matthewelse/mbed-js-gulp
```

Then add this to your gulpfile (or create it if necessary)

```js
const gulp = require('gulp');

require('mbed-js-gulp')(gulp);
```

You can then build your project using gulp:

```bash
gulp --target=[your target]
```
