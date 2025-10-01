const demoFallbackState = {
  notes: [],
  playheadPosition: 0,
  queuePosition: 0,
  grid: {
    maxLength: 16,
  },
};

function currentDemoState() {
  return window.pianoRollDemoState ?? demoFallbackState;
}

function setup() {
  if (typeof initializePianoRoll === 'function') {
    initializePianoRoll();
  }
  const container = document.getElementById('p5-container');
  const canvas = createCanvas(560, 260);
  canvas.parent(container);
  frameRate(60);
  textFont('Inter, sans-serif');
  textSize(12);
  noStroke();
}

function drawTimelineBackground(padding) {
  fill(244);
  rect(padding, padding, width - padding * 2, height - padding * 2, 12);
}

function drawNotes(state, padding) {
  const { notes } = state;
  if (!notes.length) {
    fill(80);
    textAlign(CENTER, CENTER);
    text('Add notes in the piano roll to mirror them here.', width / 2, height / 2);
    return;
  }

  const maxPos = notes.reduce((max, note) => Math.max(max, note.position + note.duration), 4);
  const minPos = notes.reduce((min, note) => Math.min(min, note.position), 0);
  const span = Math.max(maxPos - minPos, 4);

  const minPitch = notes.reduce((min, note) => Math.min(min, note.pitch), notes[0].pitch);
  const maxPitch = notes.reduce((max, note) => Math.max(max, note.pitch), notes[0].pitch);
  const pitchRange = Math.max(maxPitch - minPitch, 1);

  const innerWidth = width - padding * 2;
  const timelineHeight = height - padding * 2;
  const quartToPixels = innerWidth / span;
  const noteHeight = Math.max(timelineHeight / Math.min(pitchRange + 1, 24), 6);
  const usableHeight = Math.max(timelineHeight - noteHeight, 0);

  notes.forEach((note) => {
    const velocity = Math.min(1, Math.max(0.2, (note.velocity ?? 100) / 127));
    const brightness = 160 + velocity * 70;
    const x = padding + (note.position - minPos) * quartToPixels;
    const pitchRatio = (note.pitch - minPitch) / pitchRange;
    const y = padding + usableHeight - pitchRatio * usableHeight;
    const w = Math.max(note.duration * quartToPixels, 3);

    fill(255, 120, 140, brightness);
    rect(x, y, w, noteHeight, 6);
  });
}

function drawIndicators(state, padding) {
  const { queuePosition, playheadPosition, notes } = state;
  if (!notes.length) return;

  const maxPos = notes.reduce((max, note) => Math.max(max, note.position + note.duration), 4);
  const minPos = notes.reduce((min, note) => Math.min(min, note.position), 0);
  const span = Math.max(maxPos - minPos, 4);
  const innerWidth = width - padding * 2;
  const quartToPixels = innerWidth / span;
  const offset = padding - minPos * quartToPixels;

  strokeWeight(2);

  // Queue playhead (green)
  stroke(0, 180, 90);
  line(offset + queuePosition * quartToPixels, padding, offset + queuePosition * quartToPixels, height - padding);

  // Live playhead (orange)
  stroke(255, 136, 0);
  line(offset + playheadPosition * quartToPixels, padding, offset + playheadPosition * quartToPixels, height - padding);

  noStroke();
}

function drawLabels(state, padding) {
  fill(40);
  textAlign(LEFT, BOTTOM);
  const labelBaseY = height - padding / 2 + 8;
  text(`Notes: ${state.notes.length}`, padding + 6, labelBaseY);
  text(
    `Playhead: ${state.playheadPosition.toFixed(2)} • Queue: ${state.queuePosition.toFixed(2)}`,
    padding + 6,
    labelBaseY - 16,
  );
}

function draw() {
  clear();
  background(235);
  const padding = 24;
  const state = currentDemoState();
  drawTimelineBackground(padding);
  drawNotes(state, padding);
  drawIndicators(state, padding);
  drawLabels(state, padding);
}
