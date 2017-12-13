#include "mbed.h"
#include "mbed-js.h"

Thread jsThread(osPriorityNormal, OS_STACK_SIZE * 2);

int main() {
    jsThread.start(&mbed_js_main);
}
