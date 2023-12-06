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
  notes: AbletonNote[];
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

}

export const clipMap = new Map<string, AbletonClip>();

ws.onopen = () => {
  console.log('Connected to server');
};

ws.onmessage = (message) => {
  console.log(`Received message from server: ${message.data.slice(0, 100)}`);
  const mes = JSON.parse(message.data);
  if (mes.type === 'clipMap') {
    clipMap.clear();
    Object.entries(mes.data).forEach(([key, value]: [string, AbletonClip]) => {
      const actualClip = new AbletonClip(value.name, value.duration, value.notes);
      clipMap.set(key, actualClip);
    });
    console.log('clipMap updated', clipMap);
  }
};

ws.onclose = () => {
  console.log('Disconnected from server');
};