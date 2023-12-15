import { Ableton } from "ableton-js";

// Log all messages to the console
const ableton = new Ableton({ logger: console });

const test = async () => {
  // Establishes a connection with Live
  await ableton.start();

  ableton.song.addListener("tracks", (tracks) => {
    console.log("Tracks:", tracks);
    tracks.forEach((track) => {
      track.addListener("clip_slots", (clipSlots) => {
        console.log("Clip slots:", clipSlots);
        clipSlots.forEach((clipSlot) => {
          clipSlot.addListener("has_clip", (hasClip) => {
            console.log("Has clip:", hasClip);
            if (hasClip) {
              clipSlot.get("clip").then((clip) => {
                console.log("Clip:", clip);
                clip?.addListener("name", (name) => {
                  console.log("Name:", name);
                })
              })
            }
          });
        });
      })
    })
  })
    

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