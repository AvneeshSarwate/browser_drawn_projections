import { AbletonClip, type AbletonNote } from '@/io/abletonClips';
import { Scale } from '@/music/scale';

export type MarkerSegmentResult = {
  marker: AbletonNote;
  fullClip: AbletonClip;
  clippedClip: AbletonClip;
};

/**
 * Splits a clip around every disabled "marker" note whose pitch === 0.
 * A marker defines a window [markerStart, markerEnd).
 *
 * For each marker we collect every **enabled** note that
 *   1. overlaps the window, and
 *   2. starts no earlier than (markerStart - 1/8-note)
 *
 * Two clips are returned:
 *   • fullClip   – keeps original note lengths
 *   • clippedClip– trims notes so they stop at markerEnd
 *
 * @param clip        original Ableton clip
 * @param eighthNote  length of an ⅛-note (default 0.5 when 1 = quarter-note)
 * @param markerPitch pitch value that designates a marker (default 0)
 */
export function segmentByPitchMarker(
  clip: AbletonClip,
  eighthNote = 0.5,
  markerPitch = 0,
): MarkerSegmentResult[] {
  const results: MarkerSegmentResult[] = [];

  const markers = clip.notes.filter(
    (n) => !n.isEnabled && n.pitch === markerPitch,
  );

  markers.forEach((marker, idx) => {
    const start = marker.position;
    const end = start + marker.duration;
    const earliestStart = start - eighthNote;

    // Collect overlapping, sufficiently-late notes (ignore other disabled notes)
    const overlapping = clip.notes.filter((n) => {
      if (!n.isEnabled) return false;                  // active notes only
      if (n === marker) return false;                  // skip the marker itself
      const overlaps = n.position < end && n.position + n.duration > start;
      const notTooEarly = n.position >= earliestStart;
      return overlaps && notTooEarly;
    });

    if (overlapping.length === 0) return;

    // ---------- FULL-DURATION VARIANT ----------
    // Shift the timeline so that markerStart ⇒ 0, keep complete note lengths.
    const fullNotes: AbletonNote[] = overlapping.map((n) => ({
      ...n,
      position: n.position - start,
    }));

    const fullDur = fullNotes.reduce((m, n) => Math.max(m, n.position + n.duration), 0);
    const fullClip = new AbletonClip(
      `${clip.name}_marker${idx}_full`,
      fullDur,
      fullNotes,
    );

    // ---------- CLIPPED-END VARIANT ----------
    // Re-use fullNotes and only clip tails that extend past the marker window.
    const clippedNotes: AbletonNote[] = fullNotes.map((n) => {
      const clone = { ...n };
      const endInLocal = clone.position + clone.duration;
      if (endInLocal > marker.duration) {
        clone.duration = Math.max(0, marker.duration - clone.position);
      }
      return clone;
    });

    const clippedDur = clippedNotes.reduce((m, n) => Math.max(m, n.position + n.duration), 0);
    const clippedClip = new AbletonClip(
      `${clip.name}_marker${idx}_clipped`,
      clippedDur,
      clippedNotes,
    );

    results.push({ marker, fullClip, clippedClip });
  });

  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Helper-driven slicing / transposition
// ────────────────────────────────────────────────────────────────────────────

/**
 * write me a function that takes an Ableton Clip with segment markers, and then returns a sliced and transposed version of the clip.
 * the slices are defined by indexes of the markers. the transpositions are defined by scale degrees.
 * the start time of the next sub phrase is defined by the end of the previous phrase plus a quantization value.
 * 
 * the input arguments are 
 * 
 * inputClip: AbletonClip,
 * 
 * SliceDefinition:
 * {
 *  index: number,
 *  scaleDegree: number,  
 *  quantization: number,
 *  speedScaling: number,
 * }[], 
 * 
 * inputScale: Scale.
 *  
 * you can assume that the inputClip only contains notes from the scale
 * 
 * the output is a list of AbletonClips, one for each slice.
 */


export type SliceDefinition = {
  clipName: string;     // NEW – which clip in the map to slice
  /** index in the marker array (chronological order)                        */ 
  index: number;
  /** transposition in scale-degrees (positive = up)                          */
  scaleDegree: number;
  /** gap inserted *after* this slice before the next one starts              */
  quantization: number;
  /** time-stretch factor (1 = no change, 0.5 = double-speed …)               */
  speedScaling: number;
};

/**
 * Produces a list of transformed slices from an Ableton clip that contains
 * disabled  pitch-0 marker notes.  
 *
 *   •  The slice boundaries are taken from `segmentByPitchMarker()`  
 *   •  Each requested slice is looked-up by index, speed-scaled, transposed
 *      by `scaleDegree` steps inside `inputScale`, then moved so that it starts
 *      immediately after the previous slice plus `quantization`.  
 *
 * If a definition references a non-existing marker index it is skipped.
 */
export function sliceAndTransposeByMarkers(
  clipPool: Map<string, AbletonClip>,    // NEW – collection of source clips
  defs: SliceDefinition[],
  inputScale: Scale,
): AbletonClip[] {
  const output: AbletonClip[] = [];                            // timeline position for next slice

  // cache marker-segment arrays per clip so we only compute them once
  const segmentationCache = new Map<string, MarkerSegmentResult[]>();

  defs.forEach((def, sliceIdx) => {
    const srcClip = clipPool.get(def.clipName);
    if (!srcClip) return;                   // unknown clip – skip slice

    // get (or compute & cache) marker segments for this clip
    let segments = segmentationCache.get(def.clipName);
    if (!segments) {
      segments = segmentByPitchMarker(srcClip);
      segmentationCache.set(def.clipName, segments);
    }

    const seg = segments[def.index];
    if (!seg) return;                       // invalid marker index – skip

    // 1. start from the clipped variant of that segment
    let slice = seg.clippedClip.clone();

    // 2. speed-scale
    if (def.speedScaling !== 1) {
      slice = slice.scale(def.speedScaling);
    }

    // 3. transpose by scale-degree inside the given scale
    if (def.scaleDegree !== 0) {
      slice = slice.scaleTranspose(def.scaleDegree, inputScale);
    }

    // 4. quantize the duration
    slice.duration = def.quantization == 0 ? slice.duration : Math.ceil(slice.duration / def.quantization) * def.quantization;

    output.push(slice);
  });

  return output; //clips can be joined into a single one with AbletonClip.concat(...clips)
}

/**
 * ideas
 * a live coding area to allow you to define a trackerlike list of slices to play
 * 
 * clipName - sliceInd - transpose - speed - quantForNextSlice
 * 
 * tranpose could also be a relative value, relative to first/last/highest/lowest note of last slice
 * 
 * could then also have algorithms to generate slice definitions (or manual templates of slice definitions)
 */




