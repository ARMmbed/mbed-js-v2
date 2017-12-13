var led = new DigitalOut(LED1);

var iv = setInterval(function() {
    led.write(led.read() === 0 ? 1 : 0);
}, 500);

console.log("To stop LED1 from blinking, run `clearInterval(" + iv + ")`");

repl_start();
