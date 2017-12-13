var led = new DigitalOut(LED1);

setInterval(function() {
    led.write(led.read() === 0 ? 1 : 0);
}, 500);
