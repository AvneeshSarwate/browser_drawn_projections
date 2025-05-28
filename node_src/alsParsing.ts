import { XMLParser } from "fast-xml-parser"
import * as fs from "fs";
import * as zlib from "zlib";
import { WebSocket } from 'ws';
import * as path from "path";

let fileName = "td_ableton/pianos Project/pianos.als";
fileName = "src/sketches/sonar_sketch/piano_melodies Project/piano_melodies_demo.als"

const gzipedFile = fs.readFileSync(fileName);
const xml = zlib.gunzipSync(gzipedFile).toString();


//clip map message is a hot reload, fresh_clipMap is a reload from a new file
type MsgType = "clipMap" | "fresh_clipMap"

type AbletonNote = { pitch: number, duration: number, velocity: number, offVelocity: number, probability: number, position: number, isEnabled: boolean }
type AbletonClip = { name: string, duration: number, notes: AbletonNote[] }

function parseXmlNote(xmlNote: any, pitchStr: string): AbletonNote {
  const pitch = Number(pitchStr);
  const duration = Number(xmlNote["@_Duration"]);
  const velocity = Number(xmlNote["@_Velocity"]);
  const offVelocity = Number(xmlNote["@_OffVelocity"]);
  const probability = Number(xmlNote["@_Probability"]);
  const isEnabled = xmlNote["@_IsEnabled"] == "true";
  const position = Number(xmlNote["@_Time"]);
  return { pitch, duration, velocity, offVelocity, probability, position, isEnabled };
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

  tracks.forEach((track: any, track_ind: number) => {
    const clipSlotList = track.DeviceChain.MainSequencer.ClipSlotList.ClipSlot;
    clipSlotList.forEach((slot: any, slot_ind: number) => {
      const clip = slot?.ClipSlot?.Value?.MidiClip;
      if (clip) {
        // console.log("clip", clip);
        const keytracks = arrayWrap(clip.Notes.KeyTracks.KeyTrack)
        const notes: AbletonNote[] = []
        const duration = Number(clip.CurrentEnd["@_Value"])
        
        keytracks.forEach((keytrack: any) => {
          if(!keytrack) return
          const pitchStr = keytrack.MidiKey["@_Value"]
          const xmlNotes = arrayWrap(keytrack.Notes.MidiNoteEvent);

          xmlNotes.forEach((note: any) => {
            notes.push(parseXmlNote(note, pitchStr))
            // console.log("note", notes[notes.length - 1])
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

// Track the last modified time of the file
let lastModifiedTime = fs.statSync(fileName).mtime.getTime();

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws: WebSocket) => {
  console.log('New client connected');

  ws.send(clipMapToJSON(fileName, clipMap));

  ws.on('message', (message: string) => {
    console.log(`Received message: ${message}`);
    const parsed = JSON.parse(message);
    if (parsed.type === 'file') {
      fileName = path.isAbsolute(parsed.fileName) 
      ? parsed.fileName 
      : path.resolve(process.cwd(), parsed.fileName);

      statsWatcher.removeAllListeners()
      statsWatcher = fs.watchFile(fileName, (curr, prev) => {
        const currentModTime = curr.mtime.getTime();
        if (currentModTime !== lastModifiedTime) {
          lastModifiedTime = currentModTime;
          sendFileUpdate("clipMap");
        }
      });
      // Update lastModifiedTime for the new file
      lastModifiedTime = fs.statSync(fileName).mtime.getTime();
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
  writeClipDataTs(fileName, clipMap);
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

let statsWatcher = fs.watchFile(fileName, (curr, prev) => {
  const currentModTime = curr.mtime.getTime();
  if (currentModTime !== lastModifiedTime) {
    lastModifiedTime = currentModTime;
    sendFileUpdate("clipMap");
  }
});

function writeClipDataTs(alsFilePath: string, clipMap: Map<string, AbletonClip>) {
  return
  try {
    // get the Ableton project folder, then its parent "sketch" folder
    const projectDir = path.dirname(alsFilePath);
    const sketchDir  = path.dirname(projectDir);
    const outPath    = path.join(sketchDir, 'clipData.ts');

    const dataObject = Object.fromEntries(clipMap);

    const tsSource =
`/* AUTO-GENERATED FILE – DO NOT EDIT
 *
 * Written by node_src/alsParsing.ts whenever Ableton clips change.
 */
import type { AbletonClipRawData } from '@/io/abletonClips';

export const clipData: Record<string, AbletonClipRawData> = ${JSON.stringify(dataObject, null, 2)} as const;
`;
    fs.writeFileSync(outPath, tsSource);
    console.log('Wrote static clip data →', outPath);
  } catch (err) {
    console.error('Failed to write clipData.ts', err);
  }
}