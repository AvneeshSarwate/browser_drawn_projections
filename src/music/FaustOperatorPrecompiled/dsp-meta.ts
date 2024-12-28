export const dspMeta = {
  "name": "operator",
  "filename": "operator.dsp",
  "version": "2.72.14",
  "compile_options": "-lang wasm-i -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0",
  "library_list": [
    "/opt/homebrew/Cellar/faust/2.72.14_2/share/faust/stdfaust.lib",
    "/opt/homebrew/Cellar/faust/2.72.14_2/share/faust/oscillators.lib",
    "/opt/homebrew/Cellar/faust/2.72.14_2/share/faust/platform.lib",
    "/opt/homebrew/Cellar/faust/2.72.14_2/share/faust/maths.lib",
    "/opt/homebrew/Cellar/faust/2.72.14_2/share/faust/basics.lib",
    "/opt/homebrew/Cellar/faust/2.72.14_2/share/faust/routes.lib",
    "/opt/homebrew/Cellar/faust/2.72.14_2/share/faust/envelopes.lib"
  ],
  "include_pathnames": [
    "/opt/homebrew/Cellar/faust/2.72.14_2/share/faust",
    "/usr/local/share/faust",
    "/usr/share/faust",
    "src/music/FaustOperatorPrecompiled",
    "/Users/avneeshsarwate/browser_drawn_projections/src/music/FaustOperatorPrecompiled"
  ],
  "size": 263172,
  "code": "Ly9jb21waWxlIHdpdGg6IGZhdXN0IC1sYW5nIHdhc20taSBzcmMvbXVzaWMvRmF1c3RPcGVyYXRvclByZWNvbXBpbGVkL29wZXJhdG9yLmRzcCAtbyBvcGVyYXRvci53YXNtIChvcHRpb25hbGx5IC1mdHogMiB0byBtYXRjaCBGYXVzdElERSBjbG91ZCBjb21waWxlciBvdXRwdXQpCi8vYWxzbyBuZWVkIHRvIHVwZGF0ZSBkc3AtbWV0YS50cyB3aXRoIHRoZSBuZXcgZ2VuZXJhdGVkIGRzcC1tZXRhLmpzb24KCgovL3JlbWVtYmVyIHRvIHR1cm4gb2ZmIGFsaWFzaW5nLCBpbnRlcnBvbGF0aW9uLCBhbmQgZGVmYXVsdCBvbiBmaWx0ZXIgaW4gb3BlcmF0b3IKLy90b2RvIC0gYWRkIHZlbG9jaXR5IHNlbnNpdGl2aXR5IHRvIG1vZHVsYXRvciBlbnZlbG9wZXMKCmltcG9ydCgic3RkZmF1c3QubGliIik7CgpuSGFybW9uaWNzID0gMTY7ICAvLyBDaGFuZ2UgdGhpcyBudW1iZXIgdG8gZXhwZXJpbWVudCB3aXRoIGRpZmZlcmVudCBudW1iZXJzIG9mIGhhcm1vbmljcwptb2RJbmRleCA9IGhzbGlkZXIoIk1vZEluZGV4IiwgMjEsIDEsIDEwMCwgMSk7CgoKdCA9IGJ1dHRvbigiR2F0ZSIpIHwgY2hlY2tib3goIkFPbl9ob2xkIik7Ci8vIGJhc2VGcmVxID0gYmEubWlkaWtleTJoeihoc2xpZGVyKCJBTWlkaU5vdGUiLCA2MCwgMSwgMTI3LCAxKSk7CmJhc2VGcmVxID0gaHNsaWRlcigiRnJlcXVlbmN5IiwgMjIwLCAyMCwgMjAwMCwgMC4wMSk7CnZBbXAgPSBoc2xpZGVyKCJWZWxvY2l0eUFtcCIsIDAuNywgMCwgMSwgMC4wMSk7CnJlbGVhc2UgPSBoc2xpZGVyKCJSZWxlYXNlIiwgMC4zLCAwLCAxLCAwLjAxKTsKcG9seUdhaW4gPSBoc2xpZGVyKCJQb2x5R2FpbiIsIDAuNywgMCwgMSwgMC4wMSk7Cm1vZEN1cnZlID0gaHNsaWRlcigiTW9kQ3VydmUiLCAxLCAwLjAxLCAxMCwgMC4wMSk7CgoKCmhhcm1vbmljX29wZXJhdG9yKG1vZHVsYXRvciwgaW5kLCBpc0VuZCkgPSBzdW1TaWduYWxzCndpdGggewogICAgdmcoeCkgPSB2Z3JvdXAoInZvaWNlXyVpbmQiLHgpOwogICAgbW9kRGVwdGhDb250cm9sID0gdmcoaHNsaWRlcigieU1vZF9kZXB0aCIsIGJhLmlmKGlzRW5kLCAxLCAwKSwgMCwgMSwgMC4wMSkpOwogICAgZmluZSA9IHZnKGhzbGlkZXIoInlGaW5lIiwgMCwgMCwgMSwgMC4wMDEpKTsKICAgIGNvYXJzZSA9IHZnKGhzbGlkZXIoInlDb2Fyc2UiLCAxLCAxLCAxNiwgMSkpOwogICAgZk11bHQgPSBmaW5lICsgY29hcnNlOwogICAgbXVsdEZyZXEgPSBiYXNlRnJlcSAqIGZNdWx0OwogICAgbW9kRGVwdGggPSAoYmEubGluMkxvZ0dhaW4obW9kRGVwdGhDb250cm9sKV5tb2RDdXJ2ZSkgKiBiYS5pZihpc0VuZCwgMSwgKG1vZEluZGV4ICogbXVsdEZyZXEpKTsgLy9kb24ndCBuZWVkIHRvIHVzZSBtb2RJbmRleCBmb3IgbGFzdCBvcGVyYXRvciBpbiBjaGFpbgogICAgLy90b2RvIC0gc29tZXRoaW5nIGFib3V0IGxvZyBzY2FsaW5nIGhlcmUgZG9lc24ndCBtYXRjaCBhYmxldG9uCgogICAgaEdyb3VwKHgpID0gdmcoaGdyb3VwKCJ6SGFybW9uaWNzIix4KSk7CiAgICBoYXJtb25pY0xldmVscyA9IHBhcihpLCBuSGFybW9uaWNzLCBoR3JvdXAodnNsaWRlcigiaF8laSIsIGk9PTAsIDAsIDEsIDAuMDEpKSk7CiAgICB0b3RhbFdlaWdodCA9IGhhcm1vbmljTGV2ZWxzIDo+IF87CgogICAgaGFybW9uaWNzID0gcGFyKGksIG5IYXJtb25pY3MsIG9zLm9zYygobXVsdEZyZXErbW9kdWxhdG9yKSAqIGZsb2F0KGkgKyAxKSkpOyAvLyBHZW5lcmF0ZSBoYXJtb25pYyBmcmVxdWVuY2llcwoKICAgIHdlaWdodGVkU2lnbmFscyA9IChoYXJtb25pY3MsIGhhcm1vbmljTGV2ZWxzKSA6IHJvLmludGVybGVhdmUobkhhcm1vbmljcywyKSA6IHBhcihpLG5IYXJtb25pY3MsKik7IC8vIE1ha2Ugc3VyZSBzaWduYWxzIGFyZSBwcm9wZXJseSBwYWlyZWQgYmVmb3JlIG11bHRpcGxpY2F0aW9uCiAgICBhMiA9IHZnKGhzbGlkZXIoInhBdHRhY2siLCAwLjAzLCAwLjAwMSwgMSwgLjAwMSkpOwogICAgZDIgPSB2Zyhoc2xpZGVyKCJ4RGVjYXkiLCAwLjAzLCAwLjAwMSwgMSwgLjAwMSkpOwogICAgczIgPSB2Zyhoc2xpZGVyKCJ4U3VzdGFpbiIsIDAuOCwgMCwgMSwgMC4wMDEpKTsgLy90b2RvIC0gbGluMmxvZyB0aGlzPwogICAgcjIgPSB2Zyhoc2xpZGVyKCJ4UmVsZWFzZSIsIDAuMDMsIDAuMDAxLCAxLCAuMDAxKSk7CiAgICBlbnYyID0gZW4uYWRzcihhMiwgZDIsIHMyLCByMiwgdCk7CiAgICBzdW1TaWduYWxzID0gd2VpZ2h0ZWRTaWduYWxzIDo+IF8gLyBiYS5pZihpc0VuZCwgdG90YWxXZWlnaHQsIDEpICogbW9kRGVwdGggKiBlbnYyOyAvL2Rvbid0IG5vcm1hbGl6ZSBoYXJtb25pYyBzdW0gZXhjZXB0IGF0IGxhc3Qgb3BlcmF0b3IgLSB0b2RvIC0gcHJvYnMgbmVlZCB0byBhdHRlbnR1YXRlIHN1bSBhIGJpdCAoc3FydD8pLCBidXQgbm90IGEgdG9uCn07CgoKdjQgPSBoYXJtb25pY19vcGVyYXRvcigwLCA0LCAwKTsKdjMgPSBoYXJtb25pY19vcGVyYXRvcih2NCwgMywgMCk7CnYyID0gaGFybW9uaWNfb3BlcmF0b3IodjMsIDIsIDApOwp2MSA9IGhhcm1vbmljX29wZXJhdG9yKHYyLCAxLCAxKTsKCgpvdXRTaWduYWwgPSB2MSAqIHZBbXAgKiBwb2x5R2FpbjsKCgoKcHJvY2VzcyA9IG91dFNpZ25hbCwgb3V0U2lnbmFsOw==",
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
      "basics.lib/version": "1.15.0"
    },
    {
      "compile_options": "-lang wasm-i -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0"
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
      "filename": "operator.dsp"
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
      "maths.lib/version": "2.8.0"
    },
    {
      "name": "operator"
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
      "label": "operator",
      "items": [
        {
          "type": "checkbox",
          "label": "AOn_hold",
          "shortname": "AOn_hold",
          "address": "/operator/AOn_hold",
          "index": 262564
        },
        {
          "type": "hslider",
          "label": "Frequency",
          "shortname": "Frequency",
          "address": "/operator/Frequency",
          "index": 262244,
          "init": 220,
          "min": 20,
          "max": 2000,
          "step": 0.01
        },
        {
          "type": "button",
          "label": "Gate",
          "shortname": "Gate",
          "address": "/operator/Gate",
          "index": 262560
        },
        {
          "type": "hslider",
          "label": "ModCurve",
          "shortname": "ModCurve",
          "address": "/operator/ModCurve",
          "index": 262156,
          "init": 1,
          "min": 0.01,
          "max": 10,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "ModIndex",
          "shortname": "ModIndex",
          "address": "/operator/ModIndex",
          "index": 262256,
          "init": 21,
          "min": 1,
          "max": 100,
          "step": 1
        },
        {
          "type": "hslider",
          "label": "PolyGain",
          "shortname": "PolyGain",
          "address": "/operator/PolyGain",
          "index": 262148,
          "init": 0.7,
          "min": 0,
          "max": 1,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "VelocityAmp",
          "shortname": "VelocityAmp",
          "address": "/operator/VelocityAmp",
          "index": 262144,
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
              "address": "/operator/voice_1/xAttack",
              "index": 263140,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xDecay",
              "shortname": "voice_1_xDecay",
              "address": "/operator/voice_1/xDecay",
              "index": 263148,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xRelease",
              "shortname": "voice_1_xRelease",
              "address": "/operator/voice_1/xRelease",
              "index": 263152,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xSustain",
              "shortname": "voice_1_xSustain",
              "address": "/operator/voice_1/xSustain",
              "index": 263144,
              "init": 0.8,
              "min": 0,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "yCoarse",
              "shortname": "voice_1_yCoarse",
              "address": "/operator/voice_1/yCoarse",
              "index": 262252,
              "init": 1,
              "min": 1,
              "max": 16,
              "step": 1
            },
            {
              "type": "hslider",
              "label": "yFine",
              "shortname": "voice_1_yFine",
              "address": "/operator/voice_1/yFine",
              "index": 262248,
              "init": 0,
              "min": 0,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "yMod_depth",
              "shortname": "voice_1_yMod_depth",
              "address": "/operator/voice_1/yMod_depth",
              "index": 262152,
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
                  "address": "/operator/voice_1/zHarmonics/h_0",
                  "index": 262216,
                  "init": 1,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_1",
                  "shortname": "voice_1_zHarmonics_h_1",
                  "address": "/operator/voice_1/zHarmonics/h_1",
                  "index": 262220,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_10",
                  "shortname": "voice_1_zHarmonics_h_10",
                  "address": "/operator/voice_1/zHarmonics/h_10",
                  "index": 262180,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_11",
                  "shortname": "voice_1_zHarmonics_h_11",
                  "address": "/operator/voice_1/zHarmonics/h_11",
                  "index": 262176,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_12",
                  "shortname": "voice_1_zHarmonics_h_12",
                  "address": "/operator/voice_1/zHarmonics/h_12",
                  "index": 262172,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_13",
                  "shortname": "voice_1_zHarmonics_h_13",
                  "address": "/operator/voice_1/zHarmonics/h_13",
                  "index": 262168,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_14",
                  "shortname": "voice_1_zHarmonics_h_14",
                  "address": "/operator/voice_1/zHarmonics/h_14",
                  "index": 262164,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_15",
                  "shortname": "voice_1_zHarmonics_h_15",
                  "address": "/operator/voice_1/zHarmonics/h_15",
                  "index": 262160,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_2",
                  "shortname": "voice_1_zHarmonics_h_2",
                  "address": "/operator/voice_1/zHarmonics/h_2",
                  "index": 262212,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_3",
                  "shortname": "voice_1_zHarmonics_h_3",
                  "address": "/operator/voice_1/zHarmonics/h_3",
                  "index": 262208,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_4",
                  "shortname": "voice_1_zHarmonics_h_4",
                  "address": "/operator/voice_1/zHarmonics/h_4",
                  "index": 262204,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_5",
                  "shortname": "voice_1_zHarmonics_h_5",
                  "address": "/operator/voice_1/zHarmonics/h_5",
                  "index": 262200,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_6",
                  "shortname": "voice_1_zHarmonics_h_6",
                  "address": "/operator/voice_1/zHarmonics/h_6",
                  "index": 262196,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_7",
                  "shortname": "voice_1_zHarmonics_h_7",
                  "address": "/operator/voice_1/zHarmonics/h_7",
                  "index": 262192,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_8",
                  "shortname": "voice_1_zHarmonics_h_8",
                  "address": "/operator/voice_1/zHarmonics/h_8",
                  "index": 262188,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_9",
                  "shortname": "voice_1_zHarmonics_h_9",
                  "address": "/operator/voice_1/zHarmonics/h_9",
                  "index": 262184,
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
              "address": "/operator/voice_2/xAttack",
              "index": 262996,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xDecay",
              "shortname": "voice_2_xDecay",
              "address": "/operator/voice_2/xDecay",
              "index": 263004,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xRelease",
              "shortname": "voice_2_xRelease",
              "address": "/operator/voice_2/xRelease",
              "index": 263008,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xSustain",
              "shortname": "voice_2_xSustain",
              "address": "/operator/voice_2/xSustain",
              "index": 263000,
              "init": 0.8,
              "min": 0,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "yCoarse",
              "shortname": "voice_2_yCoarse",
              "address": "/operator/voice_2/yCoarse",
              "index": 262264,
              "init": 1,
              "min": 1,
              "max": 16,
              "step": 1
            },
            {
              "type": "hslider",
              "label": "yFine",
              "shortname": "voice_2_yFine",
              "address": "/operator/voice_2/yFine",
              "index": 262260,
              "init": 0,
              "min": 0,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "yMod_depth",
              "shortname": "voice_2_yMod_depth",
              "address": "/operator/voice_2/yMod_depth",
              "index": 262268,
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
                  "address": "/operator/voice_2/zHarmonics/h_0",
                  "index": 262960,
                  "init": 1,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_1",
                  "shortname": "voice_2_zHarmonics_h_1",
                  "address": "/operator/voice_2/zHarmonics/h_1",
                  "index": 262948,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_10",
                  "shortname": "voice_2_zHarmonics_h_10",
                  "address": "/operator/voice_2/zHarmonics/h_10",
                  "index": 262840,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_11",
                  "shortname": "voice_2_zHarmonics_h_11",
                  "address": "/operator/voice_2/zHarmonics/h_11",
                  "index": 262828,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_12",
                  "shortname": "voice_2_zHarmonics_h_12",
                  "address": "/operator/voice_2/zHarmonics/h_12",
                  "index": 262816,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_13",
                  "shortname": "voice_2_zHarmonics_h_13",
                  "address": "/operator/voice_2/zHarmonics/h_13",
                  "index": 262272,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_14",
                  "shortname": "voice_2_zHarmonics_h_14",
                  "address": "/operator/voice_2/zHarmonics/h_14",
                  "index": 262972,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_15",
                  "shortname": "voice_2_zHarmonics_h_15",
                  "address": "/operator/voice_2/zHarmonics/h_15",
                  "index": 262984,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_2",
                  "shortname": "voice_2_zHarmonics_h_2",
                  "address": "/operator/voice_2/zHarmonics/h_2",
                  "index": 262936,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_3",
                  "shortname": "voice_2_zHarmonics_h_3",
                  "address": "/operator/voice_2/zHarmonics/h_3",
                  "index": 262924,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_4",
                  "shortname": "voice_2_zHarmonics_h_4",
                  "address": "/operator/voice_2/zHarmonics/h_4",
                  "index": 262912,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_5",
                  "shortname": "voice_2_zHarmonics_h_5",
                  "address": "/operator/voice_2/zHarmonics/h_5",
                  "index": 262900,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_6",
                  "shortname": "voice_2_zHarmonics_h_6",
                  "address": "/operator/voice_2/zHarmonics/h_6",
                  "index": 262888,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_7",
                  "shortname": "voice_2_zHarmonics_h_7",
                  "address": "/operator/voice_2/zHarmonics/h_7",
                  "index": 262876,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_8",
                  "shortname": "voice_2_zHarmonics_h_8",
                  "address": "/operator/voice_2/zHarmonics/h_8",
                  "index": 262864,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_9",
                  "shortname": "voice_2_zHarmonics_h_9",
                  "address": "/operator/voice_2/zHarmonics/h_9",
                  "index": 262852,
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
              "address": "/operator/voice_3/xAttack",
              "index": 262792,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xDecay",
              "shortname": "voice_3_xDecay",
              "address": "/operator/voice_3/xDecay",
              "index": 262800,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xRelease",
              "shortname": "voice_3_xRelease",
              "address": "/operator/voice_3/xRelease",
              "index": 262804,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xSustain",
              "shortname": "voice_3_xSustain",
              "address": "/operator/voice_3/xSustain",
              "index": 262796,
              "init": 0.8,
              "min": 0,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "yCoarse",
              "shortname": "voice_3_yCoarse",
              "address": "/operator/voice_3/yCoarse",
              "index": 262284,
              "init": 1,
              "min": 1,
              "max": 16,
              "step": 1
            },
            {
              "type": "hslider",
              "label": "yFine",
              "shortname": "voice_3_yFine",
              "address": "/operator/voice_3/yFine",
              "index": 262280,
              "init": 0,
              "min": 0,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "yMod_depth",
              "shortname": "voice_3_yMod_depth",
              "address": "/operator/voice_3/yMod_depth",
              "index": 262288,
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
                  "address": "/operator/voice_3/zHarmonics/h_0",
                  "index": 262696,
                  "init": 1,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_1",
                  "shortname": "voice_3_zHarmonics_h_1",
                  "address": "/operator/voice_3/zHarmonics/h_1",
                  "index": 262684,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_10",
                  "shortname": "voice_3_zHarmonics_h_10",
                  "address": "/operator/voice_3/zHarmonics/h_10",
                  "index": 262720,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_11",
                  "shortname": "voice_3_zHarmonics_h_11",
                  "address": "/operator/voice_3/zHarmonics/h_11",
                  "index": 262732,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_12",
                  "shortname": "voice_3_zHarmonics_h_12",
                  "address": "/operator/voice_3/zHarmonics/h_12",
                  "index": 262744,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_13",
                  "shortname": "voice_3_zHarmonics_h_13",
                  "address": "/operator/voice_3/zHarmonics/h_13",
                  "index": 262756,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_14",
                  "shortname": "voice_3_zHarmonics_h_14",
                  "address": "/operator/voice_3/zHarmonics/h_14",
                  "index": 262768,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_15",
                  "shortname": "voice_3_zHarmonics_h_15",
                  "address": "/operator/voice_3/zHarmonics/h_15",
                  "index": 262780,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_2",
                  "shortname": "voice_3_zHarmonics_h_2",
                  "address": "/operator/voice_3/zHarmonics/h_2",
                  "index": 262672,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_3",
                  "shortname": "voice_3_zHarmonics_h_3",
                  "address": "/operator/voice_3/zHarmonics/h_3",
                  "index": 262660,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_4",
                  "shortname": "voice_3_zHarmonics_h_4",
                  "address": "/operator/voice_3/zHarmonics/h_4",
                  "index": 262648,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_5",
                  "shortname": "voice_3_zHarmonics_h_5",
                  "address": "/operator/voice_3/zHarmonics/h_5",
                  "index": 262636,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_6",
                  "shortname": "voice_3_zHarmonics_h_6",
                  "address": "/operator/voice_3/zHarmonics/h_6",
                  "index": 262624,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_7",
                  "shortname": "voice_3_zHarmonics_h_7",
                  "address": "/operator/voice_3/zHarmonics/h_7",
                  "index": 262612,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_8",
                  "shortname": "voice_3_zHarmonics_h_8",
                  "address": "/operator/voice_3/zHarmonics/h_8",
                  "index": 262292,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_9",
                  "shortname": "voice_3_zHarmonics_h_9",
                  "address": "/operator/voice_3/zHarmonics/h_9",
                  "index": 262708,
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
              "address": "/operator/voice_4/xAttack",
              "index": 262556,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xDecay",
              "shortname": "voice_4_xDecay",
              "address": "/operator/voice_4/xDecay",
              "index": 262588,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xRelease",
              "shortname": "voice_4_xRelease",
              "address": "/operator/voice_4/xRelease",
              "index": 262592,
              "init": 0.03,
              "min": 0.001,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xSustain",
              "shortname": "voice_4_xSustain",
              "address": "/operator/voice_4/xSustain",
              "index": 262584,
              "init": 0.8,
              "min": 0,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "yCoarse",
              "shortname": "voice_4_yCoarse",
              "address": "/operator/voice_4/yCoarse",
              "index": 262304,
              "init": 1,
              "min": 1,
              "max": 16,
              "step": 1
            },
            {
              "type": "hslider",
              "label": "yFine",
              "shortname": "voice_4_yFine",
              "address": "/operator/voice_4/yFine",
              "index": 262300,
              "init": 0,
              "min": 0,
              "max": 1,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "yMod_depth",
              "shortname": "voice_4_yMod_depth",
              "address": "/operator/voice_4/yMod_depth",
              "index": 262308,
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
                  "address": "/operator/voice_4/zHarmonics/h_0",
                  "index": 262376,
                  "init": 1,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_1",
                  "shortname": "voice_4_zHarmonics_h_1",
                  "address": "/operator/voice_4/zHarmonics/h_1",
                  "index": 262360,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_10",
                  "shortname": "voice_4_zHarmonics_h_10",
                  "address": "/operator/voice_4/zHarmonics/h_10",
                  "index": 262464,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_11",
                  "shortname": "voice_4_zHarmonics_h_11",
                  "address": "/operator/voice_4/zHarmonics/h_11",
                  "index": 262480,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_12",
                  "shortname": "voice_4_zHarmonics_h_12",
                  "address": "/operator/voice_4/zHarmonics/h_12",
                  "index": 262496,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_13",
                  "shortname": "voice_4_zHarmonics_h_13",
                  "address": "/operator/voice_4/zHarmonics/h_13",
                  "index": 262512,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_14",
                  "shortname": "voice_4_zHarmonics_h_14",
                  "address": "/operator/voice_4/zHarmonics/h_14",
                  "index": 262524,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_15",
                  "shortname": "voice_4_zHarmonics_h_15",
                  "address": "/operator/voice_4/zHarmonics/h_15",
                  "index": 262540,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_2",
                  "shortname": "voice_4_zHarmonics_h_2",
                  "address": "/operator/voice_4/zHarmonics/h_2",
                  "index": 262344,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_3",
                  "shortname": "voice_4_zHarmonics_h_3",
                  "address": "/operator/voice_4/zHarmonics/h_3",
                  "index": 262328,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_4",
                  "shortname": "voice_4_zHarmonics_h_4",
                  "address": "/operator/voice_4/zHarmonics/h_4",
                  "index": 262312,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_5",
                  "shortname": "voice_4_zHarmonics_h_5",
                  "address": "/operator/voice_4/zHarmonics/h_5",
                  "index": 262388,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_6",
                  "shortname": "voice_4_zHarmonics_h_6",
                  "address": "/operator/voice_4/zHarmonics/h_6",
                  "index": 262404,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_7",
                  "shortname": "voice_4_zHarmonics_h_7",
                  "address": "/operator/voice_4/zHarmonics/h_7",
                  "index": 262420,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_8",
                  "shortname": "voice_4_zHarmonics_h_8",
                  "address": "/operator/voice_4/zHarmonics/h_8",
                  "index": 262436,
                  "init": 0,
                  "min": 0,
                  "max": 1,
                  "step": 0.01
                },
                {
                  "type": "vslider",
                  "label": "h_9",
                  "shortname": "voice_4_zHarmonics_h_9",
                  "address": "/operator/voice_4/zHarmonics/h_9",
                  "index": 262448,
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