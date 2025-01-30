export const dspMeta = {
  "name": "FMChorus",
  "filename": "FMChorus.dsp",
  "version": "2.77.3",
  "compile_options": "-lang wasm-i -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 2",
  "library_list": [
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/stdfaust.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/oscillators.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/platform.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/maths.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/basics.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/envelopes.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/filters.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/misceffects.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/delays.lib",
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust/signals.lib"
  ],
  "include_pathnames": [
    "/opt/homebrew/Cellar/faust/2.77.3/share/faust",
    "/usr/local/share/faust",
    "/usr/share/faust",
    "src/music/FMChorusPrecompiled",
    "/Users/avneeshsarwate/browser_drawn_projections/src/music/FMChorusPrecompiled"
  ],
  "size": 8782052,
  "code": "aW1wb3J0KCJzdGRmYXVzdC5saWIiKTsKCi8vYmFzaWMgcGFyYW1ldGVycyBhbGwgdm9pY2VzIG5lZWQgdG8gaGF2ZQpnYXRlID0gYnV0dG9uKCJHYXRlIik7CmZyZXEgPSBoc2xpZGVyKCJGcmVxdWVuY3kiLCA0NDAsIDIwLCAyMDAwLCAxKTsKdkFtcCA9IGhzbGlkZXIoIlZlbG9jaXR5QW1wIiwgMC43LCAwLCAxLCAwLjAxKTsKcmVsZWFzZSA9IGhzbGlkZXIoIlJlbGVhc2UiLCAwLjMsIDAsIDEsIDAuMDEpOwpwb2x5R2FpbiA9IGhzbGlkZXIoIlBvbHlHYWluIiwgMC43LCAwLCAxLCAwLjAxKTsKCgoKLy8gUGFyYW1ldGVycwpkZXB0aCA9IGhzbGlkZXIoImNfRGVwdGggW21zXSIsIDEwLCAxLCA1MCwgMC4xKSAqIG1hLlNSIC8gMTAwMC4wOyAvLyBEZXB0aCBpbiBzYW1wbGVzCnJhdGUgPSBoc2xpZGVyKCJjX1JhdGUgW0h6XSIsIDAuMjUsIDAuMDEsIDUsIDAuMDEpOyAgICAgICAgICAgICAgLy8gTEZPIHJhdGUKbWl4ID0gaHNsaWRlcigiY19NaXggWyVdIiwgNTAsIDAsIDEwMCwgMSkgKiAwLjAxOyAgICAgICAgICAgICAgIC8vIERyeS9XZXQgbWl4CgovLyBMRk8gZm9yIG1vZHVsYXRpb24KbGZvID0gb3Mub3NjKHJhdGUpICogZGVwdGg7IC8vIE1vZHVsYXRpbmcgc2lnbmFsIGZvciBkZWxheQoKLy8gU21vb3RoIGRlbGF5IHdpdGggaW50ZXJwb2xhdGlvbgpjaG9ydXNFZmZlY3QoaW5wdXQpID0gbWl4ICogKGlucHV0IDogZGUuc2RlbGF5KDIgKiBkZXB0aCwgMTI4LCBkZXB0aCArIGxmbykpIAogICAgICAgICAgICAgICAgICAgICAgICArICgxIC0gbWl4KSAqIGlucHV0OwoKCmVjaG9GZGJrID0gaHNsaWRlcigiRWNob0ZkYmsiLCAwLjMsIDAsIDEsIDAuMDEpOwplY2hvVGltZSA9IGhzbGlkZXIoIkVjaG9UaW1lIiwgMC4zLCAwLjAxLCAxMCwgMC4wMSk7CgpkZXR1bmUgPSBoc2xpZGVyKCJEZXR1bmUiLCAxLCAwLCA1MCwgMC4wMSk7Cm1vZFJlbGVhc2UgPSBoc2xpZGVyKCJNb2RSZWxlYXNlIiwgMC4zLCAwLCAxLCAwLjAxKTsKCi8vY3VzdG9tIHBhcmFtZXRlcnMgZm9yIGVhY2ggdm9pY2UKZmlsdGVyRnJlcSA9IGhzbGlkZXIoIkZpbHRlciIsIDMwMDAsIDIwLCAxMDAwMCwgMC4xKTsKCmVudjIgPSBnYXRlIDogZW4uYWRzcigwLjAxLCAwLjEsIDAuMiwgbW9kUmVsZWFzZSk7Cm1vZDAgPSAob3Mub3NjKGZyZXEqMyArIDIqZGV0dW5lKSozICsgb3Mub3NjKGZyZXEqNSArIDgqZGV0dW5lKSo1ICsgb3Mub3NjKGZyZXEqNyArIDE2KmRldHVuZSkqMCkgKiBlbnYyOwoKZW52ID0gZ2F0ZSA6IGVuLmFkc3IoMC4wMSwgMC4xLCAwLjgsIHJlbGVhc2UpOwpmaWx0ZXIgPSBmaS5sb3dwYXNzKDIsIGZpbHRlckZyZXEpOwoKb3NjU2lnID0gb3Mub3NjKGZyZXEgKyBtb2QwICogZnJlcSoyKTsKc2lnID0gb3NjU2lnICAqIHZBbXAgKiBwb2x5R2FpbiAqIGVudiA6IGZpbHRlciA6IGNob3J1c0VmZmVjdCA6IGVmLmVjaG8oMTAsIGVjaG9UaW1lLCBlY2hvRmRiayk7CnByb2Nlc3MgPSBzaWc7",
  "inputs": 0,
  "outputs": 1,
  "meta": [
    {
      "basics.lib/name": "Faust Basic Element Library"
    },
    {
      "basics.lib/tabulateNd": "Copyright (C) 2023 Bart Brouns <bart@magnetophon.nl>"
    },
    {
      "basics.lib/version": "1.21.0"
    },
    {
      "compile_options": "-lang wasm-i -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 2"
    },
    {
      "delays.lib/name": "Faust Delay Library"
    },
    {
      "delays.lib/version": "1.1.0"
    },
    {
      "envelopes.lib/adsr:author": "Yann Orlarey and Andrey Bundin"
    },
    {
      "envelopes.lib/author": "GRAME"
    },
    {
      "envelopes.lib/copyright": "GRAME"
    },
    {
      "envelopes.lib/license": "LGPL with exception"
    },
    {
      "envelopes.lib/name": "Faust Envelope Library"
    },
    {
      "envelopes.lib/version": "1.3.0"
    },
    {
      "filename": "FMChorus.dsp"
    },
    {
      "filters.lib/fir:author": "Julius O. Smith III"
    },
    {
      "filters.lib/fir:copyright": "Copyright (C) 2003-2019 by Julius O. Smith III <jos@ccrma.stanford.edu>"
    },
    {
      "filters.lib/fir:license": "MIT-style STK-4.3 license"
    },
    {
      "filters.lib/iir:author": "Julius O. Smith III"
    },
    {
      "filters.lib/iir:copyright": "Copyright (C) 2003-2019 by Julius O. Smith III <jos@ccrma.stanford.edu>"
    },
    {
      "filters.lib/iir:license": "MIT-style STK-4.3 license"
    },
    {
      "filters.lib/lowpass0_highpass1": "MIT-style STK-4.3 license"
    },
    {
      "filters.lib/lowpass0_highpass1:author": "Julius O. Smith III"
    },
    {
      "filters.lib/lowpass:author": "Julius O. Smith III"
    },
    {
      "filters.lib/lowpass:copyright": "Copyright (C) 2003-2019 by Julius O. Smith III <jos@ccrma.stanford.edu>"
    },
    {
      "filters.lib/lowpass:license": "MIT-style STK-4.3 license"
    },
    {
      "filters.lib/name": "Faust Filters Library"
    },
    {
      "filters.lib/tf2:author": "Julius O. Smith III"
    },
    {
      "filters.lib/tf2:copyright": "Copyright (C) 2003-2019 by Julius O. Smith III <jos@ccrma.stanford.edu>"
    },
    {
      "filters.lib/tf2:license": "MIT-style STK-4.3 license"
    },
    {
      "filters.lib/tf2s:author": "Julius O. Smith III"
    },
    {
      "filters.lib/tf2s:copyright": "Copyright (C) 2003-2019 by Julius O. Smith III <jos@ccrma.stanford.edu>"
    },
    {
      "filters.lib/tf2s:license": "MIT-style STK-4.3 license"
    },
    {
      "filters.lib/version": "1.6.0"
    },
    {
      "maths.lib/author": "GRAME"
    },
    {
      "maths.lib/copyright": "GRAME"
    },
    {
      "maths.lib/license": "LGPL with exception"
    },
    {
      "maths.lib/name": "Faust Math Library"
    },
    {
      "maths.lib/version": "2.8.1"
    },
    {
      "misceffects.lib/echo:author": "Romain Michon"
    },
    {
      "misceffects.lib/name": "Misc Effects Library"
    },
    {
      "misceffects.lib/version": "2.5.0"
    },
    {
      "name": "FMChorus"
    },
    {
      "oscillators.lib/name": "Faust Oscillator Library"
    },
    {
      "oscillators.lib/version": "1.5.1"
    },
    {
      "platform.lib/name": "Generic Platform Library"
    },
    {
      "platform.lib/version": "1.3.0"
    },
    {
      "signals.lib/name": "Faust Signal Routing Library"
    },
    {
      "signals.lib/version": "1.6.0"
    }
  ],
  "ui": [
    {
      "type": "vgroup",
      "label": "FMChorus",
      "items": [
        {
          "type": "hslider",
          "label": "Detune",
          "varname": "fHslider5",
          "shortname": "Detune",
          "address": "/FMChorus/Detune",
          "index": 262188,
          "init": 1,
          "min": 0,
          "max": 50,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "EchoFdbk",
          "varname": "fHslider8",
          "shortname": "EchoFdbk",
          "address": "/FMChorus/EchoFdbk",
          "index": 262284,
          "init": 0.3,
          "min": 0,
          "max": 1,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "EchoTime",
          "varname": "fHslider9",
          "shortname": "EchoTime",
          "address": "/FMChorus/EchoTime",
          "index": 262296,
          "init": 0.3,
          "min": 0.01,
          "max": 10,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "Filter",
          "varname": "fHslider1",
          "shortname": "Filter",
          "address": "/FMChorus/Filter",
          "index": 262160,
          "init": 3000,
          "min": 20,
          "max": 10000,
          "step": 0.1
        },
        {
          "type": "hslider",
          "label": "Frequency",
          "varname": "fHslider4",
          "shortname": "Frequency",
          "address": "/FMChorus/Frequency",
          "index": 262184,
          "init": 440,
          "min": 20,
          "max": 2000,
          "step": 1
        },
        {
          "type": "button",
          "label": "Gate",
          "varname": "fButton0",
          "shortname": "Gate",
          "address": "/FMChorus/Gate",
          "index": 262216
        },
        {
          "type": "hslider",
          "label": "ModRelease",
          "varname": "fHslider6",
          "shortname": "ModRelease",
          "address": "/FMChorus/ModRelease",
          "index": 262244,
          "init": 0.3,
          "min": 0,
          "max": 1,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "PolyGain",
          "varname": "fHslider3",
          "shortname": "PolyGain",
          "address": "/FMChorus/PolyGain",
          "index": 262168,
          "init": 0.7,
          "min": 0,
          "max": 1,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "Release",
          "varname": "fHslider7",
          "shortname": "Release",
          "address": "/FMChorus/Release",
          "index": 262268,
          "init": 0.3,
          "min": 0,
          "max": 1,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "VelocityAmp",
          "varname": "fHslider2",
          "shortname": "VelocityAmp",
          "address": "/FMChorus/VelocityAmp",
          "index": 262164,
          "init": 0.7,
          "min": 0,
          "max": 1,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "c_Depth",
          "varname": "fHslider10",
          "shortname": "c_Depth",
          "address": "/FMChorus/c_Depth",
          "index": 393376,
          "meta": [
            {
              "ms": ""
            }
          ],
          "init": 10,
          "min": 1,
          "max": 50,
          "step": 0.1
        },
        {
          "type": "hslider",
          "label": "c_Mix",
          "varname": "fHslider0",
          "shortname": "c_Mix",
          "address": "/FMChorus/c_Mix",
          "index": 262144,
          "meta": [
            {
              "%": ""
            }
          ],
          "init": 50,
          "min": 0,
          "max": 100,
          "step": 1
        },
        {
          "type": "hslider",
          "label": "c_Rate",
          "varname": "fHslider11",
          "shortname": "c_Rate",
          "address": "/FMChorus/c_Rate",
          "index": 393384,
          "meta": [
            {
              "Hz": ""
            }
          ],
          "init": 0.25,
          "min": 0.01,
          "max": 5,
          "step": 0.01
        }
      ]
    }
  ]
}