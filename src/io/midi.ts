import type { MPEPolySynth, MPEVoiceGraph } from "@/music/mpeSynth";
import { MIDIVal, MIDIValInput, MIDIValOutput, type NoteMessage } from "@midival/core";

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

/**
 debugging
 - all notes off not interacting properly when stopping a midi clip in ableton
 - audio randomly turns off - might be a browser-focus issue with webaudio?
 - mpe for slide/pressure seems to work but need to test with sounds better suited to debugging
 */

//todo api - handle hot reloading for mapMidiInputToMpeSynth
export function mapMidiInputToMpeSynth<T extends MPEVoiceGraph>(input: MIDIValInput, synth: MPEPolySynth<T>, useMpe = false) {
  const midiDataToVoiceId = new Map<number, T>();
  const noteKey = (event: NoteMessage) => useMpe ? event.channel : event.data1
  input.onAllNotesOff((event) => {
    midiDataToVoiceId.clear()
    synth.allNotesOff()
  })

  //@ts-ignore
  window.voiceMap = midiDataToVoiceId
  //@ts-ignore
  window.synth = synth

  //todo - handle voice stealing when 2 voices of same pitch are triggered at once?
  input.onAllNoteOn((event) => {
    const voice = synth.noteOn(event.note, event.velocity, 0, 0, noteKey(event))
    midiDataToVoiceId.set(noteKey(event), voice)
    // console.log("all note on", event, 'chan', event.channel, "voice_id", voice.id)
  })

  input.onAllNoteOff((event) => {
    const voice = midiDataToVoiceId.get(noteKey(event))
    console.log("all note off", Date.now(),event.data1, noteKey(event), !!voice, voice?.id)
    if(voice) {
      synth.noteOff(voice)
      midiDataToVoiceId.delete(noteKey(event))
      // console.log("num voices", midiPitchToVoiceId.size, synth.voices.size)
    }
  })
  
  input.onChannelPressure((event) => {
    //todo api - also have case for not using MPE
    const voice = midiDataToVoiceId.get(event.channel)
    if (voice) {
      voice.pressure = event.data1 //todo api - is this correct?
    }
  })

  input.onPitchBend((event) => {
    //todo api - also have case for not using MPE
    const voice = midiDataToVoiceId.get(event.channel)
    if (voice) {
      voice.pitch = event.value //todo api - is this correct?
    }
  })

  input.onControlChange(74, (event) => {
    //todo api - also have case for not using MPE
    const voice = midiDataToVoiceId.get(event.channel)
    if (voice) {
      voice.slide = event.data2 //todo api - is this correct?
    }
  })
}


//todo hotreload - add an allNotesOff method for cleaning up midi




