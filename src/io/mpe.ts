import { MIDIValInput, MIDIValOutput, type NoteMessage } from "@midival/core";

// ============ Types ============

export type MPEConfig = {
  zone: "lower" | "upper";
  masterChannel?: number;
  memberChannels?: [number, number];
  timbreCC?: number;
};

export type MPENoteStart = {
  channel: number;
  noteNum: number;
  velocity: number;
  pressure: number;
  timbre: number;
  bend: number;
};

export type MPENoteUpdate = {
  channel: number;
  noteNum: number;
  pressure: number;
  timbre: number;
  bend: number;
};

export type MPENoteEnd = {
  channel: number;
  noteNum: number;
  velocity: number;
};

export type MPEDeviceConfig = {
  zone: "lower" | "upper";
  masterChannel?: number;
  memberChannels?: [number, number];
  timbreCC?: number;
  noteOffVelocity?: number;
  overflow?: "oldest" | "none";
};

type Listener<T> = (event: T) => void;

type VoiceState = {
  noteNum: number | null;
  velocity: number;
  bend: number;
  pressure: number;
  timbre: number;
};

// ============ MPEInput ============

/**
 * MPEInput wraps a MIDIValInput and provides MPE-aware note events.
 * It tracks per-channel voice state and emits onNoteStart, onNoteUpdate, and onNoteEnd events.
 */
export class MPEInput {
  #input: MIDIValInput;
  #timbreCC: number;
  #memberSet: Set<number>;
  #voices: VoiceState[];
  #noteStartListeners = new Set<Listener<MPENoteStart>>();
  #noteUpdateListeners = new Set<Listener<MPENoteUpdate>>();
  #noteEndListeners = new Set<Listener<MPENoteEnd>>();
  #unsubscribers: (() => void)[] = [];

  constructor(input: MIDIValInput, config: MPEConfig) {
    this.#input = input;
    const defaults = defaultZone(config.zone);
    const memberRange = config.memberChannels ?? defaults.memberChannels;
    const masterChannel = config.masterChannel ?? defaults.masterChannel;
    this.#timbreCC = config.timbreCC ?? 74;

    const members: number[] = [];
    const min = Math.max(0, Math.min(15, memberRange[0]));
    const max = Math.max(0, Math.min(15, memberRange[1]));
    for (let ch = min; ch <= max; ch++) {
      if (ch !== masterChannel) members.push(ch);
    }
    this.#memberSet = new Set(members);
    this.#voices = new Array(16).fill(0).map(() => ({
      noteNum: null,
      velocity: 0,
      bend: 0,
      pressure: 0,
      timbre: 0,
    }));

    this.#setupListeners();
  }

  #setupListeners() {
    // Note On
    const noteOnUnsub = this.#input.onAllNoteOn((event: NoteMessage) => {
      if (!this.#memberSet.has(event.channel)) return;

      const voice = this.#voices[event.channel];
      voice.noteNum = event.note;
      voice.velocity = event.velocity;

      const payload: MPENoteStart = {
        channel: event.channel,
        noteNum: event.note,
        velocity: event.velocity,
        pressure: voice.pressure,
        timbre: voice.timbre,
        bend: voice.bend,
      };
      for (const fn of this.#noteStartListeners) fn(payload);
    });
    this.#unsubscribers.push(noteOnUnsub);

    // Note Off
    const noteOffUnsub = this.#input.onAllNoteOff((event: NoteMessage) => {
      if (!this.#memberSet.has(event.channel)) return;

      const voice = this.#voices[event.channel];
      if (voice.noteNum !== event.note) return;

      const payload: MPENoteEnd = {
        channel: event.channel,
        noteNum: event.note,
        velocity: event.velocity,
      };
      for (const fn of this.#noteEndListeners) fn(payload);

      voice.noteNum = null;
      voice.velocity = 0;
    });
    this.#unsubscribers.push(noteOffUnsub);

    // Pitch Bend
    const pitchBendUnsub = this.#input.onPitchBend((event) => {
      if (!this.#memberSet.has(event.channel)) return;

      const voice = this.#voices[event.channel];
      voice.bend = event.value;

      if (voice.noteNum !== null) {
        const payload: MPENoteUpdate = {
          channel: event.channel,
          noteNum: voice.noteNum,
          pressure: voice.pressure,
          timbre: voice.timbre,
          bend: voice.bend,
        };
        for (const fn of this.#noteUpdateListeners) fn(payload);
      }
    });
    this.#unsubscribers.push(pitchBendUnsub);

    // Channel Pressure (Aftertouch)
    const pressureUnsub = this.#input.onChannelPressure((event) => {
      if (!this.#memberSet.has(event.channel)) return;

      const voice = this.#voices[event.channel];
      voice.pressure = event.data1;

      if (voice.noteNum !== null) {
        const payload: MPENoteUpdate = {
          channel: event.channel,
          noteNum: voice.noteNum,
          pressure: voice.pressure,
          timbre: voice.timbre,
          bend: voice.bend,
        };
        for (const fn of this.#noteUpdateListeners) fn(payload);
      }
    });
    this.#unsubscribers.push(pressureUnsub);

    // Timbre (CC74 by default)
    const ccUnsub = this.#input.onControlChange(this.#timbreCC, (event) => {
      if (!this.#memberSet.has(event.channel)) return;

      const voice = this.#voices[event.channel];
      voice.timbre = event.data2;

      if (voice.noteNum !== null) {
        const payload: MPENoteUpdate = {
          channel: event.channel,
          noteNum: voice.noteNum,
          pressure: voice.pressure,
          timbre: voice.timbre,
          bend: voice.bend,
        };
        for (const fn of this.#noteUpdateListeners) fn(payload);
      }
    });
    this.#unsubscribers.push(ccUnsub);
  }

  close() {
    for (const unsub of this.#unsubscribers) {
      unsub();
    }
    this.#unsubscribers = [];
  }

  onNoteStart(fn: Listener<MPENoteStart>) {
    this.#noteStartListeners.add(fn);
    return () => this.#noteStartListeners.delete(fn);
  }

  onNoteUpdate(fn: Listener<MPENoteUpdate>) {
    this.#noteUpdateListeners.add(fn);
    return () => this.#noteUpdateListeners.delete(fn);
  }

  onNoteEnd(fn: Listener<MPENoteEnd>) {
    this.#noteEndListeners.add(fn);
    return () => this.#noteEndListeners.delete(fn);
  }

  /** Get active voice state for a channel (for debugging) */
  getVoiceState(channel: number): VoiceState | null {
    if (!this.#memberSet.has(channel)) return null;
    return { ...this.#voices[channel] };
  }
}

// ============ MPEDevice (Output with voice allocation) ============

type ActiveNote = {
  id: number;
  channel: number;
  noteNum: number;
};

/**
 * MPEDevice manages per-note MPE channels for output and returns a note handle you can mutate.
 */
export class MPEDevice {
  #output: MIDIValOutput;
  #timbreCC: number;
  #noteOffVelocity: number;
  #overflow: "oldest" | "none";
  #available: number[];
  #active = new Map<number, ActiveNote>();
  #activeIds = new Set<number>();
  #pitchMap = new Map<number, number[]>();
  #order: number[] = [];
  #nextId = 1;

  constructor(output: MIDIValOutput, config: MPEDeviceConfig) {
    this.#output = output;
    const defaults = defaultZone(config.zone);
    const memberRange = config.memberChannels ?? defaults.memberChannels;
    const masterChannel = config.masterChannel ?? defaults.masterChannel;
    this.#timbreCC = config.timbreCC ?? 74;
    this.#noteOffVelocity = config.noteOffVelocity ?? 64;
    this.#overflow = config.overflow ?? "oldest";

    const channels: number[] = [];
    const min = Math.max(0, Math.min(15, memberRange[0]));
    const max = Math.max(0, Math.min(15, memberRange[1]));
    for (let ch = min; ch <= max; ch++) {
      if (ch !== masterChannel) channels.push(ch);
    }
    this.#available = channels;
  }

  noteOn(
    noteNum: number,
    velocity: number,
    pitchBend?: number,
    pressure?: number,
    timbre?: number
  ): MPENoteRef | null {
    const channel = this.#allocateChannel();
    if (channel === null) return null;

    if (pitchBend !== undefined) {
      this.#output.sendPitchBend(pitchBend, channel);
    }
    if (pressure !== undefined) {
      this.#output.sendChannelPressure(pressure, channel);
    }
    if (timbre !== undefined) {
      this.#output.sendControlChange(this.#timbreCC, timbre, channel);
    }

    this.#output.sendNoteOn(noteNum, velocity, channel);

    const id = this.#nextId++;
    const note: ActiveNote = { id, channel, noteNum };
    this.#active.set(id, note);
    this.#activeIds.add(id);
    this.#order.push(id);

    const stack = this.#pitchMap.get(noteNum) ?? [];
    stack.push(id);
    this.#pitchMap.set(noteNum, stack);

    return new MPENoteRef(this, id);
  }

  noteOff(noteNum: number, velocity?: number): boolean {
    const stack = this.#pitchMap.get(noteNum);
    if (!stack || stack.length === 0) return false;
    const id = stack[stack.length - 1];
    return this.#noteOffById(id, velocity);
  }

  allNotesOff(): void {
    const ids = Array.from(this.#activeIds);
    for (const id of ids) {
      this.#noteOffById(id, this.#noteOffVelocity);
    }
  }

  pitchBend(noteRef: MPENoteRef, bend: number): boolean {
    return this.#pitchBendById(noteRef.id, bend);
  }

  pressure(noteRef: MPENoteRef, pressure: number): boolean {
    return this.#pressureById(noteRef.id, pressure);
  }

  timbre(noteRef: MPENoteRef, value: number): boolean {
    return this.#timbreById(noteRef.id, value);
  }

  // Internal methods exposed for MPENoteRef
  _noteOffById(id: number, velocity?: number): boolean {
    return this.#noteOffById(id, velocity);
  }

  _pitchBendById(id: number, bend: number): boolean {
    return this.#pitchBendById(id, bend);
  }

  _pressureById(id: number, pressure: number): boolean {
    return this.#pressureById(id, pressure);
  }

  _timbreById(id: number, value: number): boolean {
    return this.#timbreById(id, value);
  }

  #noteOffById(id: number, _velocity?: number): boolean {
    if (!this.#activeIds.has(id)) return false;
    const note = this.#active.get(id);
    if (!note) return false;

    // Note: MIDIVal's sendNoteOff doesn't support velocity parameter
    this.#output.sendNoteOff(note.noteNum, note.channel);
    this.#active.delete(id);
    this.#activeIds.delete(id);

    this.#removeFromOrder(id);
    this.#removeFromPitch(note.noteNum, id);
    this.#available.push(note.channel);
    return true;
  }

  #pitchBendById(id: number, bend: number): boolean {
    if (!this.#activeIds.has(id)) return false;
    const note = this.#active.get(id);
    if (!note) return false;
    this.#output.sendPitchBend(bend, note.channel);
    return true;
  }

  #pressureById(id: number, pressure: number): boolean {
    if (!this.#activeIds.has(id)) return false;
    const note = this.#active.get(id);
    if (!note) return false;
    this.#output.sendChannelPressure(pressure, note.channel);
    return true;
  }

  #timbreById(id: number, value: number): boolean {
    if (!this.#activeIds.has(id)) return false;
    const note = this.#active.get(id);
    if (!note) return false;
    this.#output.sendControlChange(this.#timbreCC, value, note.channel);
    return true;
  }

  #allocateChannel(): number | null {
    if (this.#available.length > 0) {
      return this.#available.shift() ?? null;
    }

    if (this.#overflow === "oldest" && this.#order.length > 0) {
      const oldestId = this.#order[0];
      this.#noteOffById(oldestId, this.#noteOffVelocity);
      return this.#available.shift() ?? null;
    }

    return null;
  }

  #removeFromOrder(id: number) {
    const idx = this.#order.indexOf(id);
    if (idx >= 0) this.#order.splice(idx, 1);
  }

  #removeFromPitch(noteNum: number, id: number) {
    const stack = this.#pitchMap.get(noteNum);
    if (!stack) return;
    const idx = stack.indexOf(id);
    if (idx >= 0) stack.splice(idx, 1);
    if (stack.length === 0) this.#pitchMap.delete(noteNum);
  }
}

/**
 * MPENoteRef is a handle to an active MPE note that can be mutated.
 * Methods become no-ops once the note is off.
 */
export class MPENoteRef {
  #device: MPEDevice;
  #id: number;

  constructor(device: MPEDevice, id: number) {
    this.#device = device;
    this.#id = id;
  }

  get id(): number {
    return this.#id;
  }

  pitchBend(bend: number): void {
    this.#device._pitchBendById(this.#id, bend);
  }

  pressure(value: number): void {
    this.#device._pressureById(this.#id, value);
  }

  timbre(value: number): void {
    this.#device._timbreById(this.#id, value);
  }

  noteOff(velocity?: number): void {
    this.#device._noteOffById(this.#id, velocity);
  }
}

// ============ Helper for MIDIValInput ============

/**
 * Helper function to create an MPEInput from a MIDIValInput.
 * Can be used as: input.asMPE(config) if extended, or asMPE(input, config)
 */
export function asMPE(input: MIDIValInput, config: MPEConfig): MPEInput {
  return new MPEInput(input, config);
}

// ============ Utility ============

function defaultZone(zone: "lower" | "upper") {
  if (zone === "upper") {
    return { masterChannel: 15, memberChannels: [0, 14] as [number, number] };
  }
  return { masterChannel: 0, memberChannels: [1, 15] as [number, number] };
}
