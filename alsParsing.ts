import { XMLParser } from "fast-xml-parser"
import * as fs from "fs";
import * as zlib from "zlib";

const gzipedFile = fs.readFileSync("td_ableton/pianos Project/pianos.als");
const xml = zlib.gunzipSync(gzipedFile).toString();


type Note = { pitch: number, duration: number, velocity: number, position: number }

function parseXmlNote(xmlNote: any, pitchStr: string): Note {
  const pitch = Number(pitchStr);
  const duration = Number(xmlNote["@_Duration"]);
  const velocity = Number(xmlNote["@_Velocity"]);
  const position = Number(xmlNote["@_Time"]);
  return { pitch, duration, velocity, position };
}


//a function that checks if the argument is an array, and if not, wraps it in one
function arrayWrap<T>(maybeArray: T | T[]): T[] {
  return Array.isArray(maybeArray) ? maybeArray : [maybeArray];
}


function parseXML(xml: string): Map<string, Note[]> {
  const parser = new XMLParser({ignoreAttributes: false});
  const parsed = parser.parse(xml);
  const tracks = parsed.Ableton.LiveSet.Tracks.MidiTrack

  const clipMap = new Map<string, Note[]>();

  tracks.forEach((track: any, track_ind) => {
    const clipSlotList = track.DeviceChain.MainSequencer.ClipSlotList.ClipSlot;
    clipSlotList.forEach((slot: any, slot_ind: number) => {
      const clip = slot?.ClipSlot?.Value?.MidiClip;
      if (clip) {
        const keytracks = arrayWrap(clip.Notes.KeyTracks.KeyTrack)
        const notes: Note[] = []
        
        keytracks.forEach((keytrack: any) => {
          const pitchStr = keytrack.MidiKey["@_Value"]
          const xmlNotes = arrayWrap(keytrack.Notes.MidiNoteEvent);

          xmlNotes.forEach((note: any) => {
            notes.push(parseXmlNote(note, pitchStr))
          })
          
        })

        notes.sort((a, b) => a.position - b.position);

        let clipName = clip.Name["@_Value"]
        clipName =  clipName != '' ? clipName : `clip_${track_ind}_${slot_ind}`;
        clipMap.set(clipName, notes);
        console.log("name", clipName);
        // fs.writeFileSync("td_ableton/pianos Project/parsed.json", JSON.stringify(clip, null, 2));
      }
    })
  })
  return clipMap;
}

console.log(parseXML(xml));