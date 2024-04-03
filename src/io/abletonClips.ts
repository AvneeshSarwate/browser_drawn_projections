import type { Scale } from "@/music/scale";

const ws = new WebSocket('ws://localhost:8080');

//todo api - consolidate AbletonNote/Clip type def with the one in alsParsing.ts
export type AbletonNote = { pitch: number, duration: number, velocity: number, position: number } 
// export type AbletonClip = { name: string, duration: number, notes: AbletonNote[] }


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
    return this.index === this.notes.length - 1 ? { note, preDelta, postDelta } : { note, preDelta };
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

  scale(factor: number): AbletonClip {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.position *= factor;
      note.duration *= factor;
    });
    clone.duration *= factor;
    return clone;
  }

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
    clone.duration = end - start
    return clone
  }

  noteBuffer(): NoteWithDelta[] {
    return this.notes.map(() => this.next())
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
}

export const clipMap = new Map<string, AbletonClip>();


ws.onopen = () => {
  console.log('Connected to server');
};

ws.onclose = () => {
  console.log('Disconnected from server');
};

export async function INITIALIZE_ABLETON_CLIPS(fileName: string) {

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




