import { AbletonClip, type AbletonNote } from '@/io/abletonClips';
import { Scale } from '@/music/scale';
import { easingMap } from './easingMap';

/**
 * IMPORTANT: Clip Transform Invariants
 * 
 * When writing transform functions, ensure:
 * 
 * 1. Clip duration must accurately reflect note boundaries:
 *    - After modifying notes, update clip.duration if notes extend beyond the original duration
 *    - OR ensure notes never extend beyond clip.duration
 *    - Failure to maintain this invariant can cause NaN in easing functions (see ease/easeCirc)
 * 
 * 2. Beware of floating point precision errors:
 *    - Operations like timeStretch can produce note ends that are slightly > clip.duration
 *      (e.g., 8.801856 vs 8.801855999999999)
 *    - This can break assumptions in transforms that divide by duration
 *    - See easeCirc and ease functions for examples of defensive clamping
 */

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

export function retrogradeClip(clip: AbletonClip, enable: number = 1): AbletonClip {
  if (clip.notes.length === 0 || enable <= 0.5) {
    return clip.clone();
  }

  const newNotes: AbletonNote[] = clip.notes.map((note) => ({
    ...note,
    position: clip.duration - (note.position + note.duration),
  }));

  // Ensure notes are sorted by their new positions
  newNotes.sort((a, b) => a.position - b.position);

  const result = new AbletonClip(clip.name + "_retrograde", clip.duration, newNotes);
  
  // Check if any notes extend beyond clip duration
  const maxEnd = result.notes.reduce((max, n) => Math.max(max, n.position + n.duration), 0);
  if (maxEnd > result.duration) {
    console.warn(`[retrogradeClip] Notes extend beyond duration: ${maxEnd} > ${result.duration}`);
  }
  
  return result;
}

export function invertClip(
  clip: AbletonClip,
  scaleKey: string = 'C',
  enable: number = 1,
  axis?: number // optional - deviation of scale degree from the root
): AbletonClip {
  if (clip.notes.length < 2 || enable <= 0.5) {
    return clip.clone();
  }

  const scale = scaleMap[scaleKey] || new Scale();
  const clonedNotes = clip.notes.map(note => ({ ...note }));

  const axisIndex = axis ?? scale.getIndFromPitch(clonedNotes[0].pitch);

  const invertedNotes = clonedNotes.map(note => {
    const originalIndex = scale.getIndFromPitch(note.pitch);
    const invertedIndex = 2 * axisIndex - originalIndex;
    return {
      ...note,
      pitch: scale.getByIndex(invertedIndex),
    };
  });

  const result = new AbletonClip(
    clip.name + "_inverted",
    clip.duration,
    invertedNotes
  );
  
  // Check if any notes extend beyond clip duration
  const maxEnd = result.notes.reduce((max, n) => Math.max(max, n.position + n.duration), 0);
  if (maxEnd > result.duration) {
    console.warn(`[invertClip] Notes extend beyond duration: ${maxEnd} > ${result.duration}`);
  }
  
  return result;
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
  } else {
    targetIndex = noteInd;
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
  const result = clip.scale(Math.max(0.01, factor));
  
  // Check if any notes extend beyond clip duration
  const maxEnd = result.notes.reduce((max, n) => Math.max(max, n.position + n.duration), 0);
  if (maxEnd > result.duration) {
    console.warn(`[timeStretch] Notes extend beyond duration: ${maxEnd} > ${result.duration}`);
  }
  
  return result;
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
  const result = clip.scaleTranspose(transpose, scale);
  
  // Check if any notes extend beyond clip duration
  const maxEnd = result.notes.reduce((max, n) => Math.max(max, n.position + n.duration), 0);
  if (maxEnd > result.duration) {
    console.warn(`[scaleTranspose] Notes extend beyond duration: ${maxEnd} > ${result.duration}`);
  }
  
  return result;
}

export function scaleTransposeOneNote(clip: AbletonClip, transpose: number, noteInd: number, scale?: Scale): AbletonClip {
  if(!scale) {
    scale = new Scale();
  }
  const newClip = clip.clone();
  newClip.notes[noteInd].pitch = scale.getByIndex(scale.getIndFromPitch(newClip.notes[noteInd].pitch) + transpose);
  return newClip;
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

export function velocityMultiply(clip: AbletonClip, factor: number): AbletonClip {
  const newClip = clip.clone();
  newClip.notes.forEach(note => {
    note.velocity *= factor;
  });
  return newClip;
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

  if(!scale) {
    scale = new Scale()
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

export function scaleSwap(clip: AbletonClip, scale1: Scale, scale2: Scale): AbletonClip {
  if(!scale1 || !scale2) {
    return clip.clone()
  }
  const newClip = clip.clone()
  newClip.notes.forEach(note => {
    note.pitch = scale2.getByIndex(scale1.getIndFromPitch(note.pitch))
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


const mix = (a: number, b: number, amount: number) => {
  return a * (1 - amount) + b * amount
}

/**
 * Apply easing to note positions within a clip.
 * 
 * WARNING: This function assumes notes do not extend beyond clip.duration.
 * Floating point errors from prior transforms (e.g., timeStretch producing 8.801856 > 8.801855999999999)
 * can cause posNorm/endNorm to slightly exceed 1.0, leading to NaN in some easing functions.
 * If you encounter NaN issues, add clamping like in easeCirc.
 */
export function ease(clip: AbletonClip, easeType: string, amount: number = 1): AbletonClip {
  const newClip = clip.clone()
  const duration = newClip.duration
  newClip.notes.forEach(note => {
    const posNorm = note.position / duration
    const endNorm = (note.position + note.duration)/duration
    note.position = mix(posNorm, easingMap[easeType](posNorm), amount) * duration
    const endTime = mix(endNorm, easingMap[easeType](endNorm), amount) * duration
    note.duration = endTime - note.position
  })
  return newClip
}

/**
 * Apply circular easing with bidirectional blending.
 * - amount = 0: ease out circ
 * - amount = 0.5: linear (no easing)
 * - amount = 1: ease in circ
 * 
 * WARNING: Circular easing functions use Math.sqrt(1 - x*x), which produces NaN when x > 1.
 * Due to floating point errors from prior transforms (e.g., timeStretch producing 
 * note ends slightly > clip.duration), we MUST clamp normalized positions to [0, 1].
 * Even tiny errors like 1.0000000000000001 will cause NaN!
 */
export function easeCirc(clip: AbletonClip, amount: number): AbletonClip {
  amount = 1 - amount
  const newClip = clip.clone()
  const duration = newClip.duration
  
  const blend = (amount: number, x: number) => {
    if (amount < 0.5) {
      const blendAmt = amount * 2
      return mix(easingMap['outCirc'](x), x, blendAmt)
    } else {
      const blendAmt = (amount - 0.5) * 2
      return mix(x, easingMap['inCirc'](x), blendAmt)
    }
  }
  
  newClip.notes.forEach(note => {
    // CRITICAL: Clamp to [0, 1] to prevent NaN from sqrt(1 - x*x) when x > 1 due to floating point errors
    const posNorm = Math.max(0, Math.min(1, note.position / duration))
    const endNorm = Math.max(0, Math.min(1, (note.position + note.duration) / duration))
    note.position = blend(amount, posNorm) * duration
    const endTime = blend(amount, endNorm) * duration
    note.duration = endTime - note.position
  })
  
  // Check if any notes extend beyond clip duration
  const maxEnd = newClip.notes.reduce((max, n) => Math.max(max, n.position + n.duration), 0);
  if (maxEnd > newClip.duration) {
    console.warn(`[easeCirc] Notes extend beyond duration: ${maxEnd} > ${newClip.duration}`);
  }
  
  return newClip
}

export function repeatNotes(clip: AbletonClip, n: number): AbletonClip {
  if (clip.notes.length === 0 || n <= 0) {
    return clip.clone();
  }
  
  const sortedNotes = [...clip.notes].sort((a, b) => a.position - b.position);
  const repeatedNotes: AbletonNote[] = [];
  let currentPosition = 0;
  
  for (let i = 0; i < sortedNotes.length; i++) {
    const note = sortedNotes[i];
    const nextNote = i < sortedNotes.length - 1 ? sortedNotes[i + 1] : null;
    const gapToNext = nextNote ? (nextNote.position - (note.position + note.duration)) : 0;
    
    for (let rep = 0; rep < n; rep++) {
      repeatedNotes.push({
        ...note,
        position: currentPosition + rep * note.duration
      });
    }
    
    currentPosition += n * note.duration + gapToNext;
  }
  
  const newDuration = repeatedNotes.reduce(
    (max, note) => Math.max(max, note.position + note.duration),
    0
  );
  
  return new AbletonClip(clip.name + "_repeated", newDuration, repeatedNotes);
}

export function rotateClip(clip: AbletonClip, rotation: number = 0.5): AbletonClip {
  if (clip.notes.length === 0 || Math.abs(rotation - 0.5) < 0.001) {
    return clip.clone();
  }

  const dur = clip.duration;
  // Map [0..1] with 0.5 = identity, >0.5 forward, <0.5 backward, full sweep
  const shift = (rotation - 0.5) * 2 * dur;
  const cut = ((shift % dur) + dur) % dur; // 0 <= cut < dur
  
  if (cut < 0.001) {
    return clip.clone();
  }
  
  const front = clip.timeSlice(cut, dur);
  const back = clip.timeSlice(0, cut);
  
  const result = AbletonClip.concat(front, back);
  
  // Check if any notes extend beyond clip duration
  const maxEnd = result.notes.reduce((max, n) => Math.max(max, n.position + n.duration), 0);
  if (maxEnd > result.duration) {
    console.warn(`[rotateClip] Notes extend beyond duration: ${maxEnd} > ${result.duration}`);
  }
  
  return result;
}

export function ornamentClip(
  clip: AbletonClip,
  probability: number = 0.5,
  scaleKey: string = 'C'
): AbletonClip {
  if (clip.notes.length === 0) {
    return clip.clone();
  }

  const scale = scaleMap[scaleKey] || new Scale();
  // Sort notes by position to handle time-shifting correctly for monophonic lines
  const sortedNotes = [...clip.notes].sort((a, b) => a.position - b.position);
  const newNotes: AbletonNote[] = [];
  let timeShift = 0;

  sortedNotes.forEach(note => {
    // Apply accumulated shift to current note's position
    const shiftedStart = note.position + timeShift;

    if (note.duration <= 0.25 || Math.random() > probability) {
      newNotes.push({ 
        ...note, 
        position: shiftedStart 
      });
      return;
    }

    const ornamentType = Math.floor(Math.random() * 4);
    const durFactor = 0.25 + Math.random() * 0.5;
    const unitDur = note.duration * durFactor;
    const totalOrnDur = unitDur * 3;
    
    // Update time shift for subsequent notes based on duration change
    // (newDuration - oldDuration)
    timeShift += (totalOrnDur - note.duration);

    const baseIndex = scale.getIndFromPitch(note.pitch);
    
    const createNote = (pitchIndex: number, offsetIndex: number) => ({
      ...note,
      pitch: scale.getByIndex(pitchIndex),
      position: shiftedStart + (offsetIndex * unitDur),
      duration: unitDur
    });

    // 0: Trill Up (A, A+1, A)
    // 1: Trill Down (A, A-1, A)
    // 2: Run Up (A, A+1, A+2)
    // 3: Run Down (A, A-1, A-2)

    if (ornamentType === 0) {
      newNotes.push(createNote(baseIndex, 0));
      newNotes.push(createNote(baseIndex + 1, 1));
      newNotes.push(createNote(baseIndex, 2));
    } else if (ornamentType === 1) {
      newNotes.push(createNote(baseIndex, 0));
      newNotes.push(createNote(baseIndex - 1, 1));
      newNotes.push(createNote(baseIndex, 2));
    } else if (ornamentType === 2) {
      newNotes.push(createNote(baseIndex, 0));
      newNotes.push(createNote(baseIndex + 1, 1));
      newNotes.push(createNote(baseIndex + 2, 2));
    } else {
      newNotes.push(createNote(baseIndex, 0));
      newNotes.push(createNote(baseIndex - 1, 1));
      newNotes.push(createNote(baseIndex - 2, 2));
    }
  });
  
  // No need to resort as we processed in order and preserved relative order
  
  const newDuration = newNotes.reduce((max, n) => Math.max(max, n.position + n.duration), 0);
  // Ensure clip is at least as long as original, plus any net expansion
  const finalDur = Math.max(clip.duration + timeShift, newDuration);

  return new AbletonClip(clip.name + "_ornamented", finalDur, newNotes);
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

const silenceClip = (clip: AbletonClip, duration: number) => {
  return new AbletonClip(clip.name + "_silence", duration, [])
}

const scaleMap: Record<string, Scale> = {
  'C': new Scale(),
  'dR7': new Scale([0, 1, 4, 6, 7, 9, 11, 12], 62),
  'dR5': new Scale([0, 4, 6, 9, 11, 12], 62),
  'ebR7': new Scale([0, 3, 4, 5, 6, 9, 11, 12], 63),
  'ebR5': new Scale([0, 4, 6, 9, 11, 12], 63),
}

/**
 *  Registry that is used by the live-coding text parser.
 *  The first argument is **always** the current clip, the rest are the
 *  parameters parsed from the text (numbers or strings, some of which may be references to sliders).
 */
export const TRANSFORM_REGISTRY: Record<string, ClipTransform> = {
  orn: {
    name: 'orn',
    transform: (clip, prob, scaleKey) => ornamentClip(clip, prob, scaleKey),
    argParser: (args: string[]) => [numParse(args[0]), args[1] || 'C'],
    sliderScale: [n => n]
  },

  seg: {
    name: 'seg',
    transform: (clip, index) => segment(clip, index),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [(n, c) => Math.floor(n * segmentByPitchMarker(c).length)]
  },

  s_tr: {
    name: 's_tr',
    transform: (clip, degree, scaleKey = 'C') => scaleTranspose(clip, degree, scaleMap[scaleKey]),
    argParser: (args: string[]) => [numParse(args[0]), args[1] || 'C'],
    sliderScale: [n => Math.floor(n*16 - 8)]
  },
  
  s_tr_i: {
    name: 's_tr_i',
    transform: (clip, degree, scaleKey = 'C', noteInd) => scaleTransposeOneNote(clip, degree, noteInd, scaleMap[scaleKey]),
    argParser: (args: string[]) => [numParse(args[0]),  args[1] || 'C', numParse(args[2])],
    sliderScale: [n => Math.floor(n*16 - 8), n => n, (n, c) => Math.floor(n * (c.notes.length - 1))]
  },

  ease: {
    name: 'ease',
    transform: (clip, easeType, amount) => ease(clip, easeType, amount),
    argParser: (args: string[]) => [args[0], numParse(args[1])],
    sliderScale: [n => n, n => n]
  },

  easeCirc: {
    name: 'easeCirc',
    transform: (clip, amount) => easeCirc(clip, amount),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => n]
  },

  tr: {
    name: 'tr',
    transform: (clip, semitones) => clip.transpose(semitones),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => Math.floor(n*16 - 8)]
  },

  transpose: {
    name: 'transpose',
    transform: (clip, degree, scaleKey = 'C') => scaleTranspose(clip, degree, scaleMap[scaleKey]),
    argParser: (args: string[]) => [numParse(args[0]), args[1] || 'C'],
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
    transform: (clip, enable) => retrogradeClip(clip, enable),
    argParser: (args: string[]) => [args[0] ? numParse(args[0]) : 1],
    sliderScale: [n => n]
  },
  
  inv: {
    name: 'inv',
    transform: (clip, scaleKey, enable, axis) => invertClip(clip, scaleKey, enable, axis),
    argParser: (args: string[]) => [args[0] || 'C', args[1] ? numParse(args[1]) : 1, args[2] ? numParse(args[2]) : undefined],
    sliderScale: [n => n, n => n, n => n*24 - 12]
  },

  acc: {
    name: 'acc',
    transform: (clip, noteInd, velMult, durMult) => accentClip(clip, noteInd, velMult, durMult),
    argParser: (args: string[]) => [
      args[0] ? numParse(args[0]) : undefined,
      args[1] ? numParse(args[1]) : 2,
      args[2] ? numParse(args[2]) : 2,
    ],
    sliderScale: [
      (n, clip) => Math.round(n * (clip.notes.length - 1)), 
      n => 1 + n * 3, // 1-4
      n => 1 + n * 3, // 1-4
    ]
  },

  silence: {
    name: 'silence',
    transform: (clip, duration) => silenceClip(clip, duration),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => n]
  },

  scSwap: {
    name: 'scSwap',
    transform: (clip, scale1, scale2) => scaleSwap(clip, scaleMap[scale1], scaleMap[scale2]),
    argParser: (args: string[]) => [args[0] || 'C', args[1] || 'C'],
    sliderScale: [n => Math.floor(n*16 - 8), n => Math.floor(n*16 - 8)]
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
    transform: (clip, scale, degree1, degree2, degree3, degree4) => 
      harmonizeClip(clip, degree1, degree2, degree3, degree4, scaleMap[scale]),
    argParser: (args: string[]) => [
      args[0] || 'C',
      args[1] ? numParse(args[1]) : undefined,
      args[2] ? numParse(args[2]) : undefined,
      args[3] ? numParse(args[3]) : undefined,
      args[4] ? numParse(args[4]) : undefined,
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
  },

  velMul: {
    name: 'velMul',
    transform: (clip, factor) => velocityMultiply(clip, factor),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [(n, c) => Math.floor(n * 10)]
  },

  rep: {
    name: 'rep',
    transform: (clip, n) => repeatNotes(clip, n),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => Math.floor(n * 8) + 1] // 1 to 8 repetitions
  },

  rot: {
    name: 'rot',
    transform: (clip, rotation) => rotateClip(clip, rotation),
    argParser: (args: string[]) => [numParse(args[0])],
    sliderScale: [n => n] // 0 to 1, where 0.5 is identity
  }
};




