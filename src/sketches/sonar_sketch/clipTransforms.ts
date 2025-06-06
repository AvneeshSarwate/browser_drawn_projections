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
 * @param startLookback  How much time before the marker to look for notes (in quarter-notes)
 * @param markerPitch pitch value that designates a marker (default 0)
 */
export function segmentByPitchMarker(
  clip: AbletonClip,
  startLookback = 0.5,
  markerPitch = 0,
): MarkerSegmentResult[] {
  const results: MarkerSegmentResult[] = [];

  const markers = clip.notes.filter(
    (n) => !n.isEnabled && n.pitch === markerPitch,
  );

  if (markers.length === 0) {
    return [{ marker: null, fullClip: clip.clone(), clippedClip: clip.clone() }];
  }

  markers.forEach((marker, idx) => {
    const start = marker.position;
    const end = start + marker.duration;
    const earliestStart = start - startLookback;

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

export function retrogradeClip(clip: AbletonClip): AbletonClip {
  if (clip.notes.length === 0) {
    return clip.clone();
  }

  const newNotes: AbletonNote[] = clip.notes.map(note => ({
    ...note,
    position: clip.duration - (note.position + note.duration),
  }));

  // Ensure notes are sorted by their new positions
  newNotes.sort((a, b) => a.position - b.position);

  return new AbletonClip(clip.name + "_retrograde", clip.duration, newNotes);
}

export function invertClip(
  clip: AbletonClip,
  scale: Scale,
  axis?: number // optional - deviation of scale degree from the root
): AbletonClip {
  if (clip.notes.length < 2) {
    return clip.clone();
  }

  const clonedNotes = clip.notes.map(note => ({ ...note }));

  const axisIndex = axis ?? scale.getIndFromPitch(clonedNotes[0].pitch) + axis;

  const invertedNotes = clonedNotes.map(note => {
    const originalIndex = scale.getIndFromPitch(note.pitch);
    const invertedIndex = 2 * axisIndex - originalIndex;
    return {
      ...note,
      pitch: scale.getByIndex(invertedIndex),
    };
  });

  return new AbletonClip(
    clip.name + "_inverted",
    clip.duration,
    invertedNotes
  );
}


export function timeStretch(clip: AbletonClip, factor: number): AbletonClip {
  return clip.scale(factor);
}


export function endTimeQuantize(clip: AbletonClip, quantValue: number): AbletonClip {
  if (quantValue <= 0) return clip.clone();
  
  const clone = clip.clone();
  clone.duration = Math.ceil(clone.duration / quantValue) * quantValue;
  return clone;
}


export function scaleTranspose(clip: AbletonClip, transpose: number, scale?: Scale): AbletonClip {
  if(!scale) {
    scale = new Scale();
  }
  return clip.scaleTranspose(transpose, scale);
}

export function arpeggiateClip(
  clip: AbletonClip,
  pattern: string = 'up',
  rate: number = 0.25,
  gate: number = 0.9,
  distance: number = 0,
  steps: number = 1
): AbletonClip {
  if (clip.notes.length === 0) {
    return clip.clone();
  }

  // Group notes by their start position to find chords
  const noteGroups = new Map<number, AbletonNote[]>();
  clip.notes.forEach(note => {
    if (!noteGroups.has(note.position)) {
      noteGroups.set(note.position, []);
    }
    noteGroups.get(note.position)!.push({ ...note });
  });

  const arpeggiatedNotes: AbletonNote[] = [];
  
  noteGroups.forEach((notes, position) => {
    if (notes.length === 0) return;
    
    // Sort notes by pitch for consistent ordering
    const sortedNotes = notes.sort((a, b) => a.pitch - b.pitch);
    
    // Generate arpeggio pattern
    const patternNotes = generateArpeggioPattern(sortedNotes, pattern);
    
    // Apply transposition steps
    const allStepNotes: AbletonNote[] = [];
    for (let step = 0; step < steps; step++) {
      const stepTranspose = step * distance;
      patternNotes.forEach(note => {
        allStepNotes.push({
          ...note,
          pitch: note.pitch + stepTranspose
        });
      });
    }
    
    // Create the arpeggiated sequence
    allStepNotes.forEach((note, index) => {
      const noteStart = position + (index * rate);
      const noteDuration = rate * gate;
      
      arpeggiatedNotes.push({
        ...note,
        position: noteStart,
        duration: noteDuration
      });
    });
  });

  // Calculate new clip duration
  const lastNoteEnd = arpeggiatedNotes.reduce((max, note) => 
    Math.max(max, note.position + note.duration), 0);
  const newDuration = Math.max(clip.duration, lastNoteEnd);

  return new AbletonClip(
    clip.name + "_arp",
    newDuration,
    arpeggiatedNotes
  );
}

const arpPatterns = ['up', 'down', 'updown', 'downup', 'converge', 'diverge', 'random', 'chord']
function generateArpeggioPattern(notes: AbletonNote[], patternInput: string|number): AbletonNote[] {
  const sorted = [...notes].sort((a, b) => a.pitch - b.pitch);
  
  const pattern = typeof patternInput === 'string' ? patternInput : arpPatterns[patternInput % arpPatterns.length];

  switch (pattern.toLowerCase()) {
    case 'up':
      return sorted;
    
    case 'down':
      return sorted.reverse();
    
    case 'updown':
      return [...sorted, ...sorted.slice(1, -1).reverse()];
    
    case 'downup': {
      const reversed = sorted.reverse();
      return [...reversed, ...reversed.slice(1, -1).reverse()];
    }
    
    case 'converge': {
      const converged = [];
      let low = 0, high = sorted.length - 1;
      while (low <= high) {
        converged.push(sorted[low++]);
        if (low <= high) converged.push(sorted[high--]);
      }
      return converged;
    }
    
    case 'diverge': {
      const diverged = [];
      const mid = Math.floor(sorted.length / 2);
      let left = mid, right = mid + 1;
      if (sorted.length % 2 === 1) {
        diverged.push(sorted[mid]);
      }
      while (left >= 0 || right < sorted.length) {
        if (left >= 0) diverged.push(sorted[left--]);
        if (right < sorted.length) diverged.push(sorted[right++]);
      }
      return diverged;
    }
    
    case 'random': {
      const shuffled = [...sorted];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    
    case 'chord':
      return notes; // return all notes as they are for chord trigger
    
    default:
      return sorted; // default to up
  }
}


export function sliceClip(clip: AbletonClip, start: number, end: number): AbletonClip {
  return clip.timeSlice(start, end);
}


export function segment(clip: AbletonClip, index: number): AbletonClip {
  const segments = segmentByPitchMarker(clip);
  
  // If no segments found, return a clone of the original clip
  if (segments.length === 0) {
    return clip.clone();
  }
  
  // Wrap index around if needed
  const wrappedIndex = ((index % segments.length) + segments.length) % segments.length;
  
  return segments[wrappedIndex].clippedClip;
}

export function timeSlice(clip: AbletonClip, start: number, end: number): AbletonClip {
  return clip.timeSlice(start, end);
}

// ─────────────────────────────────────────────
// Symbol  →  Transformation-function registry
// ─────────────────────────────────────────────
export type ClipTransform = {
  name: string;
  transform: (clip: AbletonClip, ...params: any[]) => AbletonClip;
  // parses the arguments from the string, converts to numbers and scales them as necessary
  argParser: (args: string[]) => any[]; 
  //scales slider values (which are always [0-1]) to the appropriate range for the transform for each argument
  sliderScale: ((slider: number) => number)[];
}

//parse string to number, but if it's not, return base string because it may be a slider reference
const numParse = (n: string) => {
  const num = Number(n)
  if(isNaN(num)) {
    return n
  }
  return num
}
/**
 *  Registry that is used by the live-coding text parser.
 *  The first argument is **always** the current clip, the rest are the
 *  parameters parsed from the text (numbers or strings, some of which may be references to sliders).
 */
export const TRANSFORM_REGISTRY: Record<string, ClipTransform> = {
  seg: {
    name: 'seg',
    transform: (clip, index) => segment(clip, index),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => Math.floor(n*8)]
  },

  s_tr: {
    name: 's_tr',
    transform: (clip, degree, scale: Scale = new Scale()) => scaleTranspose(clip, degree, scale),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => Math.floor(n*16 - 8)]
  },

  transpose: {
    name: 'transpose',
    transform: (clip, degree, scale: Scale = new Scale()) => scaleTranspose(clip, degree, scale),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => Math.floor(n*16 - 8)]
  },

  str: {
    name: 'str',
    transform: (clip, factor) => timeStretch(clip, factor),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => n*3]
  },

  q: {
    name: 'q',
    transform: (clip, qVal) => endTimeQuantize(clip, qVal),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => n] //no scaling
  },
  sl: {
    name: 'sl',
    transform: (clip, start, end) => timeSlice(clip, start, end),
    argParser: (args: string[]) => [numParse(args[0]), numParse(args[1])],
    sliderScale: [n => n] //no scaling
  },
  rev: {
    name: 'rev',
    transform: (clip) => retrogradeClip(clip),
    argParser: (args: string[]) => [],
    sliderScale: [n => n] //no scaling
  },
  inv: {
    name: 'inv',
    transform: (clip, axis) => invertClip(clip, new Scale(), axis),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => n*24 - 12] //-12 to 12
  },

  arp: {
    name: 'arp',
    transform: (clip, pattern = 'up', rate = 0.25, gate = 0.9, distance = 0, steps = 1) => 
      arpeggiateClip(clip, pattern, rate, gate, distance, steps),
    argParser: (args: string[]) => [
      args[0] || 'up',
      numParse(args[1]) || 0.25,
      numParse(args[2]) || 0.9,
      numParse(args[3]) || 0,
      numParse(args[4]) || 1
    ],
    sliderScale: [
      n => Math.floor(n * arpPatterns.length), // pattern: 0 to 7
      n => n * 0.5, // rate: 0 to 0.5 quarter notes
      n => n, // gate: 0 to 1
      n => Math.floor(n * 24 - 12), // distance: -12 to 12 semitones
      n => Math.floor(n * 4) + 1 // steps: 1 to 4
    ]
  }
};




