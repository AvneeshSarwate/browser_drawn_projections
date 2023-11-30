import { MIDIVal, MIDIValInput, MIDIValOutput } from "@midival/core";

export const midiInputs: Map<string, MIDIValInput> = new Map();
export const midiOutputs: Map<string, MIDIValOutput> = new Map()

MIDIVal.connect().then((accessObject) => {
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







