import type { MPEPolySynth, MPEVoiceGraph } from "@/music/mpeSynth";
import { MIDIVal, MIDIValInput, MIDIValOutput } from "@midival/core";

export const midiInputs: Map<string, MIDIValInput> = new Map();
export const midiOutputs: Map<string, MIDIValOutput> = new Map()

export const MIDI_READY = MIDIVal.connect().then((accessObject) => {
  accessObject.inputs.forEach((input) => {
    console.log("midi input", input.name);
    midiInputs.set(input.name, new MIDIValInput(input));
  });
  accessObject.outputs.forEach((output) => {
    console.log("midi output", output.name);
    midiOutputs.set(output.name, new MIDIValOutput(output));
  });
});

MIDIVal.onInputDeviceConnected((accessObject) => {
  midiInputs.set(accessObject.name, new MIDIValInput(accessObject));
})

MIDIVal.onInputDeviceDisconnected((accessObject) => {
  midiInputs.delete(accessObject.name);
})

MIDIVal.onOutputDeviceConnected((accessObject) => {
  midiOutputs.set(accessObject.name, new MIDIValOutput(accessObject));
})

MIDIVal.onOutputDeviceDisconnected((accessObject) => {
  midiOutputs.delete(accessObject.name);
})

function mapMidiInputToMpeSynth<T extends MPEVoiceGraph>(input: MIDIValInput, synth: MPEPolySynth<T>) {
  const midiPitchToVoiceId = new Map<number, number>();
  
  input.onAllNotesOff((event) => {
    synth.allNotesOff()
  })

  input.onAllNoteOn((event) => {
    const voice = synth.noteOn(event.note, event.velocity, 0, 0)
    midiPitchToVoiceId.set(event.note, voice.id)
  })

  input.onAllNoteOff((event) => {
    const voice = synth.voices.get(midiPitchToVoiceId.get(event.note) ?? -1)
    if(voice) synth.noteOff(voice)
  })
  
  input.onChannelPressure((event) => {
    const voice = synth.voices.get(midiPitchToVoiceId.get(event.channel) ?? -1)
    if (voice) {
      voice.pressure = event.data1 //todo api - is this correct?
    }
  })

  input.onPitchBend((event) => {
    const voice = synth.voices.get(midiPitchToVoiceId.get(event.channel) ?? -1)
    if (voice) {
      voice.pitch = event.value //todo api - is this correct?
    }
  })

  input.onControlChange(74, (event) => {
    const voice = synth.voices.get(midiPitchToVoiceId.get(event.channel) ?? -1)
    if (voice) {
      voice.slide = event.data2 //todo api - is this correct?
    }
  })

}


//todo hotreload - add an allNotesOff method for cleaning up midi




