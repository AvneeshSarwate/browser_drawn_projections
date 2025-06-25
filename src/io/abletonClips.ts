import type { Scale } from "@/music/scale";

const ws = new WebSocket('ws://localhost:8080');

//todo api - consolidate AbletonNote/Clip type def with the one in alsParsing.ts
export type AbletonNote<T = any> = { 
  pitch: number,
  duration: number,
  velocity: number,
  offVelocity: number,
  probability: number,
  position: number,
  isEnabled: boolean,
  metadata?: T
}
// export type AbletonClip = { name: string, duration: number, notes: AbletonNote[] }
export const quickNote = <T = any>(pitch: number, duration: number, velocity: number, position: number, metadata?: T): AbletonNote<T> => {
  return { pitch, duration, velocity, offVelocity: velocity, probability: 1, position, isEnabled: true, metadata }
}

export type AbletonClipRawData = {
  name: string;
  duration: number;
  notes: {
    pitch: number;
    duration: number;
    velocity: number;
    offVelocity: number;
    probability: number;
    position: number;
    isEnabled: boolean;
  }[];
};


function positionsToDeltas(positions: number[], totalTime?: number) {
  const deltas: number[] = [];
  positions.forEach((pos, i) => {
    const delta = i === 0 ? pos : pos - positions[i - 1]
    deltas.push(delta);
  });
  if (totalTime) { 
    const lastPos = positions[positions.length - 1];
    const lastDelta = totalTime - lastPos;
    deltas.push(lastDelta);
  }
  return deltas;
}

type NoteWithDelta = { note: AbletonNote, preDelta: number, postDelta?: number }

export class AbletonClip {
  name: string;
  duration: number;
  notes: AbletonNote[]; //todo api - it is assumed these are sorted by note.position - enforce this
  index: number = 0
  constructor(name: string, duration: number, notes: AbletonNote[]) {
    this.name = name;
    this.duration = duration;
    this.notes = notes;
  }

  deltas(): number[] {
    return positionsToDeltas(this.notes.map(note => note.position), this.duration);
  }

  peek(): NoteWithDelta {
    const note = this.notes[this.index];
    const deltas = this.deltas()
    const preDelta = deltas[this.index];
    const postDelta = deltas[this.notes.length];
    return this.index === this.notes.length - 1 ? { note, preDelta, postDelta } : { note, preDelta, postDelta: 0 };
  }

  next(): NoteWithDelta {
    const retVal = this.peek();
    this.index = (this.index + 1) % this.notes.length;
    return retVal
  }

  clone(): AbletonClip {
    const noteClone = this.notes.map(note => ({ ...note }));
    return new AbletonClip(this.name, this.duration, noteClone);
  }

  //time stretch
  scale(factor: number): AbletonClip {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.position *= factor;
      note.duration *= factor;
    });
    clone.duration *= factor;
    return clone;
  }

  //time shift
  shift(delta: number): AbletonClip {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.position += delta;
    });
    const maxEnd = clone.notes.reduce((max, note) => Math.max(max, note.position + note.duration), 0);
    clone.duration = Math.max(maxEnd, clone.duration);
    return clone;
  }

  transpose(delta: number): AbletonClip {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.pitch += delta;
    });
    return clone;
  }

  scaleTranspose(tranpose: number, scale: Scale): AbletonClip {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.pitch = scale.getByIndex(scale.getIndFromPitch(note.pitch) + tranpose)
    });
    return clone;
  }

  timeSlice(start: number, end: number): AbletonClip {
    const clone = this.clone();
    clone.notes = clone.notes.filter(note => note.position + note.duration >= start && note.position <= end)
    clone.notes.filter(note => note.position + note.duration > end).forEach(note => note.duration = end - note.position)

    clone.notes.filter(note => note.position < start).forEach(note => note.duration = note.duration - (start - note.position))
    clone.notes.filter(note => note.position < start).forEach(note => note.position = start)

    clone.notes.forEach(note => note.position -= start)

    //filter out notes with duration <= 0
    clone.notes = clone.notes.filter(note => note.duration > 0)

    clone.duration = end - start
    return clone
  }

  //every note has a preDelta, only last note has a postDelta
  noteBuffer(): NoteWithDelta[] {
    const oldIndex = this.index
    this.index = 0
    const retVal = this.notes.map(() => this.next())
    this.index = oldIndex
    return retVal
  }

  static concat(...clips: AbletonClip[]): AbletonClip {
    const durations = clips.map(clip => clip.duration)
    const startShifts = [0]
    durations.slice(0, -1).forEach((duration, i) => {
      startShifts.push(startShifts[i] + duration)
    })
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0)
    const clones = clips.map((clip, i) => clip.shift(startShifts[i]))
    return new AbletonClip('concat', totalDuration, clones.flatMap(clip => clip.notes))
  }

  loop(n: number) {
    const shallowClones = Array.from({ length: n }, () => this)
    return AbletonClip.concat(...shallowClones)
  }

  filterDisabledNotes() {
    const newNotes = this.notes.filter(note => note.isEnabled)
    return new AbletonClip(this.name, this.duration, newNotes)
  }
}

export const clipMap = new Map<string, AbletonClip>();


ws.onopen = () => {
  console.log('Connected to server');
};

ws.onclose = () => {
  console.log('Disconnected from server');
};

//requires alsParsing.ts to be running
export async function INITIALIZE_ABLETON_CLIPS(fileName: string, staticClipData?: Record<string, AbletonClipRawData>, forceJson?: boolean) {

  // ── Production — use static data and return immediately ──────────────
  if (import.meta.env.PROD || forceJson) {
    if (!staticClipData) {
      console.warn(
        'INITIALIZE_ABLETON_CLIPS called in production without static clip data; clipMap left empty.'
      );
      return;
    }

    clipMap.clear();
    (Object.entries(staticClipData) as [string, AbletonClip][]).forEach(
      ([key, value]) =>
        clipMap.set(key, new AbletonClip(value.name, value.duration, value.notes))
    );
    console.log('Ableton clips initialised from static data →', clipMap);
    return;                        // synchronous in prod
  }


  const ABLETON_CLIPS_READY = new Promise<void>((resolve) => {

    ws.onmessage = (message) => {
      console.log(`Received message from server: ${message.data.slice(0, 100)}`);
      const mes = JSON.parse(message.data);
      if (mes.type === 'fresh_clipMap' || mes.type === 'clipMap') { //see alsParsing.ts for message types - fresh_clipMap indicates first load of a new file, clipMap is a hot reload
        clipMap.clear();
        Object.entries(mes.data).forEach(([key, value]: [string, AbletonClip]) => {
          const actualClip = new AbletonClip(value.name, value.duration, value.notes);
          console.log("clip updated for", key)
            clipMap.set(key, actualClip);
        });
        console.log('clipMap updated', clipMap);
        if (mes.type === 'fresh_clipMap') resolve()
      }
    };
    
  })

  ws.send(JSON.stringify({ type: 'file', fileName }))

  return ABLETON_CLIPS_READY
}




/*
different types of transformations (for now, of monophonic material)
- vertical stretch/squash (keeps same melodic contour)
    optionally stays in scale
    can optionally be centered on a note
- inversion
    optionally stays in scale
    can optionally be centered on a note
- retrograde
- be able to apply these transforms to a time slice of a clip
- lerp between two different melodic contours?
    create a multi-segment line from where the notes are,
    fill in the blank subdivisions with interpolated notes,
    then lerp, then drop the interpolated notes to retain original rhythm

*/


/*
add a quick way to take some clip manipulations and render them out 
to a midi file (so you can import them back to ableton). this also
requires changing/adding some data to the AbletonClip class, or adding
some "renderer" class that can be written to (which holds the data) before
being written to a midi file.

If you add a targetClip.writeNotes(startOffset, sourceClip) method, 
that could be enough? Would need to handle note overlaps (do the same way 
ableton does? or add other options?)
)
*/

/*
- already have a helper for abstract chords/scales
- and already have a helper for rendered notes
- need a helper for abstract rhythms
- between chords/scales + rhythms, can generate rendered melodies
- also might need a helper for synth param ramps/expressions
- also might need a melodic countour helper

with these building blocks, can start composing generative music
with "mid level" abstractions that are more concrete than rules
but less explicit than explicit melodic/harmonic fragments

*/