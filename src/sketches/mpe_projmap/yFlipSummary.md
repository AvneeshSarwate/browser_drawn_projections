# Y-Axis Coordinate Systems & Flip Summary

This document summarizes the different coordinate systems involved in the rendering pipeline and where Y-flips occur.

## Coordinate Systems

### 1. Konva (Canvas Drawing Library)
- **Origin**: Top-left corner
- **Y Direction**: Down (+Y = downward)
- **Range**: Pixels from (0,0) to (width, height)
- **Notes**: Standard web/canvas convention. Polygon points from Konva are in this space.

### 2. p5.js (Canvas Drawing)
- **Origin**: Top-left corner
- **Y Direction**: Down (+Y = downward)
- **Range**: Pixels from (0,0) to (width, height)
- **Notes**: Matches Konva/Canvas2D. Graphics drawn here are the source for shader textures.

### 3. HTML Canvas 2D
- **Origin**: Top-left corner
- **Y Direction**: Down (+Y = downward)
- **Notes**: The underlying API that Konva and p5.js use. Image data is stored row-by-row from top to bottom.

### 4. WebGL Texture Coordinates (UV)
- **Origin**: Bottom-left corner
- **U Direction**: Right (+U = rightward)
- **V Direction**: Up (+V = upward)
- **Range**: Normalized (0,0) to (1,1)
- **Notes**: Standard OpenGL convention. When uploading canvas data, row 0 of the canvas (top) maps to texel row 0, which is at V=0 (bottom of texture space).

### 5. WebGPU Texture Coordinates
- **Origin**: Top-left corner (in Babylon.js with invertY)
- **U Direction**: Right
- **V Direction**: Down (after Babylon's invertY processing)
- **Notes**: WebGPU itself has Y-up like WebGL, but Babylon.js applies `invertY=true` when uploading canvas textures, effectively making V=0 correspond to the top.

### 6. Normalized Device Coordinates (NDC)
- **Origin**: Center
- **X Range**: -1 (left) to +1 (right)
- **Y Range**: -1 (bottom) to +1 (top)
- **Notes**: Both WebGL and WebGPU use Y-up NDC for clip space.

## Babylon.js Automatic Handling

### WebGPU Backend (`BABYLON.WebGPUEngine`)
- **Canvas Upload**: `updateDynamicTexture()` is called with `invertY=true`
- **Effect**: Texture data is flipped during upload
- **Result**: UV.y=0 corresponds to the TOP of the original canvas
- **Polygon Mask**: Needs Y-flip on polygon points to match

### WebGL Backend (`BABYLON.Engine`)
- **Canvas Upload**: `DynamicTexture.update()` does NOT flip by default
- **Effect**: Canvas row 0 (top) → texel row 0 → V=0 (bottom in GL coordinates)
- **Result**: UV.y=0 corresponds to the TOP of the original canvas content
- **Polygon Mask**: No Y-flip needed on polygon points
- **Final Output**: Needs Y-flip at end of chain to display right-side up

## Three.js Behavior (Reference)

### Texture Loading
- **Default**: `texture.flipY = true` by default
- **Effect**: Images/canvases are automatically flipped on upload
- **Result**: Textures appear right-side up with standard UV mapping
- **Custom Canvas**: May need to set `texture.flipY = false` if pre-flipped

### Key Difference from Babylon
- Three.js flips by default; Babylon WebGL does not
- Three.js uses `texture.flipY` property; Babylon uses parameter in update call

## Current Implementation

### WebGPU Pipeline (`mpe_projmap/polygonFx.ts`)
```
p5.Graphics → PassthruEffect → Wobble → HBlur → VBlur → Pixelate → AlphaThreshold → PolygonMask → Mesh
```
- **Polygon Y-Flip**: YES (via `shouldFlipPolygonY(engine)` returning `true`)
- **Output Flip**: NO (Babylon handles it)

### WebGL Pipeline (`mpe_projmapGL/polygonFx.ts`)
```
p5.Graphics → PassthruEffect → Wobble → HBlur → VBlur → Pixelate → AlphaThreshold → PolygonMask → TransformEffect(flipY) → Mesh
```
- **Polygon Y-Flip**: NO (via `shouldFlipPolygonY(engine)` returning `false`)
- **Output Flip**: YES (TransformEffect with scale [1, -1] at end of chain)

## Coordinate Config (`src/rendering/coordinateConfig.ts`)

```typescript
shouldFlipPolygonY(engine):
  - WebGPU: returns TRUE  (flip polygon Y coordinates)
  - WebGL:  returns FALSE (don't flip polygon Y coordinates)
```

## Summary Table

| System | Origin | Y Direction | UV Origin | Notes |
|--------|--------|-------------|-----------|-------|
| Konva | Top-left | Down | N/A | Source of polygon points |
| p5.js | Top-left | Down | N/A | Draws to canvas |
| Canvas2D | Top-left | Down | N/A | Underlying API |
| WebGL UV | Bottom-left | Up | (0,0)=bottom-left | Standard OpenGL |
| WebGPU UV (raw) | Bottom-left | Up | (0,0)=bottom-left | Same as WebGL |
| Babylon WebGPU | Top-left | Down | (0,0)=top-left | After invertY |
| Babylon WebGL | Top-left* | Down* | (0,0)=top-left* | *In practice due to upload |
| NDC | Center | Up | N/A | Clip space |

## Key Insights

1. **The Problem**: Canvas/Konva data is Y-down, but WebGL textures are sampled Y-up
2. **WebGPU Solution**: Babylon flips on upload, so polygon points need flipping to match
3. **WebGL Solution**: No flip on upload, so polygon points match, but final output is upside-down
4. **WebGL Fix**: Add TransformEffect flip at end of shader chain

## Debugging Tips

- If mask is inverted from content: check `shouldFlipPolygonY` logic
- If entire output is upside-down: need flip at end of chain (WebGL) or check upload settings
- If only part of image is wrong: check bounding box calculations
