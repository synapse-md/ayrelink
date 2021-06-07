"use strict";


const SerialPort    = require('serialport'),
      Readline      = require('@serialport/parser-readline'),
      util          = require('util'),
      events        = require('events');

function AyreLink() {
    this.config = { };
    this.status = { };
    this.initializing = false;
}

util.inherits(AyreLink, events.EventEmitter);

AyreLink.prototype.start = async function (settings) {
    if (settings.model == "KX-R") {
        this.config.devicename = "Ayre KX-R";
        this.config.voltype = "number";
        this.config.volmin = 0;
        this.config.volmax = 60;
        this.config.volstep = 1;
        this.config.volstepdB = 1;
    } else if (settings.model == "KX-5") {
        this.config.devicename = "Ayre KX-5";
        this.config.voltype = "number";
        this.config.volmin = 0;
        this.config.volmax = 46;
        this.config.volstep = 1;
        this.config.volstepdB = 1.5;
    } else {
        console.log("[AyreLink] No supported device configured.");
        this.close()
        return Promise.reject();

    }
    if (settings.modelver) this.config.devicename = this.config.devicename + " Twenty";
    if (!settings.serialport) {
        console.log("[AyreLink] No valid serial port configured.");
        this.close();
        return Promise.reject();
    }

    this.config.devicetype = settings.model;
    this.config.port = settings.serialport;
    this.config.summary =   this.config.devicename + " configured with vol range "+ 
                            this.config.volmin + "-" + this.config.volmax +
                            ", step size " + this.config.volstep + " on " +
                            this.config.port;

    console.log("[AyreLink] " + this.config.summary);
    
    this.close().then(this.open());
    this._port.on('open', () => {
        this.initializing = true;
        this.status.preampvolume = undefined;
        this.status.preampstatus = undefined;
        this.interpreter();
        console.log("[AyreLink] Getting initial preamp status...");
        this.write("K*?\r");
    });
}

AyreLink.prototype.close = async function () {
    if (this._port) {
        let oldport = this._port.path;
        this._port.drain(() => {});
        this._port.close(() => {});
        this._port = undefined;
        this.parser = undefined;
        console.log("[AyreLink] Closed old port " + oldport);
    } else {
        console.log("[Ayrelink] No prior port open.");
    }
}

AyreLink.prototype.open = async function () {
    console.log("[Ayrelink] Opening new port " + this.config.port + " for parsing.");
    this._port = new SerialPort(this.config.port, { baudRate: 2400, dataBits: 8, stopBits: 1, parity: 'none', lock: true });
    this.parser = this._port.pipe(new Readline({ delimiter: '\r' }));
};

AyreLink.prototype.interpreter = function () {
    if (!this.parser) {
        console.log("[AyreLink Interpreter] No active parser!");
        return
    }
    console.log("[AyreLink Interpreter] Initializing interpreter on " + this._port.path);
    var data = { };
    this.parser.on('data', data => {
        let capdata = data.toUpperCase();
        let oldstatus = this.status.preampstatus;
        let oldvol = this.status.preampvolume;
        if (/^K..$/.test(capdata)) {           // Preamplifier message handling
            if (/^KON$/.test(capdata)) {
                this.status.preampstatus = "ON";
            } else if (/^KOM$/.test(capdata)) {
                this.status.preampstatus = "MUTE";
            } else if (/^KOP$/.test(capdata) || /^KOF$/.test(capdata)) {
                this.status.preampstatus = "STANDBY";
            } else if (/^K\d\d$/.test(capdata)) {
                this.status.preampvolume = Number(capdata.match(/\d\d/));
            } else if (/^KV.$/.test(capdata)) {
                console.log("[AyreLink Interpreter] Detected relative volume change, requesting update");
                this.write("KV?\r");
                return;
            } else {                           // Unrecognized message from Preamp
                return;
            }
            this.status.summary = this.config.devicename + " is " + this.status.preampstatus + " with volume " + this.status.preampvolume;
            if (this.initializing && this.status.preampstatus && this.status.preampvolume) {
                console.log("[AyreLink Interpreter] Initial status received: " + this.status.summary);
                this.initializing = false;
                this.emit('connected');
            } else if (!this.initializing) {
                console.log("[AyreLink Interpreter] " + this.status.summary);
                if (this.status.preampstatus != oldstatus) {
                    this.updatetype = "status";
                } else if (this.status.preampvolume != oldvol) {
                    this.updatetype = "vol"
                }
                this.emit('statusupdate');
            }
        } else if (/^.V.$/.test(capdata) || /^.\d\d$/.test(capdata)) {
            console.log("[AyreLink Interpreter] Detected volume change, requesting update");
            this.write("KV?\r");
        } else if (/^.O.$/.test(capdata)) {
            console.log("[AyreLink Interpreter] Detected status change, requesting update");
            this.write("KO?\r");
        } else {
            return;                            // Unrecognized message from non-preamp AL device code
        }
    });
}

AyreLink.prototype.query_status = function (AL) {
    this.write(AL + "*?\r");    
}

AyreLink.prototype.set_input = function (AL,input) {
    if ((input < 1) || (input > 6)) {
        throw new Error("[AyreLink] Input call "+ input + " is out of range.");
    }
    this.write(AL + "I" + input + "\r" + AL + "I?\r");
}

AyreLink.prototype.set_state = function (AL,state) {
    if ((state != "M") && (state != "F") && (state != "N")) {
        throw new Error("[AyreLink] Operating state " + state + " is invalid.");
    }
    this.write(AL + "O" + state + "\r" + AL + "O?\r");
}

AyreLink.prototype.set_volume = function (AL,vol) {
    let newvol = vol
    if (vol > this.config.volmax) {
        newvol = this.config.volmax;
    } else if (vol < this.config.volmin) {
        newvol = this.config.volmin;
    }
    let stringvol = newvol.toString();
    if (newvol < 10) { stringvol = ("0" + stringvol) };
    this.write(AL + stringvol + "\r" + AL +"V?\r");
}

AyreLink.prototype.volume_down = function (AL) {
    this.write(AL + "VD\r" + AL + "V?\r")
}

AyreLink.prototype.volume_up = function (AL) {
    this.write(AL + "VU\r" + AL + "V?\r");
}


AyreLink.prototype.write = async function (msg) {
    this._port.write(msg);
}

exports = module.exports = AyreLink;