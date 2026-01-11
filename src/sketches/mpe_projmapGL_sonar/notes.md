
todo (on below plan)
- color spectrum is just full rainbow - pick specifics
  - let me specify individual RGB colors by pitch-class hardcoded into the file, and then the spectrump and pitch bend blending behavior is derived from that
- pitch bend doesn't map properly to change colors (math/coordinate-scaling issue?)
  - linnstrument uses high resolution pitchbend format 
- timbre not wired up and no post-processing stack for mpe viz
  - add a pixelation fragFunc to this - map it's amount of pixelation to mpe timbre
- need to rotate mpe voice idx even on single notes like some MPE controllers do (makes notes move around polygons even when melody is monophonic)







projection mapping where MPE midi notes animated a region.

animation plan
- ADSR of note (need to manually coordinate with synth) fills in/out some arrangement of circles inside the region
  - example - if quantized grid of region defines "spots" (like with text setting) - ADSR fills in spots with a circle in order (and they get pulled out in order)
- for polyphony notes > regions - can either allow multiple shape sets in a single region, or voice steal
  - if you allow multiple shape sets in a single region, you can't have mpe pressure/timbre controll a post processing effect
    - also need to keep number of shapes in shape set low/sparse enough that multiple shape sets are visible in region
- pitch classes in octave map to a circular color ramp, pitch bends change all colors
- pressure/timbre map to either arrangement effect, indivudal shape effect, or post processing shader effect
  - shape effect can be size, or some kind of "morph" if the individual shapes are defined via splines? (and if the number is low enough for this to visibly be noticeable)
  - cant map to post processing shader if you don't voice steal


concrete animation idea 
- voice stealing
- initial fill arrangement: sparse grid
  - for some given grid step, element rooted on every 2nd column, and skip every 2nd row 
- pressure - warp arrangement - add a rolling simplex noise displacment to each shape 
- timbre - pixelate shader

use MPE midi listener from midi helpers to map into this


need a better unified API for "render bundles" (p5.Graphics, FlattenedPolygon (and metadata), post-processing nodes)
- bundles need to be publically accessible so they can be controlled with realtimes messages
- specifically, need to be able to set metadata. 
  - send "path keyed messages" {"obj1.obj2.finalProp": 5}
  - for now, just overwrite the metadata of the actual polygon with the message

```typescript
/**
 * Applies dot-delimited paths to a target object, creating intermediate objects as needed.
 * - Does not handle arrays (by request).
 * - Mutates and returns `target`.
 */
export function applyPathMap(
  target: any,
  message: Record<string, unknown>,
  opts?: { separator?: string; overwriteNonObject?: boolean }
): any {
  const separator = opts?.separator ?? ".";
  const overwriteNonObject = opts?.overwriteNonObject ?? true;

  for (const [path, value] of Object.entries(message)) {
    if (!path) continue;

    const parts = path.split(separator).filter(Boolean);
    if (parts.length === 0) continue;

    let cur: any = target;

    for (let i = 0; i < parts.length; i++) {
      const key = parts[i]!;
      const isLast = i === parts.length - 1;

      if (isLast) {
        cur[key] = value;
        continue;
      }

      const next = cur[key];

      // If missing, create an object
      if (next == null) {
        cur[key] = {};
        cur = cur[key];
        continue;
      }

      // If present but not an object, decide what to do
      const isObjectLike = typeof next === "object" && !Array.isArray(next);
      if (!isObjectLike) {
        if (!overwriteNonObject) {
          // Skip applying this path rather than clobbering a non-object
          cur = next; // won't really work for further traversal, but we just skip safely
          break;
        }
        cur[key] = {};
      }

      cur = cur[key];
    }
  }

  return target;
}
```