import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser"
import * as fs from "fs";
import * as zlib from "zlib";

const gzipedFile = fs.readFileSync("td_ableton/pianos Project/pianos.als");
const xml = zlib.gunzipSync(gzipedFile).toString();


function parseXML(xml: string) {
  const parser = new XMLParser({ignoreAttributes: false});
  const parsed = parser.parse(xml);
  const tracks = parsed.Ableton.LiveSet.Tracks.MidiTrack
  tracks.forEach((track: any) => {
    const clipSlotList = track.DeviceChain.MainSequencer.ClipSlotList.ClipSlot;
    clipSlotList.forEach((slot: any, i: number) => {
      const clip = slot?.ClipSlot?.Value?.MidiClip;
      console.log("name", clip);
      if (i === 0 && clip?.Name["@_Value"] == 'base_clip') {
        fs.writeFileSync("td_ableton/pianos Project/parsed.json", JSON.stringify(clip, null, 2));
      }
    })
  })
}

parseXML(xml);