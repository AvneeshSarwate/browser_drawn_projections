import { Ableton } from "ableton-js";

// Log all messages to the console
const ableton = new Ableton({ logger: console });

const test = async () => {
  // Establishes a connection with Live
  await ableton.start();

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