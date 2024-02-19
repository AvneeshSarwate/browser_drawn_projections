import { XMLParser } from "fast-xml-parser"
import * as fs from "fs";
import * as zlib from "zlib";
import { WebSocket } from 'ws';

let fileName = "td_ableton/pianos Project/pianos.als";

const gzipedFile = fs.readFileSync(fileName);
const xml = zlib.gunzipSync(gzipedFile).toString();


//clip map message is a hot reload, fresh_clipMap is a reload from a new file
type MsgType = "clipMap" | "fresh_clipMap"

type AbletonNote = { pitch: number, duration: number, velocity: number, position: number }
type AbletonClip = { name: string, duration: number, notes: AbletonNote[] }

function parseXmlNote(xmlNote: any, pitchStr: string): AbletonNote {
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


function parseXML(xml: string): Map<string, AbletonClip> {
  const parser = new XMLParser({ignoreAttributes: false});
  const parsed = parser.parse(xml);
  const tracks = parsed.Ableton.LiveSet.Tracks.MidiTrack

  const clipMap = new Map<string, AbletonClip>();

  tracks.forEach((track: any, track_ind) => {
    const clipSlotList = track.DeviceChain.MainSequencer.ClipSlotList.ClipSlot;
    clipSlotList.forEach((slot: any, slot_ind: number) => {
      const clip = slot?.ClipSlot?.Value?.MidiClip;
      if (clip) {
        console.log("clip", clip);
        const keytracks = arrayWrap(clip.Notes.KeyTracks.KeyTrack)
        const notes: AbletonNote[] = []
        const duration = Number(clip.CurrentEnd["@_Value"])
        
        keytracks.forEach((keytrack: any) => {
          if(!keytrack) return
          const pitchStr = keytrack.MidiKey["@_Value"]
          const xmlNotes = arrayWrap(keytrack.Notes.MidiNoteEvent);

          xmlNotes.forEach((note: any) => {
            notes.push(parseXmlNote(note, pitchStr))
          })
          
        })

        notes.sort((a, b) => a.position - b.position);

        let clipName = clip.Name["@_Value"]
        clipName = clipName != '' ? clipName : `clip_${track_ind+1}_${slot_ind+1}`;
        const abletonClip: AbletonClip = { name: clipName, duration, notes };
        clipMap.set(clipName, abletonClip);
        console.log("name", clipName);
        // fs.writeFileSync("td_ableton/pianos Project/parsed.json", JSON.stringify(clip, null, 2));
      }
    })
  })
  return clipMap;
}

let clipMap = parseXML(xml);
const clipMapToJSON = (fileName: string, clipMap: Map<string, AbletonClip>, msgType: MsgType = 'clipMap') => JSON.stringify({type: msgType, fileName, data: Object.fromEntries(clipMap)});

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws: WebSocket) => {
  console.log('New client connected');

  ws.send(clipMapToJSON(fileName, clipMap));

  ws.on('message', (message: string) => {
    console.log(`Received message: ${message}`);
    const parsed = JSON.parse(message);
    if (parsed.type === 'file') {
      fileName = parsed.fileName

      statsWatcher.removeAllListeners()
      statsWatcher = fs.watchFile(fileName, () => sendFileUpdate("clipMap"))
      sendFileUpdate("fresh_clipMap")
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const readAndParseFile = (msgType: MsgType = 'clipMap') => {
  const gzipedFile = fs.readFileSync(fileName);
  const xml = zlib.gunzipSync(gzipedFile).toString();
  clipMap = parseXML(xml);
  const clipMapJson = clipMapToJSON(fileName, clipMap, msgType);
  return clipMapJson
}

const sendFileUpdate = (msgType: MsgType) => {
  console.log("file changed", fileName);
 
  const clipMapJson = readAndParseFile(msgType);

  wss.clients.forEach((client) => {
    client.send(clipMapJson);
  });
}

let statsWatcher = fs.watchFile(fileName, () => sendFileUpdate("clipMap"))