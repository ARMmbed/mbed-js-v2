var led = new DigitalOut(LED1);

blabalabl;

setInterval(function() {
    led.write(led.read() === 0 ? 1 : 0);
}, 500);
