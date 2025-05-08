look at generativeMusic_1/LivecodeHolder.vue for //todo - reuse



prepping ableton-hotreload workflow to automatically set up clip-json for build time
- usage note - by convention, save ableton project/file into sketch directory
- usage note - invoke alsParsing.ts from github root dir
- in alsParsing.ts, whenever als file is hot reloaded, add function that writes clip-json into sketch directory as a ts file (eg, const clipData = ...)
- in sketch LivecodeHolder, import clip-json ts
- in abletonClips.ts in the  INITIALIZE_ABLETON_CLIPS function, add an optional parameter to pass in clip-json ts, and in INITIALIZE_ABLETON_CLIPS use prod build build config return AbletonClip objects hydrated from clip-json ts instead of from websocket (use import.meta.env.PROD to check)




example livecode usage
clipName : index : transpose : speed : quantize
debug1 : 0 : 0 : 1 : 1
debug1 : 0 : 1 : 1 : 1
debug1 : 0 : 2 : 1 : 1
debug1 : 0 : 3 : 1 : 1



order of refactors
- create clips on demand for parsed slice definitions
- refactor slice definitions to allow arbitrary function calling (how deep? allow chaning transforms?)
- add references in slice definitions to live slider values - figure out whether to have them be dedicated params for functions or standalone vars that are refrenced (and allow them to be scaled in expressions?)