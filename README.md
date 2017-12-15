# Mbed.js - v2

Currently Mbed OS 5 is a target inside JerryScript. This adds complication, such as requiring changes in upstream JerryScript repository every time we want to change something, and part of the drivers living in JerryScript. In Mbed.js v2 I want to change this, by having JerryScript as a normal dependency. This should also make it more flexible to use JerryScript in Mbed OS applications, e.g. run it in a separate thread without the need to dive into the JerryScript source.

Additionally this allows us to use the normal Mbed build toolchain, so switching compilers, debug options, etc. are better supported.

Work in progress.

## How to build

1. Install Mbed CLI, Python 2.7 and node.js 8.x.
1. Import this project:

    ```
    $ mbed import https://github.com/armmbed/mbed-js-v2
    ```

1. Install dependencies:

    ```
    $ npm install -g gulp
    $ npm install
    ```

1. Build the project for your target:

    ```
    $ gulp build --js ./source/main.js --target=K64F
    ```

1. Drag the `.bin` (or `.hex`) file to your board to flash.

**Changing build options**

To change the build options, invoke Mbed CLI by hand.

First turn your JS into C++ code via:

```
$ gulp --js ./source/main.js --target=K64F
```

Then, compile manually:

```
$ mbed compile -m K64F -t GCC_ARM --profile=debug
```

