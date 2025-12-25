const ToneGlobal = window.Tone;

if (!ToneGlobal) {
  console.error('Tone.js failed to load. Ensure the CDN script is available.');
}

// defensive code - not strictly needed for this set up
// const pianoRollModule = window.PianoRollComponent;
// const PianoRollElementCtor =
//   pianoRollModule?.PianoRollElement ?? pianoRollModule?.default ?? pianoRollModule;

// if (PianoRollElementCtor && !customElements.get('piano-roll-component')) {
//   customElements.define('piano-roll-component', PianoRollElementCtor);
// }

const START_DELAY = 0.05; // seconds before starting the transport

const defaultNotes = [
  { pitch: 60, position: 0, duration: 1, velocity: 0.86 },
  { pitch: 64, position: 0, duration: 1, velocity: 0.83 },
  { pitch: 67, position: 0, duration: 1, velocity: 0.85 },
  { pitch: 72, position: 0, duration: 1, velocity: 0.80 },
  { pitch: 60, position: 2, duration: 1.5, velocity: 0.86 },
  { pitch: 67, position: 2, duration: 1.5, velocity: 0.85 },
  { pitch: 74, position: 2, duration: 1.5, velocity: 0.82 },
  { pitch: 62, position: 4, duration: 0.5, velocity: 0.78 },
  { pitch: 65, position: 4.5, duration: 0.5, velocity: 0.77 },
  { pitch: 69, position: 5, duration: 1, velocity: 0.79 },
  { pitch: 72, position: 6, duration: 1, velocity: 0.80 },
  { pitch: 76, position: 6.5, duration: 0.75, velocity: 0.75 }
];

var pianoRollDemoState = {
  notes: [],
  playheadPosition: 0,
  queuePosition: 0,
  grid: {
    timeSignature: 4,
    subdivision: 16,
    maxLength: 64
  }
};

window.pianoRollDemoState = pianoRollDemoState;

var synth = ToneGlobal ? new ToneGlobal.PolySynth(ToneGlobal.Synth).toDestination() : null;
var pianoRollElement;
var playButton;
var stopButton;
var statusElement;
var queueElement;

var part = null;
var rafId = null;
var stopScheduleId = null;
var isPlaying = false;
var playbackStartPosition = 0;
ToneGlobal?.Transport && (ToneGlobal.Transport.loop = false);
ToneGlobal?.Transport && (ToneGlobal.Transport.bpm.value = 120);

function quartersPerSecond() {
  return ToneGlobal ? ToneGlobal.Transport.bpm.value / 60 : 0;
}

function quarterNoteSeconds() {
  return ToneGlobal ? 60 / ToneGlobal.Transport.bpm.value : 0;
}

function updateStatus() {
  if (!statusElement || !playButton || !stopButton) return;
  statusElement.textContent = isPlaying ? 'Playing' : 'Stopped';
  playButton.disabled = isPlaying;
  stopButton.disabled = !isPlaying;
}

function cancelAnimation() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function clearTransportSchedules() {
  if (!ToneGlobal) return;
  if (stopScheduleId !== null) {
    ToneGlobal.Transport.clear(stopScheduleId);
    stopScheduleId = null;
  }
  ToneGlobal.Transport.cancel();
}

function setLivePlayhead(position) {
  pianoRollDemoState.playheadPosition = position;
  if (pianoRollElement && typeof pianoRollElement.setLivePlayheadPosition === 'function') {
    pianoRollElement.setLivePlayheadPosition(position);
  }
}

function syncQueuePositionDisplay(position) {
  pianoRollDemoState.queuePosition = position;
  if (queueElement) {
    queueElement.textContent = position.toFixed(2);
  }
  if (!isPlaying) {
    setLivePlayhead(position);
  }
}

function handleStateSync(state) {
  const notes = Array.from(state.notes.values()).map((note) => ({ ...note }));
  notes.sort((a, b) => a.position - b.position);
  pianoRollDemoState.notes = notes;

  pianoRollDemoState.grid = {
    timeSignature: state.grid.timeSignature,
    subdivision: state.grid.subdivision,
    maxLength: state.grid.maxLength
  };

  syncQueuePositionDisplay(state.queuePlayhead.position);

  stopPlayback();
}

async function startPlayback(startOverride) {
  if (!ToneGlobal || !pianoRollElement) return;

  await ToneGlobal.start();

  if (isPlaying) {
    stopPlayback(false);
  }

  const notes = pianoRollDemoState.notes;
  if (notes.length === 0) {
    console.warn('No notes available to play.');
    return;
  }

  playbackStartPosition =
    typeof startOverride === 'number'
      ? startOverride
      : pianoRollElement.getPlayStartPosition?.() ?? pianoRollDemoState.queuePosition ?? 0;

  const activeNotes = notes.filter((note) => note.position + note.duration > playbackStartPosition);
  if (activeNotes.length === 0) {
    setLivePlayhead(playbackStartPosition);
    console.warn('No notes fall after the current queue playhead.');
    return;
  }

  const quarterSeconds = quarterNoteSeconds();

  const scheduledEvents = activeNotes.map((note) => {
    const offset = Math.max(0, note.position - playbackStartPosition);
    return {
      ...note,
      velocity: Math.max(0, Math.min(1, note.velocity ?? 0.8)),
      time: offset * quarterSeconds
    };
  });

  if (part) {
    part.dispose();
    part = null;
  }

  clearTransportSchedules();

  part = new ToneGlobal.Part((time, event) => {
    const velocity = Math.max(0, Math.min(1, event.velocity ?? 0.8));
    const noteName = ToneGlobal.Frequency(event.pitch, 'midi').toNote();
    const durationSeconds = Math.max(event.duration, 0.0625) * quarterSeconds;
    synth?.triggerAttackRelease(noteName, durationSeconds, time, velocity);
  }, scheduledEvents.map((event) => [event.time, event]));

  part.start(0);

  ToneGlobal.Transport.stop();
  ToneGlobal.Transport.position = 0;
  ToneGlobal.Transport.start(`+${START_DELAY.toFixed(3)}`);

  isPlaying = true;
  setLivePlayhead(playbackStartPosition);
  updateStatus();

  const playbackDurationSeconds = scheduledEvents.reduce((end, event) => {
    const eventEnd = event.time + event.duration * quarterSeconds;
    return Math.max(end, eventEnd);
  }, 0);

  stopScheduleId = ToneGlobal.Transport.scheduleOnce(() => {
    stopPlayback();
  }, playbackDurationSeconds + 0.1);

  cancelAnimation();
  const animate = () => {
    if (!isPlaying) return;
    const elapsed = ToneGlobal.Transport.seconds;
    const currentQuarter = playbackStartPosition + elapsed * quartersPerSecond();
    setLivePlayhead(currentQuarter);
    rafId = requestAnimationFrame(animate);
  };
  rafId = requestAnimationFrame(animate);
}

function stopPlayback(resetToQueue = true) {
  if (!ToneGlobal) return;
  if (!isPlaying && !part) {
    return;
  }

  ToneGlobal.Transport.stop();
  clearTransportSchedules();

  if (part) {
    part.stop(0);
    part.dispose();
    part = null;
  }

  cancelAnimation();
  isPlaying = false;
  updateStatus();

  if (resetToQueue) {
    const target = pianoRollElement?.getPlayStartPosition?.() ?? pianoRollDemoState.queuePosition ?? 0;
    setLivePlayhead(target);
  }
}

function initialize() {
  pianoRollElement = document.getElementById('pianoRoll');
  playButton = document.getElementById('playButton');
  stopButton = document.getElementById('stopButton');
  statusElement = document.getElementById('playStatus');
  queueElement = document.getElementById('queuePosition');

  if (!pianoRollElement) {
    console.error('Unable to find the piano roll element.');
    return;
  }

  pianoRollElement.syncState = handleStateSync;

  playButton?.addEventListener('click', () => {
    startPlayback().catch((error) => console.error(error));
  });
  stopButton?.addEventListener('click', () => stopPlayback());

  customElements.whenDefined('piano-roll-component').then(() => {
    if (typeof pianoRollElement.setNotes === 'function') {
      pianoRollElement.setNotes(defaultNotes);
      if (typeof pianoRollElement.fitZoomToNotes === 'function') {
        pianoRollElement.fitZoomToNotes();
      }
    } else {
      console.warn('setNotes is not available on the piano roll element.');
    }
    syncQueuePositionDisplay(pianoRollElement.getPlayStartPosition?.() ?? 0);
  });

  updateStatus();
}

function setup() {
  initialize();
}

// Expose globals for novice-friendly access
window.setupPianoRollDemo = setup;
window.initializePianoRollDemo = initialize;
window.initializePianoRoll = initialize;
window.startPlayback = startPlayback;
window.stopPlayback = stopPlayback;
window.handlePianoRollStateSync = handleStateSync;
