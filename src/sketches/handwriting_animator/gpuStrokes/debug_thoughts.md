use the oracle to review all of the different coordinate systems being used in src/drawing and the strokeAnimation.wgsl compute shaders. when strokes are normalized and written to a texture, they should be stored in canvas coordinates, but should be normalized for length, and their coordinates should be shifted such that their bounding box is 0,0. the compute shader should then simply transpose them by the click point, and multiply their scale by the control value 


the debug canvas does not properly display strokes that have coordinates larger than [-1,1] it seems