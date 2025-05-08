look at generativeMusic_1/LivecodeHolder.vue for //todo - reuse



prepping ableton-hotreload workflow to automatically set up clip-json for build time
- usage note - by convention, save ableton project/file into sketch directory
- usage note - invoke alsParsing.ts from github root dir
- in alsParsing.ts, whenever als file is hot reloaded, add function that writes clip-json into sketch directory as a ts file (eg, const clipData = ...)
- in sketch LivecodeHolder, import clip-json ts
- in abletonClips.ts in the  INITIALIZE_ABLETON_CLIPS function, add an optional parameter to pass in clip-json ts, and in INITIALIZE_ABLETON_CLIPS use prod build build config return AbletonClip objects hydrated from clip-json ts instead of from websocket (use import.meta.env.PROD to check)




example livecode usage

debug1 : 