import { Ableton } from "ableton-js";

// Log all messages to the console
const ableton = new Ableton({ logger: console });

const test = async () => {
  // Establishes a connection with Live
  await ableton.start();

  ableton.song.addListener("tracks", (tracks) => {
    console.log("Tracks:", tracks);
    tracks.forEach((track, trackInd) => {
      track.addListener("clip_slots", (clipSlots) => {
        console.log("Clip slots:", clipSlots);
        clipSlots.forEach((clipSlot, clipIndex) => {

          const clipPath = `tracks.${trackInd}.clip_slots.${clipIndex}`

          clipSlot.addListener("has_clip", (hasClip) => {
            console.log("Has clip:", hasClip);
            if (hasClip) {
              clipSlot.get("clip").then(async (clip) => {
                console.log("Clip:", clip);
                
                clip?.addListener("name", (name) => {
                  console.log("Name:", name);
                })

                // clip?.setNotes([
                //   { pitch: 60, time: 0, duration: 1, velocity: 100, muted: false },
                //   { pitch: 61, time: 1, duration: 1, velocity: 100, muted: false },
                // ])

                // //clear the clip
                // const startMarker = await clip?.get("start_marker")!
                // const endMarker = await clip?.get("end_marker")!
                // const clipDuration = endMarker - startMarker
                // clip?.removeNotesExtended(startMarker, 0, clipDuration, 127)
              })
            }
          });
        });
      })
    })
  })

  // const detailClip = await ableton.song.view.get('detail_clip')
    

  // Observe the current playback state and tempo
  ableton.song.addListener("is_playing", (p) => console.log("Playing:", p));
  ableton.song.addListener("tempo", (t) => console.log("Tempo:", t));

  // Get the current tempo
  const tempo = await ableton.song.get("tempo");
  console.log("Current tempo:", tempo);

  // Set the tempo
  await ableton.song.set("tempo", 85);
};

test();