

## feature todos and bug notes
- [X] transformations on single strokes don't propogate to stroke launcher
- [X] dragging working on whole group not robust for nested groups
- [ ] select highlighting still not robust
- [X] slider replay not robust when nothing selected
- [ ] slider replay not robust for groups,nested groups




the files in src/sketches/handwriting_animator/canvas define a canvas drawing component built using vue and konva.js. I want to refactor this into a proper standalone component. 

However, it looks like there are several issues with the architecture that would make this difficult due to messy shared state and lack of modularity

one case of this - state snapshot and serialization functions are not modular enough and have coupling dependencies on the global app state. for example deserializePolygonState should be passed the global app state instance and the polygonState string as an argument, that way, while it has side effects in terms of changing the state of it's arguments, it is fully modularized in that it only affects its arguments and can be used on any instance. 

analyze the following functions 
- in freehandTool.ts - restoreFreehandState, deserializeFreehandState, serializeFreehandState, updateBakedStrokeData
- in polygonTool.ts - restorePolygonState, deserializePolygonState, serializePolygonState, updateBakedPolygonData

update these functions so that they only operate on their arguments, and update their call sites accordingly 





## refactor steps

clearPolygonSelection (also for freehand?) move to selection tool

state snapshot and serialization functions are not modular enough and have coupling dependencies on the global app state. for example deserializePolygonState should be passed the global app state instance and the polygonState string as an argument, that way, while it has side effects in terms of changing the state of it's arguments, it is fully modularized in that it only affects its arguments and can be used on any instance. 

analyze the following functions 
- in freehandTool.ts - restoreFreehandState, deserializeFreehandState, serializeFreehandState, updateBakedStrokeData
- in polygonTool.ts - restorePolygonState, deserializePolygonState, serializePolygonState, updateBakedPolygonData

general refactor - CanvasRoot instantiates a canvas state, all UI handlers pass that state instance into their callbacks, and it is threaded through all functions




standardize and figure out where to put selection related shape funcs 
- getSelectedStrokes, freehandAddSelection, freehandToggleSelection, clearFreehandSelection 
- same for polygon

more standardized approach for freehand.updateTimelineState







## basic plan of dynamic page layout 
- get an alphabet annotated with top/bottom lines 
- write script that takes ascii and generates the launch-start and scale for each character (using top/bottom line alignment)
- write a launcher that does a basic write-out/collapse launch with the above layout info
- figure out a mouse-over - rewrite system for per-charater re-animation


## more stuff to manage groups of strokes and launch groups with script
- need to test with nested groups




# old


## prompt for recreating p5 projection mapping polygon tool with konva
Currently, there is a single layer in the konva sketch that allows for drawing and animation freehand lines. I want to create a second layer that allows for drawing and editing polygons. I should be able to draw a polygon point by point, and then edit the polygon by adding, removing, or moving points. This should effectively be a separate tool lives in the same sketch, with it's own state and UI, but is rendered in the same canvas. Using konva layers allows for "background" click handling to be isolated per layer for the different tools. 

- refactor the freehand drawing code as necessary to prepare for a "multiple parallel tools" implementation where there is a different tool for each layer each with it's own toolbar and undo/redo functionality
- add a UI elemnt to switch between different tool/layer modes
- add the new polygon tool including
  - it's own toolbar with buttons for adding, removing, and moving points, and moving the polygon as a whole
  - it's own serialization to appState.ts to support hot reload
  - it's own undo/redo functionality (buttons in the toolbar only, no keyboard shortcuts)


## prompt for drawing generation

High level goal:
I want to create a tool that lets me record handwriting and then replay it, and also lets me edit the drawn strokes. I want to be able to group individual strokes into characters and words, and also be able to stylistically position them on a fixed size canvas. I want to be able to export this configuration as a JSON file that I can use later for more complex animations. It should use the Konva.js library for the canvas and drawing since it already supports grouping and transforming shapes and has many examples for how to do this. It should use the perfect-freehand library to stylize the drawing of the strokes. It should be implemented in src/sketches/handwriting_animator/ (mostly in LivecodeHolder.vue)


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







things to do next:
- get nested groups working, ideally with konva native group transform logic
- implement file save/load
  - will need to implement reattaching handlers to the strokes/groups/etc. when loading a file
- implement undo/redo (will use handler reattaching logic)
- have drawing state hot reload (will use handler reattaching logic)
- implement stroke timing re-ordering in groups + per-gap inter stroke timing adjustment


The file src/sketches/handwriting_animator/LivecodeHolder.ts is a shape drawing editor that lets you draw shapes and then group and transform them.
in the file src/sketches/handwriting_animator/LivecodeHolder.ts, grouping and transforms are not working as expected. I want to be able to group strokes and then transform them as a group. for a group, rotation should be relative to the group's center. I should be able to nest groups. Un-grouping should bake the group transform into the children so that they keep their relative positions after ungrouping. All of these features are implemented in the file src/sketches/handwriting_animator/konva_group_transform.js. I want to be able to use this file as a reference for how to implement these features in LivecodeHolder.ts