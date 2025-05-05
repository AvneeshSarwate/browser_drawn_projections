look at generativeMusic_1/LivecodeHolder.vue for //todo - reuse



prepping ableton-hotreload workflow to automatically set up clip-json for build time
- by convention, save ableton project/file into sketch directory
- invoke alsParsing.ts from github root dir
- in alsParsing.ts, add function that writes json into sketch directory as a ts file
- in sketch LivecodeHolder, import clip-json ts
- in INITIALIZE_ABLETON_CLIPS, add an optional parameter to pass in clip-json ts, and in INITIALIZE_ABLETON_CLIPS based on build config return input clip-json ts instead of doing websocket stuff