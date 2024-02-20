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

  deltas() {
    return positionsToDeltas(this.notes.map(note => note.position), this.duration);
  }

  peek(): { note: AbletonNote, preDelta: number, postDelta?: number } {
    const note = this.notes[this.index];
    const deltas = this.deltas()
    const preDelta = deltas[this.index];
    const postDelta = deltas[this.notes.length];
    return this.index === this.notes.length - 1 ? { note, preDelta, postDelta } : { note, preDelta };
  }

  next(): { note: AbletonNote,  preDelta: number, postDelta?: number } {
    const retVal = this.peek();
    this.index = (this.index + 1) % this.notes.length;
    return retVal
  }

  clone() {
    const noteClone = this.notes.map(note => ({ ...note }));
    return new AbletonClip(this.name, this.duration, noteClone);
  }

  scale(factor: number) {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.position *= factor;
      note.duration *= factor;
    });
    clone.duration *= factor;
    return clone;
  }

  shift(delta: number) {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.position += delta;
    });
    const maxEnd = clone.notes.reduce((max, note) => Math.max(max, note.position + note.duration), 0);
    clone.duration = Math.max(maxEnd, clone.duration);
    return clone;
  }

  transpose(delta: number) {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.pitch += delta;
    });
    return clone;
  }

  scaleTranspose(tranpose: number, scale: Scale) {
    const clone = this.clone();
    clone.notes.forEach(note => {
      note.pitch = scale.getByIndex(scale.getIndFromPitch(note.pitch) + tranpose)
    });
    return clone;
  }

  timeSlice(start: number, end: number) {
    const clone = this.clone();
    clone.notes = clone.notes.filter(note => note.position + note.duration >= start && note.position <= end)
    clone.notes.filter(note => note.position + note.duration > end).forEach(note => note.duration = end - note.position)

    clone.notes.filter(note => note.position < start).forEach(note => note.duration = note.duration - (start - note.position))
    clone.notes.filter(note => note.position < start).forEach(note => note.position = start)

    clone.notes.forEach(note => note.position -= start)
    clone.duration = end - start
    return clone
  }

  noteBuffer() {
    return this.notes.map(() => this.next())
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




