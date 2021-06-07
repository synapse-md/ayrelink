"use strict";

const AyreLink              = require('./ayrelink-lib');
      
let mysettings = {
        serialport:     "COM1",
        model:          "KX-5",
        modelver:        true
};
if (mysettings.modelver) { mysettings.modelname = mysettings.model + " Twenty" } else { mysettings.modelname = mysettings.model };

function changesettings () {
    let oldmodel = mysettings.model;
    let oldmodelver = mysettings.modelver;
    let oldport = mysettings.serialport;
    
    mysettings = {
        serialport:     "COM2",
        model:          "KX-5",
        modelver:        false
    };
    if (mysettings.modelver) { mysettings.modelname = mysettings.model + " Twenty" } else { mysettings.modelname = mysettings.model };

    let force = true;
    if (oldmodel != mysettings.model) force = true;
    if (oldmodelver != mysettings.modelver) force = true;
    if (oldport != mysettings.serialport) force = true;
    if (force) {
        console.log("[Test] Settings have changed.");
        ayrelinkstart();
    }
}

let ayrelink = { };
ayrelink.control = new AyreLink();

function ayrelinkstart() {
    ayrelink.control.start(mysettings)
        .then(() => console.log("[Test] Started AyreLink to " + mysettings.modelname + " on " + mysettings.serialport + "..."))
        .catch(error => console.log("[Test] Failed to start new AyreLink"));

    ayrelink.control.on('connected', ev_connected);
}

ayrelinkstart();

function ev_connected() {
    let control = ayrelink.control;

    console.log("[AyreLink Extension] Found " + control.config.devicename);

    control.set_volume("K",9);
    control.set_status("K","M");
    control.set_status("K","N");    
    control.set_input("K",1);
}