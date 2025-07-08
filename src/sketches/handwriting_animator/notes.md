
High level goal:
I want to create a tool that lets me record handwriting and then replay it, and also lets me edit the drawn strokes. I want to be able to group individual strokes into characters and words, and also be able to stylistically position them on a fixed size canvas. I want to be able to export this configuration as a JSON file that I can use later for more complex animations. It should use the Konva.js library for the canvas and drawing since it already supports grouping and transforming shapes and has many examples for how to do this. It should use the perfect-freehand library to stylize the drawing of the strokes. 


Features:
- Record handwriting strokes (save timing information for each stroke)
- realtime preview of the strokes as they are being drawn (style with perfect-freehand library even in preview mode)
- Replay handwriting
- optional grid overlay to help with positioning when drawing
- select strokes by clicking on them, shift-clicking to select multiple strokes
- group or ungroup strokes
- transform shapes/groups of strokes (translate, rotate, scale) 
- align shapes/groups of strokes (horizontal, vertical, center, etc.)
- edit the style of the strokes (parameters from perfect-freehand library)
- play back the strokes, with a timeline to scrub through the animation
- play back individual groups of strokes, with a timeline to scrub through the animation

Implementation notes
- use Konva.js for the drawing and editing canvas since it already supports grouping and transforming shapes
- use perfect-freehand library to stylize the drawing of the strokes 
- create a separate timeline component whose use is contextual depending on what is selected on the canvas (if nothing is selected, play entire animation, if a group is selected, play that group, if a stroke is selected, play that stroke)
- to control timing playback, use the interal timing library (TimeContext and BrowserTimeContext) at src/channels/base_time_context.ts and src/channels/channels.ts
- create the timeline component in src/sketches/handwriting_animator/timeline.vue
- implement everything else in src/sketches/handwriting_animator/LivecodeHolder.vue
- Use plain konva - no need for any vue integration libraries
- all necessary libraries are already installed
- Before beginning, search the web for examples of how to use konva and perfect-freehand
- in particular, search for konva examples for how to manipulate strokes (eg group, ungroup, transform, etc.) 
- Later on, features like export and undo/redo will be added, so keep this in mind when organizing the code