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

export function accentClip(
  clip: AbletonClip,
  noteInd?: number,
  velocityMultiplier: number = 1.5,
  durationMultiplier: number = 2,
): AbletonClip {
  const newClip = clip.clone();

  if (newClip.notes.length === 0) {
    return newClip;
  }

  newClip.notes.sort((a, b) => a.position - b.position);

  let targetIndex = noteInd;
  if (noteInd === undefined) {
    targetIndex = newClip.notes.length - 1;
  } else if (noteInd < 0) {
    targetIndex = newClip.notes.length + noteInd;
  }

  if (targetIndex < 0 || targetIndex >= newClip.notes.length) {
    return clip.clone();
  }

  const accentedNote = newClip.notes[targetIndex];
  const originalDuration = accentedNote.duration;
  const durationIncrease = originalDuration * (durationMultiplier - 1);

  if (durationIncrease === 0 && velocityMultiplier === 1) {
    return newClip;
  }

  newClip.name = clip.name + "_accented";

  accentedNote.velocity = Math.min(127, Math.round(accentedNote.velocity * velocityMultiplier));
  accentedNote.duration *= durationMultiplier;

  for (let i = targetIndex + 1; i < newClip.notes.length; i++) {
    newClip.notes[i].position += durationIncrease;
  }

  newClip.duration = newClip.notes.reduce(
    (maxEnd, note) => Math.max(maxEnd, note.position + note.duration),
    0,
  );

  return newClip;
}

export function timeStretch(clip: AbletonClip, factor: number): AbletonClip {
  return clip.scale(Math.max(0.01, factor));
}

const stretchValues = [1/8, 1/4, 1/2, 1, 2, 4, 8, 16, 1/6, 1/3, 2/3, 1.5, 3, 6].sort((a, b) => a - b)

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

//note - input clips need to have exactly blocked chords. no slight start time deviation allowed
//"chords" are grouped by start time, and last as long as the longest note in the group
const arpeggioPatterns = ['up', 'down', 'updown', 'downup', 'converge', 'diverge', 'random', 'chord'];
export function arpeggiateClip(
  clip: AbletonClip,
  patternArg: string|number = 'up',
  subdivision: number = 0.25,
  gate: number = 0.9,
  distance: number = 0,
  steps: number = 1
): AbletonClip {
  if (clip.notes.length === 0) {
    return clip.clone();
  }

  const pattern = typeof patternArg === 'string' ? patternArg.toLowerCase() : arpeggioPatterns[patternArg % arpeggioPatterns.length];

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
    
    // Find the chord duration (longest note in the group)
    const chordDuration = Math.max(...notes.map(n => n.duration));
    
    // Sort notes by pitch for consistent ordering
    const sortedPitches = notes.map(n => n.pitch).sort((a, b) => a - b);
    
    // Generate pattern indices for this chord size
    const patternIndices = generateArpeggioIndices(sortedPitches.length, pattern);
    
    // Apply transposition steps
    for (let step = 0; step < steps; step++) {
      const stepTranspose = step * distance;
      
      // Arpeggiate this chord for its full duration
      let currentTime = 0;
      let patternIndex = 0;
      
      while (currentTime < chordDuration) {
        const pitchIndex = patternIndices[patternIndex % patternIndices.length];
        const pitch = sortedPitches[pitchIndex] + stepTranspose;
        const noteStart = position + (step * chordDuration) + currentTime;
        const noteDuration = subdivision * gate;
        
        // Use velocity from the original note at this pitch (or first note if not found)
        const originalNote = notes.find(n => n.pitch === sortedPitches[pitchIndex]) || notes[0];
        
        arpeggiatedNotes.push({
          pitch,
          position: noteStart,
          duration: noteDuration,
          velocity: originalNote.velocity,
          isEnabled: true,
          offVelocity: originalNote.offVelocity || 0,
          probability: originalNote.probability || 1
        });
        
        currentTime += subdivision;
        patternIndex++;
      }
    }
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

function generateArpeggioIndices(n: number, pattern: string): number[] {
  if (n === 0) return [];
  if (n === 1) return [0];
  
  switch (pattern.toLowerCase()) {
    case 'up':
      return Array.from({ length: n }, (_, i) => i);
    
    case 'down':
      return Array.from({ length: n }, (_, i) => n - 1 - i);
    
    case 'updown': {
      // [0, 1, ..., n-1, n-2, ..., 1] - don't repeat highest and lowest
      if (n <= 2) return Array.from({ length: n }, (_, i) => i);
      const indices = [];
      for (let i = 0; i < n; i++) indices.push(i);
      for (let i = n - 2; i >= 1; i--) indices.push(i);
      return indices;
    }
    
    case 'downup': {
      // [n-1, n-2, ..., 0, 1, ..., n-2] - don't repeat highest and lowest  
      if (n <= 2) return Array.from({ length: n }, (_, i) => n - 1 - i);
      const indices = [];
      for (let i = n - 1; i >= 0; i--) indices.push(i);
      for (let i = 1; i < n - 1; i++) indices.push(i);
      return indices;
    }
    
    case 'converge': {
      // Outside-in: 0, n-1, 1, n-2, 2, n-3, ...
      const indices = [];
      let low = 0, high = n - 1;
      while (low <= high) {
        indices.push(low++);
        if (low <= high) indices.push(high--);
      }
      return indices;
    }
    
    case 'diverge': {
      // Inside-out: start from middle, then alternate ±1, ±2, ...
      const indices: number[] = [];
      const midL = Math.floor((n - 1) / 2);
      const midR = Math.ceil((n - 1) / 2);
      let offset = 0;
      
      while (indices.length < n) {
        const a = midL - offset;
        const b = midR + offset;
        if (a >= 0) indices.push(a);
        if (b < n && b !== a) indices.push(b);
        offset++;
      }
      return indices;
    }
    
    case 'random': {
      // Fisher-Yates shuffle of indices
      const indices = Array.from({ length: n }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      return indices;
    }
    
    case 'chord':
      // All notes at once - return all indices
      return Array.from({ length: n }, (_, i) => i);
    
    default:
      return Array.from({ length: n }, (_, i) => i); // default to up
  }
}

export function harmonizeClip(
  clip: AbletonClip,
  degree1?: number,
  degree2?: number,
  degree3?: number,
  degree4?: number,
  scale: Scale = new Scale()
): AbletonClip {
  if (clip.notes.length === 0) {
    return clip.clone();
  }

  // Start with the original clip
  const harmonizedNotes: AbletonNote[] = [...clip.notes.map(n => ({ ...n }))];

  // Add harmonized voices for each provided degree
  const degrees = [degree1, degree2, degree3, degree4].filter(d => d !== undefined && d !== 0);
  
  degrees.forEach(degree => {
    const harmonizedClip = scaleTranspose(clip, degree, scale);
    harmonizedNotes.push(...harmonizedClip.notes.map(n => ({ ...n })));
  });

  harmonizedNotes.sort((a, b) => a.position - b.position);

  return new AbletonClip(
    clip.name + "_harmonized",
    clip.duration,
    harmonizedNotes
  );
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
  const actualStart = start > 0 ? start : 0;
  const actualEnd = end > 0 ? end : clip.duration
  return clip.timeSlice(actualStart, actualEnd);
}

export function durSlice(clip: AbletonClip, start: number, duration: number) {
  //if duration > clip.duration, loop the clip
  let newClip = clip.clone()
  if (duration >= clip.duration) {
    const numLoops = Math.ceil(duration / clip.duration) + 1
    newClip = clip.loop(numLoops)
    console.log("duration is greater than clip duration, looping", numLoops, "times")
  } else {
    console.log("duration is less than clip duration, not looping")
  }

  newClip = newClip.timeSlice(start, start + duration)
  return newClip
}

export function stacatto(clip: AbletonClip, duration: number): AbletonClip {
  duration = Math.min(1, duration)
  const newClip = clip.clone()
  newClip.notes.forEach(note => {
    note.duration = duration * note.duration
  })
  return newClip
}

export function nnotes(clip: AbletonClip, n: number, start: number = 0): AbletonClip {
  const nSortedNotes = clip.notes.map(n => ({ ...n })).sort((a, b) => a.position - b.position).slice(start, start + n)
  const startPosition = nSortedNotes[0].position
  nSortedNotes.forEach(note => {
    note.position -= startPosition
  })
  let newDuration = 0
  for(let i = 0; i < nSortedNotes.length; i++) {
    newDuration = Math.max(newDuration, nSortedNotes[i].position + nSortedNotes[i].duration)
  }
  return new AbletonClip(clip.name + "_nnotes", newDuration, nSortedNotes)
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
  sliderScale: ((slider: number, origClip?: AbletonClip) => number)[];
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
    sliderScale: [(n, c) => Math.floor(n * segmentByPitchMarker(c).length)]
  },

  s_tr: {
    name: 's_tr',
    transform: (clip, degree, scale: Scale = new Scale()) => scaleTranspose(clip, degree, scale),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => Math.floor(n*16 - 8)]
  },

  tr: {
    name: 'tr',
    transform: (clip, semitones) => clip.transpose(semitones),
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

  qstr: {
    name: 'qstr',
    transform: (clip, factor) => timeStretch(clip, factor),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => stretchValues[Math.floor(n*stretchValues.length)]]
  },

  stac: {
    name: 'stac',
    transform: (clip, duration) => stacatto(clip, duration),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => n]
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
    sliderScale: [(n, c) => n * c.duration, (n, c) => n * c.duration] 
  },
  dsl: {
    name: 'dsl',
    transform: (clip, start, duration) => durSlice(clip, start, duration),
    argParser: (args: string[]) => [numParse(args[0]), numParse(args[1])],
    sliderScale: [(n, c) => n * c.duration, (n, c) => n * c.duration]
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

  acc: {
    name: 'acc',
    transform: (clip, noteInd, velMult, durMult) => accentClip(clip, noteInd, velMult, durMult),
    argParser: (args: string[]) => [
      args[0] ? numParse(args[0]) : undefined,
      args[1] ? numParse(args[1]) : undefined,
      args[2] ? numParse(args[2]) : undefined,
    ],
    sliderScale: [
      (n, clip) => Math.round(n * (clip.notes.length - 1)), // 0-31, for clips up to 32 notes
      n => 1 + n * 3, // 1-4
      n => 1 + n * 3, // 1-4
    ]
  },

  arp: {
    name: 'arp',
    transform: (clip, pattern = 'up', subdivision = 0.25, gate = 0.9, distance = 0, steps = 1) => 
      arpeggiateClip(clip, pattern, subdivision, gate, distance, steps),
    argParser: (args: string[]) => [
      args[0] || 'up',
      numParse(args[1]) || 0.25,
      numParse(args[2]) || 0.9,
      numParse(args[3]) || 0,
      numParse(args[4]) || 1
    ],
    sliderScale: [
      n => Math.floor(n * arpeggioPatterns.length), // pattern indices
      n => n * 0.5, // subdivision: 0 to 0.5 quarter notes
      n => n, // gate: 0 to 1
      n => Math.floor(n * 24 - 12), // distance: -12 to 12 semitones
      n => Math.floor(n * 4) + 1 // steps: 1 to 4
    ]
  },

  harm: {
    name: 'harm',
    transform: (clip, degree1, degree2, degree3, degree4, scale: Scale = new Scale()) => 
      harmonizeClip(clip, degree1, degree2, degree3, degree4, scale),
    argParser: (args: string[]) => [
      args[0] ? numParse(args[0]) : undefined,
      args[1] ? numParse(args[1]) : undefined,
      args[2] ? numParse(args[2]) : undefined,
      args[3] ? numParse(args[3]) : undefined,
    ],
    sliderScale: [
      n => Math.floor(n*24 - 12), // -12 to 12 scale degrees
      n => Math.floor(n*24 - 12), // -12 to 12 scale degrees
      n => Math.floor(n*24 - 12), // -12 to 12 scale degrees
      n => Math.floor(n*24 - 12), // -12 to 12 scale degrees
    ]
  },

  nnotes: {
    name: 'nnotes',
    transform: (clip, n, start) => nnotes(clip, n, start),
    argParser: (args: string[]) => [numParse(args[0]), numParse(args[1])],
    sliderScale: [(n, c) => Math.floor(n * c.notes.length), (n, c) => Math.floor(n * c.notes.length)]
  }
};




