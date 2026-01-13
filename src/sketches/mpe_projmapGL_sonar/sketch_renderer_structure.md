this is the description of the music-graphics mappings in mpe_projmapGL_sonar


here is the set up of the graphics stack 
there are 2 canvases, the input canvas component, and the render canvas
the input canvas component lets me draw polygons and add metadata to them. the metadata on them determines how those polygons are drawn on the render canvas. polygonFX.ts shows how the render stack for the render canvas works, which lets you draw a post-processed polygon in the render canvas for every polygon from the input canvas component
the pipeline for each polygon is
- p5.Graphics for drawing 2d animation on a hidden canvas that is the bounding box of the polygon
	- there is metadata that can be set on each polygon from the input canvas component and this is used to control animations 
- shader based post processing for effects, and a final mask shader to crop the bounding box back to the original polygon shape
	- metadata from the input polygons can also control effects parameters
- this post processed texture gets assigned to a babylon.js mesh 
- a babylon.js scene renders all of the babylon.js meshes corresponding to a polygon from the input canvas component


There is also a music system that i want to map into the graphics system. here are the parts of the music system that are relevant to teh graphics system (mostly implemented in playBackUtils) - there is a runLineWithDelay function that plays a melody, and then optionally plays a transformed version of that melody with a delay 



here is how the 


I will make polygons in 3 columns, left/middle/right

every time a melody plays, it will be assigned to a random polygon in either the left or the right column (alternating) - the "counter" swapping between left and right increments for every melody, whether it is an "original" melody or a "delayed" melody 

while the melody is playing, for every note played, a circle will shoot from one random starting point on that melody's assigned polygon to another. the duration of the circle's motion will be the duration of the note 


the code setup for how the music system communicates with the graphics system will be sort of like an ECS setup - the music system will live update state, and the graphics system (mainly the p5.Graphics draw function) will just pull and immediate-mode draw according to the most recent state

you'll need some map from shapeIds to activeMelodyIds, and then also some map from activeMelodyIds to drawInfo

have some kind of like buildNotePlayFunction that takes as input the particular id of that melody and handles pulling the mapped polygon info and figuring out the point arc and launching it. the output of the buildNotePlayFunction can be passed into playClipSimple and runLineClean so you just parallel play "visual notes" along side musical notes in the playback loop

you'll also need to set up a new schema in appState.ts for metadata properties that lets me pick "melodyMap" as the type of draw mode for polygons. the polygons will also have properties that define their column (left/middle/right) 


implement this - ultrathink 







