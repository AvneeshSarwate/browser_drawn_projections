power2d notes (quirks / behaviors)

1) Stroke halo with MSAA + alpha blending
- With MSAA, edge pixels store partial coverage. When the shader outputs white RGB with a small alpha, the blend still adds a faint white rim because straight alpha blending applies RGB * alpha to the framebuffer.
- This is not alpha being rounded up; it is the combination of partial coverage + nonzero RGB.
- Fix: use premultiplied alpha in the shader (RGB already multiplied by alpha) so edge pixels fade to 0 in both color and alpha.

2) Closed-stroke seam artifacts (normalizedArc discontinuity)
- For closed shapes, the stroke mesh includes the closing segment but the last vertex had normalizedArc < 1.0 while the first vertex is 0.0.
- The closing triangle interpolates across 0↔1, which breaks any shader logic that assumes normalizedArc is continuous, causing a hitch or gap.
- Fix: duplicate the first point as a final seam vertex with arcLength = totalLength and normalizedArc = 1.0, and render the closing segment against that duplicate (no triangle ever interpolates 0↔1).
- This is especially important for closed strokes. For open polylines (future StyledLine), the last vertex naturally has normalizedArc = 1.0, so no seam duplication is needed.
