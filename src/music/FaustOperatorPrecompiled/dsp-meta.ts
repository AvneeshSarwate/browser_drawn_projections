export const dspMeta = {
    "name": "oscillator",
    "filename": "oscillator.dsp",
    "version": "2.76.0",
    "compile_options": "-lang wasm-i -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 2",
    "library_list": [
        "/usr/share/faust/stdfaust.lib",
        "/usr/share/faust/oscillators.lib",
        "/usr/share/faust/platform.lib",
        "/usr/share/faust/maths.lib",
        "/usr/share/faust/basics.lib",
        "/usr/share/faust/routes.lib",
        "/usr/share/faust/envelopes.lib"
    ],
    "include_pathnames": [
        "/share/faust",
        "/usr/local/share/faust",
        "/usr/share/faust",
        "."
    ],
    "size": 263168,
    "code": "SHzsAmQWHw==",
    "inputs": 0,
    "outputs": 2,
    "meta": [
        {
            "basics.lib/name": "Faust Basic Element Library"
        },
        {
            "basics.lib/tabulateNd": "Copyright (C) 2023 Bart Brouns <bart@magnetophon.nl>"
        },
        {
            "basics.lib/version": "1.20.0"
        },
        {
            "compile_options": "-lang wasm-i -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 2"
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
            "filename": "oscillator.dsp"
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
            "name": "oscillator"
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
            "routes.lib/name": "Faust Signal Routing Library"
        },
        {
            "routes.lib/version": "1.2.0"
        }
    ],
    "ui": [
        {
            "type": "vgroup",
            "label": "oscillator",
            "items": [
                {
                    "type": "checkbox",
                    "label": "AOn_hold",
                    "shortname": "AOn_hold",
                    "address": "/oscillator/AOn_hold",
                    "index": 262560
                },
                {
                    "type": "hslider",
                    "label": "Frequency",
                    "shortname": "Frequency",
                    "address": "/oscillator/Frequency",
                    "index": 262240,
                    "init": 220,
                    "min": 20,
                    "max": 2000,
                    "step": 0.01
                },
                {
                    "type": "button",
                    "label": "Gate",
                    "shortname": "Gate",
                    "address": "/oscillator/Gate",
                    "index": 262556
                },
                {
                    "type": "hslider",
                    "label": "ModIndex",
                    "shortname": "ModIndex",
                    "address": "/oscillator/ModIndex",
                    "index": 262252,
                    "init": 26,
                    "min": 1,
                    "max": 100,
                    "step": 1
                },
                {
                    "type": "hslider",
                    "label": "PolyGain",
                    "shortname": "PolyGain",
                    "address": "/oscillator/PolyGain",
                    "index": 262152,
                    "init": 0.7,
                    "min": 0,
                    "max": 1,
                    "step": 0.01
                },
                {
                    "type": "hslider",
                    "label": "VelocityAmp",
                    "shortname": "VelocityAmp",
                    "address": "/oscillator/VelocityAmp",
                    "index": 262148,
                    "init": 0.7,
                    "min": 0,
                    "max": 1,
                    "step": 0.01
                },
                {
                    "type": "vgroup",
                    "label": "voice_1",
                    "items": [
                        {
                            "type": "hslider",
                            "label": "xAttack",
                            "shortname": "voice_1_xAttack",
                            "address": "/oscillator/voice_1/xAttack",
                            "index": 263136,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xDecay",
                            "shortname": "voice_1_xDecay",
                            "address": "/oscillator/voice_1/xDecay",
                            "index": 263144,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xRelease",
                            "shortname": "voice_1_xRelease",
                            "address": "/oscillator/voice_1/xRelease",
                            "index": 263148,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xSustain",
                            "shortname": "voice_1_xSustain",
                            "address": "/oscillator/voice_1/xSustain",
                            "index": 263140,
                            "init": 0.8,
                            "min": 0,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "yCoarse",
                            "shortname": "voice_1_yCoarse",
                            "address": "/oscillator/voice_1/yCoarse",
                            "index": 262248,
                            "init": 1,
                            "min": 1,
                            "max": 16,
                            "step": 1
                        },
                        {
                            "type": "hslider",
                            "label": "yFine",
                            "shortname": "voice_1_yFine",
                            "address": "/oscillator/voice_1/yFine",
                            "index": 262244,
                            "init": 0,
                            "min": 0,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "yMod_depth",
                            "shortname": "voice_1_yMod_depth",
                            "address": "/oscillator/voice_1/yMod_depth",
                            "index": 262144,
                            "init": 1,
                            "min": 0,
                            "max": 1,
                            "step": 0.01
                        },
                        {
                            "type": "hgroup",
                            "label": "zHarmonics",
                            "items": [
                                {
                                    "type": "vslider",
                                    "label": "h_0",
                                    "shortname": "voice_1_zHarmonics_h_0",
                                    "address": "/oscillator/voice_1/zHarmonics/h_0",
                                    "index": 262212,
                                    "init": 1,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_1",
                                    "shortname": "voice_1_zHarmonics_h_1",
                                    "address": "/oscillator/voice_1/zHarmonics/h_1",
                                    "index": 262216,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_10",
                                    "shortname": "voice_1_zHarmonics_h_10",
                                    "address": "/oscillator/voice_1/zHarmonics/h_10",
                                    "index": 262176,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_11",
                                    "shortname": "voice_1_zHarmonics_h_11",
                                    "address": "/oscillator/voice_1/zHarmonics/h_11",
                                    "index": 262172,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_12",
                                    "shortname": "voice_1_zHarmonics_h_12",
                                    "address": "/oscillator/voice_1/zHarmonics/h_12",
                                    "index": 262168,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_13",
                                    "shortname": "voice_1_zHarmonics_h_13",
                                    "address": "/oscillator/voice_1/zHarmonics/h_13",
                                    "index": 262164,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_14",
                                    "shortname": "voice_1_zHarmonics_h_14",
                                    "address": "/oscillator/voice_1/zHarmonics/h_14",
                                    "index": 262160,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_15",
                                    "shortname": "voice_1_zHarmonics_h_15",
                                    "address": "/oscillator/voice_1/zHarmonics/h_15",
                                    "index": 262156,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_2",
                                    "shortname": "voice_1_zHarmonics_h_2",
                                    "address": "/oscillator/voice_1/zHarmonics/h_2",
                                    "index": 262208,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_3",
                                    "shortname": "voice_1_zHarmonics_h_3",
                                    "address": "/oscillator/voice_1/zHarmonics/h_3",
                                    "index": 262204,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_4",
                                    "shortname": "voice_1_zHarmonics_h_4",
                                    "address": "/oscillator/voice_1/zHarmonics/h_4",
                                    "index": 262200,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_5",
                                    "shortname": "voice_1_zHarmonics_h_5",
                                    "address": "/oscillator/voice_1/zHarmonics/h_5",
                                    "index": 262196,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_6",
                                    "shortname": "voice_1_zHarmonics_h_6",
                                    "address": "/oscillator/voice_1/zHarmonics/h_6",
                                    "index": 262192,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_7",
                                    "shortname": "voice_1_zHarmonics_h_7",
                                    "address": "/oscillator/voice_1/zHarmonics/h_7",
                                    "index": 262188,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_8",
                                    "shortname": "voice_1_zHarmonics_h_8",
                                    "address": "/oscillator/voice_1/zHarmonics/h_8",
                                    "index": 262184,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_9",
                                    "shortname": "voice_1_zHarmonics_h_9",
                                    "address": "/oscillator/voice_1/zHarmonics/h_9",
                                    "index": 262180,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                }
                            ]
                        }
                    ]
                },
                {
                    "type": "vgroup",
                    "label": "voice_2",
                    "items": [
                        {
                            "type": "hslider",
                            "label": "xAttack",
                            "shortname": "voice_2_xAttack",
                            "address": "/oscillator/voice_2/xAttack",
                            "index": 262992,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xDecay",
                            "shortname": "voice_2_xDecay",
                            "address": "/oscillator/voice_2/xDecay",
                            "index": 263000,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xRelease",
                            "shortname": "voice_2_xRelease",
                            "address": "/oscillator/voice_2/xRelease",
                            "index": 263004,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xSustain",
                            "shortname": "voice_2_xSustain",
                            "address": "/oscillator/voice_2/xSustain",
                            "index": 262996,
                            "init": 0.8,
                            "min": 0,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "yCoarse",
                            "shortname": "voice_2_yCoarse",
                            "address": "/oscillator/voice_2/yCoarse",
                            "index": 262260,
                            "init": 1,
                            "min": 1,
                            "max": 16,
                            "step": 1
                        },
                        {
                            "type": "hslider",
                            "label": "yFine",
                            "shortname": "voice_2_yFine",
                            "address": "/oscillator/voice_2/yFine",
                            "index": 262256,
                            "init": 0,
                            "min": 0,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "yMod_depth",
                            "shortname": "voice_2_yMod_depth",
                            "address": "/oscillator/voice_2/yMod_depth",
                            "index": 262264,
                            "init": 0,
                            "min": 0,
                            "max": 1,
                            "step": 0.01
                        },
                        {
                            "type": "hgroup",
                            "label": "zHarmonics",
                            "items": [
                                {
                                    "type": "vslider",
                                    "label": "h_0",
                                    "shortname": "voice_2_zHarmonics_h_0",
                                    "address": "/oscillator/voice_2/zHarmonics/h_0",
                                    "index": 262268,
                                    "init": 1,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_1",
                                    "shortname": "voice_2_zHarmonics_h_1",
                                    "address": "/oscillator/voice_2/zHarmonics/h_1",
                                    "index": 262812,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_10",
                                    "shortname": "voice_2_zHarmonics_h_10",
                                    "address": "/oscillator/voice_2/zHarmonics/h_10",
                                    "index": 262920,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_11",
                                    "shortname": "voice_2_zHarmonics_h_11",
                                    "address": "/oscillator/voice_2/zHarmonics/h_11",
                                    "index": 262932,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_12",
                                    "shortname": "voice_2_zHarmonics_h_12",
                                    "address": "/oscillator/voice_2/zHarmonics/h_12",
                                    "index": 262944,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_13",
                                    "shortname": "voice_2_zHarmonics_h_13",
                                    "address": "/oscillator/voice_2/zHarmonics/h_13",
                                    "index": 262956,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_14",
                                    "shortname": "voice_2_zHarmonics_h_14",
                                    "address": "/oscillator/voice_2/zHarmonics/h_14",
                                    "index": 262968,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_15",
                                    "shortname": "voice_2_zHarmonics_h_15",
                                    "address": "/oscillator/voice_2/zHarmonics/h_15",
                                    "index": 262980,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_2",
                                    "shortname": "voice_2_zHarmonics_h_2",
                                    "address": "/oscillator/voice_2/zHarmonics/h_2",
                                    "index": 262824,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_3",
                                    "shortname": "voice_2_zHarmonics_h_3",
                                    "address": "/oscillator/voice_2/zHarmonics/h_3",
                                    "index": 262836,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_4",
                                    "shortname": "voice_2_zHarmonics_h_4",
                                    "address": "/oscillator/voice_2/zHarmonics/h_4",
                                    "index": 262848,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_5",
                                    "shortname": "voice_2_zHarmonics_h_5",
                                    "address": "/oscillator/voice_2/zHarmonics/h_5",
                                    "index": 262860,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_6",
                                    "shortname": "voice_2_zHarmonics_h_6",
                                    "address": "/oscillator/voice_2/zHarmonics/h_6",
                                    "index": 262872,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_7",
                                    "shortname": "voice_2_zHarmonics_h_7",
                                    "address": "/oscillator/voice_2/zHarmonics/h_7",
                                    "index": 262884,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_8",
                                    "shortname": "voice_2_zHarmonics_h_8",
                                    "address": "/oscillator/voice_2/zHarmonics/h_8",
                                    "index": 262896,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_9",
                                    "shortname": "voice_2_zHarmonics_h_9",
                                    "address": "/oscillator/voice_2/zHarmonics/h_9",
                                    "index": 262908,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                }
                            ]
                        }
                    ]
                },
                {
                    "type": "vgroup",
                    "label": "voice_3",
                    "items": [
                        {
                            "type": "hslider",
                            "label": "xAttack",
                            "shortname": "voice_3_xAttack",
                            "address": "/oscillator/voice_3/xAttack",
                            "index": 262788,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xDecay",
                            "shortname": "voice_3_xDecay",
                            "address": "/oscillator/voice_3/xDecay",
                            "index": 262796,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xRelease",
                            "shortname": "voice_3_xRelease",
                            "address": "/oscillator/voice_3/xRelease",
                            "index": 262800,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xSustain",
                            "shortname": "voice_3_xSustain",
                            "address": "/oscillator/voice_3/xSustain",
                            "index": 262792,
                            "init": 0.8,
                            "min": 0,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "yCoarse",
                            "shortname": "voice_3_yCoarse",
                            "address": "/oscillator/voice_3/yCoarse",
                            "index": 262276,
                            "init": 1,
                            "min": 1,
                            "max": 16,
                            "step": 1
                        },
                        {
                            "type": "hslider",
                            "label": "yFine",
                            "shortname": "voice_3_yFine",
                            "address": "/oscillator/voice_3/yFine",
                            "index": 262272,
                            "init": 0,
                            "min": 0,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "yMod_depth",
                            "shortname": "voice_3_yMod_depth",
                            "address": "/oscillator/voice_3/yMod_depth",
                            "index": 262280,
                            "init": 0,
                            "min": 0,
                            "max": 1,
                            "step": 0.01
                        },
                        {
                            "type": "hgroup",
                            "label": "zHarmonics",
                            "items": [
                                {
                                    "type": "vslider",
                                    "label": "h_0",
                                    "shortname": "voice_3_zHarmonics_h_0",
                                    "address": "/oscillator/voice_3/zHarmonics/h_0",
                                    "index": 262284,
                                    "init": 1,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_1",
                                    "shortname": "voice_3_zHarmonics_h_1",
                                    "address": "/oscillator/voice_3/zHarmonics/h_1",
                                    "index": 262608,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_10",
                                    "shortname": "voice_3_zHarmonics_h_10",
                                    "address": "/oscillator/voice_3/zHarmonics/h_10",
                                    "index": 262716,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_11",
                                    "shortname": "voice_3_zHarmonics_h_11",
                                    "address": "/oscillator/voice_3/zHarmonics/h_11",
                                    "index": 262728,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_12",
                                    "shortname": "voice_3_zHarmonics_h_12",
                                    "address": "/oscillator/voice_3/zHarmonics/h_12",
                                    "index": 262740,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_13",
                                    "shortname": "voice_3_zHarmonics_h_13",
                                    "address": "/oscillator/voice_3/zHarmonics/h_13",
                                    "index": 262752,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_14",
                                    "shortname": "voice_3_zHarmonics_h_14",
                                    "address": "/oscillator/voice_3/zHarmonics/h_14",
                                    "index": 262764,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_15",
                                    "shortname": "voice_3_zHarmonics_h_15",
                                    "address": "/oscillator/voice_3/zHarmonics/h_15",
                                    "index": 262776,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_2",
                                    "shortname": "voice_3_zHarmonics_h_2",
                                    "address": "/oscillator/voice_3/zHarmonics/h_2",
                                    "index": 262620,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_3",
                                    "shortname": "voice_3_zHarmonics_h_3",
                                    "address": "/oscillator/voice_3/zHarmonics/h_3",
                                    "index": 262632,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_4",
                                    "shortname": "voice_3_zHarmonics_h_4",
                                    "address": "/oscillator/voice_3/zHarmonics/h_4",
                                    "index": 262644,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_5",
                                    "shortname": "voice_3_zHarmonics_h_5",
                                    "address": "/oscillator/voice_3/zHarmonics/h_5",
                                    "index": 262656,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_6",
                                    "shortname": "voice_3_zHarmonics_h_6",
                                    "address": "/oscillator/voice_3/zHarmonics/h_6",
                                    "index": 262668,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_7",
                                    "shortname": "voice_3_zHarmonics_h_7",
                                    "address": "/oscillator/voice_3/zHarmonics/h_7",
                                    "index": 262680,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_8",
                                    "shortname": "voice_3_zHarmonics_h_8",
                                    "address": "/oscillator/voice_3/zHarmonics/h_8",
                                    "index": 262692,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_9",
                                    "shortname": "voice_3_zHarmonics_h_9",
                                    "address": "/oscillator/voice_3/zHarmonics/h_9",
                                    "index": 262704,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                }
                            ]
                        }
                    ]
                },
                {
                    "type": "vgroup",
                    "label": "voice_4",
                    "items": [
                        {
                            "type": "hslider",
                            "label": "xAttack",
                            "shortname": "voice_4_xAttack",
                            "address": "/oscillator/voice_4/xAttack",
                            "index": 262552,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xDecay",
                            "shortname": "voice_4_xDecay",
                            "address": "/oscillator/voice_4/xDecay",
                            "index": 262584,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xRelease",
                            "shortname": "voice_4_xRelease",
                            "address": "/oscillator/voice_4/xRelease",
                            "index": 262588,
                            "init": 0.03,
                            "min": 0.001,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "xSustain",
                            "shortname": "voice_4_xSustain",
                            "address": "/oscillator/voice_4/xSustain",
                            "index": 262580,
                            "init": 0.8,
                            "min": 0,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "yCoarse",
                            "shortname": "voice_4_yCoarse",
                            "address": "/oscillator/voice_4/yCoarse",
                            "index": 262292,
                            "init": 1,
                            "min": 1,
                            "max": 16,
                            "step": 1
                        },
                        {
                            "type": "hslider",
                            "label": "yFine",
                            "shortname": "voice_4_yFine",
                            "address": "/oscillator/voice_4/yFine",
                            "index": 262288,
                            "init": 0,
                            "min": 0,
                            "max": 1,
                            "step": 0.001
                        },
                        {
                            "type": "hslider",
                            "label": "yMod_depth",
                            "shortname": "voice_4_yMod_depth",
                            "address": "/oscillator/voice_4/yMod_depth",
                            "index": 262296,
                            "init": 0,
                            "min": 0,
                            "max": 1,
                            "step": 0.01
                        },
                        {
                            "type": "hgroup",
                            "label": "zHarmonics",
                            "items": [
                                {
                                    "type": "vslider",
                                    "label": "h_0",
                                    "shortname": "voice_4_zHarmonics_h_0",
                                    "address": "/oscillator/voice_4/zHarmonics/h_0",
                                    "index": 262300,
                                    "init": 1,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_1",
                                    "shortname": "voice_4_zHarmonics_h_1",
                                    "address": "/oscillator/voice_4/zHarmonics/h_1",
                                    "index": 262312,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_10",
                                    "shortname": "voice_4_zHarmonics_h_10",
                                    "address": "/oscillator/voice_4/zHarmonics/h_10",
                                    "index": 262456,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_11",
                                    "shortname": "voice_4_zHarmonics_h_11",
                                    "address": "/oscillator/voice_4/zHarmonics/h_11",
                                    "index": 262472,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_12",
                                    "shortname": "voice_4_zHarmonics_h_12",
                                    "address": "/oscillator/voice_4/zHarmonics/h_12",
                                    "index": 262488,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_13",
                                    "shortname": "voice_4_zHarmonics_h_13",
                                    "address": "/oscillator/voice_4/zHarmonics/h_13",
                                    "index": 262504,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_14",
                                    "shortname": "voice_4_zHarmonics_h_14",
                                    "address": "/oscillator/voice_4/zHarmonics/h_14",
                                    "index": 262520,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_15",
                                    "shortname": "voice_4_zHarmonics_h_15",
                                    "address": "/oscillator/voice_4/zHarmonics/h_15",
                                    "index": 262536,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_2",
                                    "shortname": "voice_4_zHarmonics_h_2",
                                    "address": "/oscillator/voice_4/zHarmonics/h_2",
                                    "index": 262328,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_3",
                                    "shortname": "voice_4_zHarmonics_h_3",
                                    "address": "/oscillator/voice_4/zHarmonics/h_3",
                                    "index": 262344,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_4",
                                    "shortname": "voice_4_zHarmonics_h_4",
                                    "address": "/oscillator/voice_4/zHarmonics/h_4",
                                    "index": 262360,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_5",
                                    "shortname": "voice_4_zHarmonics_h_5",
                                    "address": "/oscillator/voice_4/zHarmonics/h_5",
                                    "index": 262376,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_6",
                                    "shortname": "voice_4_zHarmonics_h_6",
                                    "address": "/oscillator/voice_4/zHarmonics/h_6",
                                    "index": 262392,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_7",
                                    "shortname": "voice_4_zHarmonics_h_7",
                                    "address": "/oscillator/voice_4/zHarmonics/h_7",
                                    "index": 262408,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_8",
                                    "shortname": "voice_4_zHarmonics_h_8",
                                    "address": "/oscillator/voice_4/zHarmonics/h_8",
                                    "index": 262424,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                },
                                {
                                    "type": "vslider",
                                    "label": "h_9",
                                    "shortname": "voice_4_zHarmonics_h_9",
                                    "address": "/oscillator/voice_4/zHarmonics/h_9",
                                    "index": 262440,
                                    "init": 0,
                                    "min": 0,
                                    "max": 1,
                                    "step": 0.01
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    ]
}