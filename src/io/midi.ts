import { MIDIVal, MIDIValInput } from "@midival/core";



export const midiInputs: Map<string, MIDIValInput> = new Map();


MIDIVal.connect().then((accessObject) => {
  accessObject.inputs.forEach((input) => {
    console.log("midi input", input.name);
    midiInputs.set(input.name, new MIDIValInput(input));
  });
});


MIDIVal.onInputDeviceConnected((accessObject) => {
  midiInputs.set(accessObject.name, new MIDIValInput(accessObject));
})

MIDIVal.onInputDeviceDisconnected((accessObject) => {
  midiInputs.delete(accessObject.name);
})







