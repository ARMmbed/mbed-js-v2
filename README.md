# Mbed.js - v2

Currently Mbed OS 5 is a target inside JerryScript. This adds complication, such as requiring changes in upstream JerryScript repository every time we want to change something, and part of the drivers living in JerryScript. In Mbed.js v2 I want to change this, by having JerryScript as a normal dependency. This should also make it more flexible to use JerryScript in Mbed OS applications, e.g. run it in a separate thread without the need to dive into the JerryScript source.

Additionally this allows us to use the normal Mbed build toolchain, so switching compilers, debug options, etc. are better supported.

Work in progress.

## How to build

1. Install Mbed CLI.
1. Import this project:

    ```
    $ mbed import https://github.com/janjongboom/mbed-js-v2
    ```

1. Turn your JavaScript into C:

    ```
    $ cd mbed-js
    $ pip install -r requirements.txt
    $ npm install
    $ gulp --target=K64F --js=../source/js/main.js
    ```

1. Build the project for your target:

    ```
    $ mbed compile -m K64F -t GCC_ARM
    ```

