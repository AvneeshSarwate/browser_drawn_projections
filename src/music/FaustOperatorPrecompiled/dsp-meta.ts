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
  "size": 263188,
  "code": "Ly9jb21waWxlIHdpdGg6IGZhdXN0IC1sYW5nIHdhc20taSBzcmMvbXVzaWMvRmF1c3RPcGVyYXRvclByZWNvbXBpbGVkL29wZXJhdG9yLmRzcCAtbyBvcGVyYXRvci53YXNtIChvcHRpb25hbGx5IC1mdHogMiB0byBtYXRjaCBGYXVzdElERSBjbG91ZCBjb21waWxlciBvdXRwdXQpCi8vYWxzbyBuZWVkIHRvIHVwZGF0ZSBkc3AtbWV0YS50cyB3aXRoIHRoZSBuZXcgZ2VuZXJhdGVkIGRzcC1tZXRhLmpzb24KCi8vIHNldHRpbmdzIGZvciBvcGVyYXRvcjoKLy9yZW1lbWJlciB0byB0dXJuIG9mZiBhbGlhc2luZywgaW50ZXJwb2xhdGlvbiBPTiwgYW5kIGRlZmF1bHQgb24gZmlsdGVyIGluIG9wZXJhdG9yCi8vc2V0IHRvbmUgdG8gMTAwJQovL2tlZXAgbm9ybWFsaXplZCBtb2RlIHRvIE9OIChkZWZhdWx0KQoKLy90b2RvIC0gYWRkIHZlbG9jaXR5IHNlbnNpdGl2aXR5IHRvIG1vZHVsYXRvciBlbnZlbG9wZXMKCmltcG9ydCgic3RkZmF1c3QubGliIik7CgpuSGFybW9uaWNzID0gMTY7ICAvLyBDaGFuZ2UgdGhpcyBudW1iZXIgdG8gZXhwZXJpbWVudCB3aXRoIGRpZmZlcmVudCBudW1iZXJzIG9mIGhhcm1vbmljcwptb2RJbmRleCA9IGhzbGlkZXIoIk1vZEluZGV4IiwgMjEsIDEsIDEwMCwgMC4xKTsKCgp0ID0gYnV0dG9uKCJHYXRlIikgfCBjaGVja2JveCgiQU9uX2hvbGQiKTsKLy8gYmFzZUZyZXEgPSBiYS5taWRpa2V5Mmh6KGhzbGlkZXIoIkFNaWRpTm90ZSIsIDYwLCAxLCAxMjcsIDEpKTsKYmFzZUZyZXEgPSBoc2xpZGVyKCJGcmVxdWVuY3kiLCAyMjAsIDIwLCAyMDAwLCAwLjAxKTsKdkFtcCA9IGhzbGlkZXIoIlZlbG9jaXR5QW1wIiwgMC43LCAwLCAxLCAwLjAxKTsKcmVsZWFzZSA9IGhzbGlkZXIoIlJlbGVhc2UiLCAwLjMsIDAsIDEsIDAuMDEpOwpwb2x5R2FpbiA9IGhzbGlkZXIoIlBvbHlHYWluIiwgMC43LCAwLCAxLCAwLjAxKTsKbW9kQ3VydmUgPSBoc2xpZGVyKCJNb2RDdXJ2ZSIsIDEsIDAuMDEsIDEwLCAwLjAxKTsKbW9kQ2hhaW5DdXJ2ZSA9IGhzbGlkZXIoIk1vZENoYWluQ3VydmUiLCAxLCAwLjAxLCAxMCwgMC4wMSk7Cm1vZDJtb2QgPSBoc2xpZGVyKCJNb2QyTW9kIiwgMSwgMSwgMTYsIDAuMDEpOwpoYXJtb25pY1Nsb3BlID0gaHNsaWRlcigiSGFybW9uaWNTbG9wZSIsIDIsIDAuMDEsIDEwLCAwLjAxKTsKaGFybW9uaWNTbG9wZVdlaWdodCA9IGhzbGlkZXIoIkhhcm1vbmljU2xvcGVXZWlnaHQiLCAxLCAwLjAxLCAxMCwgMC4wMSk7CgoKCmhhcm1vbmljX29wZXJhdG9yKG1vZHVsYXRvciwgaW5kLCBpc0VuZCkgPSBzdW1TaWduYWxzCndpdGggewogICAgdmcoeCkgPSB2Z3JvdXAoInZvaWNlXyVpbmQiLHgpOwogICAgbW9kRGVwdGhDb250cm9sID0gdmcoaHNsaWRlcigieU1vZF9kZXB0aCIsIGJhLmlmKGlzRW5kLCAxLCAwKSwgMCwgMSwgMC4wMSkpOwogICAgZmluZSA9IHZnKGhzbGlkZXIoInlGaW5lIiwgMCwgMCwgMSwgMC4wMDEpKTsKICAgIGNvYXJzZSA9IHZnKGhzbGlkZXIoInlDb2Fyc2UiLCAxLCAxLCAxNiwgMSkpOwogICAgZk11bHQgPSBmaW5lICsgY29hcnNlOwogICAgbXVsdEZyZXEgPSBiYXNlRnJlcSAqIGZNdWx0OwogICAgbW9kRGVwdGggPSAoYmEubGluMkxvZ0dhaW4obW9kRGVwdGhDb250cm9sKV5tb2RDdXJ2ZSkgKiBiYS5pZihpc0VuZCwgMSwgKG1vZEluZGV4ICogbXVsdEZyZXEpIC8gKChpbmQtMSlebW9kQ2hhaW5DdXJ2ZSkpOyAvL2Rvbid0IG5lZWQgdG8gdXNlIG1vZEluZGV4IGZvciBsYXN0IG9wZXJhdG9yIGluIGNoYWluCiAgICAvL3RvZG8gLSBzb21ldGhpbmcgYWJvdXQgbG9nIHNjYWxpbmcgaGVyZSBkb2Vzbid0IG1hdGNoIGFibGV0b24KICAgIG1vZERlcHRoMiA9IG1vZERlcHRoIC8gYmEuaWYoaW5kID09IDMsIG1vZDJtb2QsIDEpOwoKICAgIGhHcm91cCh4KSA9IHZnKGhncm91cCgiekhhcm1vbmljcyIseCkpOwogICAgaGFybW9uaWNMZXZlbHMgPSBwYXIoaSwgbkhhcm1vbmljcywgaEdyb3VwKHZzbGlkZXIoImhfJWkiLCBpPT0wLCAwLCAxLCAwLjAxKSkpOwogICAgLy8gdG90YWxXZWlnaHQgPSBoYXJtb25pY0xldmVscyA6PiBfOyAgICAKICAgIHRvdGFsV2VpZ2h0ID0gKGhhcm1vbmljTGV2ZWxzLCBwYXIoaSxuSGFybW9uaWNzLChpKzEpXmhhcm1vbmljU2xvcGVXZWlnaHQpKSA6IHJvLmludGVybGVhdmUobkhhcm1vbmljcywyKSA6IHBhcihpLG5IYXJtb25pY3MsKikgOj4gXzsKCiAgICAvLyBoYXJtb25pY3MgPSBwYXIoaSwgbkhhcm1vbmljcywgb3Mub3NjKChtdWx0RnJlcSttb2R1bGF0b3IpICogZmxvYXQoaSArIDEpKSk7IC8vIEdlbmVyYXRlIGhhcm1vbmljIGZyZXF1ZW5jaWVzCiAgICBoYXJtb25pY3MgPSBwYXIoaSwgbkhhcm1vbmljcywgb3Mub3NjKChtdWx0RnJlcSttb2R1bGF0b3IpICogZmxvYXQoaSArIDEpKSAqIChpKzEpXmhhcm1vbmljU2xvcGUpOyAvLyBHZW5lcmF0ZSBoYXJtb25pYyBmcmVxdWVuY2llcwoKICAgIHdlaWdodGVkU2lnbmFscyA9IChoYXJtb25pY3MsIGhhcm1vbmljTGV2ZWxzKSA6IHJvLmludGVybGVhdmUobkhhcm1vbmljcywyKSA6IHBhcihpLG5IYXJtb25pY3MsKik7IC8vIE1ha2Ugc3VyZSBzaWduYWxzIGFyZSBwcm9wZXJseSBwYWlyZWQgYmVmb3JlIG11bHRpcGxpY2F0aW9uCiAgICBhMiA9IHZnKGhzbGlkZXIoInhBdHRhY2siLCAwLjAzLCAwLjAwMSwgMTAsIC4wMDEpKTsKICAgIGQyID0gdmcoaHNsaWRlcigieERlY2F5IiwgMC4wMywgMC4wMDEsIDEwLCAuMDAxKSk7CiAgICBzMiA9IHZnKGhzbGlkZXIoInhTdXN0YWluIiwgMC44LCAwLCAxLCAwLjAwMSkpOyAvL3RvZG8gLSBsaW4ybG9nIHRoaXM/CiAgICByMiA9IHZnKGhzbGlkZXIoInhSZWxlYXNlIiwgMC4wMywgMC4wMDEsIDEwLCAuMDAxKSk7CiAgICBlbnYyID0gZW4uYWRzcihhMiwgZDIsIHMyLCByMiwgdCk7CiAgICBzdW1TaWduYWxzID0gd2VpZ2h0ZWRTaWduYWxzIDo+IF8gLyB0b3RhbFdlaWdodCAgKiBtb2REZXB0aDIgKiBlbnYyOwp9OwoKCnY0ID0gaGFybW9uaWNfb3BlcmF0b3IoMCwgNCwgMCk7CnYzID0gaGFybW9uaWNfb3BlcmF0b3IodjQsIDMsIDApOwp2MiA9IGhhcm1vbmljX29wZXJhdG9yKHYzLCAyLCAwKTsKdjEgPSBoYXJtb25pY19vcGVyYXRvcih2MiwgMSwgMSk7CgoKb3V0U2lnbmFsID0gdjEgKiB2QW1wICogcG9seUdhaW47CgoKCnByb2Nlc3MgPSBvdXRTaWduYWwsIG91dFNpZ25hbDs=",
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
          "index": 262700
        },
        {
          "type": "hslider",
          "label": "Frequency",
          "shortname": "Frequency",
          "address": "/operator/Frequency",
          "index": 262252,
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
          "index": 262696
        },
        {
          "type": "hslider",
          "label": "HarmonicSlope",
          "shortname": "HarmonicSlope",
          "address": "/operator/HarmonicSlope",
          "index": 262228,
          "init": 2,
          "min": 0.01,
          "max": 10,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "HarmonicSlopeWeight",
          "shortname": "HarmonicSlopeWeight",
          "address": "/operator/HarmonicSlopeWeight",
          "index": 262164,
          "init": 1,
          "min": 0.01,
          "max": 10,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "Mod2Mod",
          "shortname": "Mod2Mod",
          "address": "/operator/Mod2Mod",
          "index": 262360,
          "init": 1,
          "min": 1,
          "max": 16,
          "step": 0.01
        },
        {
          "type": "hslider",
          "label": "ModChainCurve",
          "shortname": "ModChainCurve",
          "address": "/operator/ModChainCurve",
          "index": 262344,
          "init": 1,
          "min": 0.01,
          "max": 10,
          "step": 0.01
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
          "index": 262264,
          "init": 21,
          "min": 1,
          "max": 100,
          "step": 0.1
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
              "index": 263156,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xDecay",
              "shortname": "voice_1_xDecay",
              "address": "/operator/voice_1/xDecay",
              "index": 263164,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xRelease",
              "shortname": "voice_1_xRelease",
              "address": "/operator/voice_1/xRelease",
              "index": 263168,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xSustain",
              "shortname": "voice_1_xSustain",
              "address": "/operator/voice_1/xSustain",
              "index": 263160,
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
              "index": 262260,
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
              "index": 262256,
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
                  "index": 262160,
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
                  "index": 262168,
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
                  "index": 262204,
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
                  "index": 262208,
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
                  "index": 262212,
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
                  "index": 262216,
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
                  "index": 262220,
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
                  "index": 262224,
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
                  "index": 262172,
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
                  "index": 262176,
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
                  "index": 262180,
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
                  "index": 262184,
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
                  "index": 262188,
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
                  "index": 262196,
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
                  "index": 262200,
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
              "index": 263012,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xDecay",
              "shortname": "voice_2_xDecay",
              "address": "/operator/voice_2/xDecay",
              "index": 263020,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xRelease",
              "shortname": "voice_2_xRelease",
              "address": "/operator/voice_2/xRelease",
              "index": 263024,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xSustain",
              "shortname": "voice_2_xSustain",
              "address": "/operator/voice_2/xSustain",
              "index": 263016,
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
              "index": 262272,
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
              "index": 262268,
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
              "index": 262276,
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
                  "index": 262280,
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
                  "index": 262284,
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
                  "index": 262320,
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
                  "index": 262324,
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
                  "index": 262328,
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
                  "index": 262332,
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
                  "index": 262336,
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
                  "index": 262340,
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
                  "index": 262288,
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
                  "index": 262292,
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
                  "index": 262296,
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
                  "index": 262300,
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
                  "index": 262304,
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
                  "index": 262308,
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
                  "index": 262312,
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
                  "index": 262316,
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
              "index": 262868,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xDecay",
              "shortname": "voice_3_xDecay",
              "address": "/operator/voice_3/xDecay",
              "index": 262876,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xRelease",
              "shortname": "voice_3_xRelease",
              "address": "/operator/voice_3/xRelease",
              "index": 262880,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xSustain",
              "shortname": "voice_3_xSustain",
              "address": "/operator/voice_3/xSustain",
              "index": 262872,
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
              "index": 262352,
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
              "index": 262348,
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
              "index": 262356,
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
                  "index": 262364,
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
                  "index": 262368,
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
                  "index": 262404,
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
                  "index": 262408,
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
                  "index": 262412,
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
                  "index": 262416,
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
                  "index": 262420,
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
                  "index": 262424,
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
                  "index": 262372,
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
                  "index": 262376,
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
                  "index": 262380,
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
                  "index": 262384,
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
                  "index": 262388,
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
                  "index": 262392,
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
                  "index": 262396,
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
                  "index": 262400,
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
              "index": 262692,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xDecay",
              "shortname": "voice_4_xDecay",
              "address": "/operator/voice_4/xDecay",
              "index": 262724,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xRelease",
              "shortname": "voice_4_xRelease",
              "address": "/operator/voice_4/xRelease",
              "index": 262728,
              "init": 0.03,
              "min": 0.001,
              "max": 10,
              "step": 0.001
            },
            {
              "type": "hslider",
              "label": "xSustain",
              "shortname": "voice_4_xSustain",
              "address": "/operator/voice_4/xSustain",
              "index": 262720,
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
              "index": 262436,
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
              "index": 262432,
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
              "index": 262440,
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
                  "index": 262444,
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
                  "index": 262448,
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
                  "index": 262484,
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
                  "index": 262488,
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
                  "index": 262492,
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
                  "index": 262496,
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
                  "index": 262500,
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
                  "index": 262504,
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
                  "index": 262452,
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
                  "index": 262456,
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
                  "index": 262460,
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
                  "index": 262464,
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
                  "index": 262468,
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
                  "index": 262472,
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
                  "index": 262476,
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
                  "index": 262480,
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