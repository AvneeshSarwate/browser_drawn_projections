# Piano Roll Component

A Konva.js-based piano roll editor with immediate-mode rendering, wrapped in a Vue component and exportable as a web component.

## Features

- **Immediate-mode rendering**: Only renders visible notes based on viewport
- **Note manipulation**: Add, select, drag, resize notes
- **Multi-selection**: Click + shift or marquee selection with shift
- **Drag quantization**: Vertical (pitch) and horizontal (grid snap) quantization
- **Snap-to-note-start**: Notes snap to non-selected note start positions during drag
- **Overlap preview**: Notes that will be deleted during drag/resize are shown with reduced opacity
- **Scrollbar zoom controls**: Horizontal/vertical bars with draggable ends for anchored zoom + scroll
- **Undo/redo**: Simple snapshot-based command stack
- **Keyboard shortcuts**: Arrow keys, delete, copy/paste, undo/redo
- **Resize handles**: Resize note start or end (affects entire selection)
- **Auto-fit viewport**: `fitZoomToNotes()` zooms and scrolls to the active note bounds with sensible minimums
- **Overlap resolution**: Moves and pastes truncate or remove colliding notes automatically

## Architecture

### Core Files

- **`pianoRollState.ts`**: State management (pure data, no Konva refs)
- **`pianoRollCore.ts`**: Rendering and interaction logic
- **`pianoRollUtils.ts`**: Coordinate conversion, quantization, overlap detection
- **`commandStack.ts`**: Snapshot-based undo/redo
- **`PianoRollRoot.vue`**: Vue component wrapper
- **`web-component.ts`**: Web component export

### Layer Stack (bottom to top)

1. **Grid Layer** (`listening: false`)
   - Background rectangles (alternating colors per measure)
   - Vertical lines (time grid)
   - Horizontal lines (pitch boundaries)

2. **Notes Layer** (interactive)
   - Note rectangles with labels
   - Resize handles (circles at start/end of selected notes)

3. **Overlay Layer** (UI elements)
   - Selection rectangle (marquee)
   - Cursor line

## Usage

### As Vue Component

```vue
<template>
  <PianoRollRoot
    :width="800"
    :height="400"
    :initialNotes="notes"
    :gridSubdivision="16"
    @notes-update="handleNotesUpdate"
  />
</template>

<script setup>
import PianoRollRoot from '@/pianoRoll/PianoRollRoot.vue'

const notes = ref([
  ['note1', { id: 'note1', pitch: 60, position: 0, duration: 1, velocity: 0.8 }],
  ['note2', { id: 'note2', pitch: 64, position: 1, duration: 1, velocity: 0.8 }]
])

const handleNotesUpdate = (updatedNotes) => {
  notes.value = updatedNotes
}
</script>
```

### As Web Component

```html
<piano-roll-component
  width="800"
  height="400"
></piano-roll-component>

<script type="module">
import '@/pianoRoll/web-component.ts'
</script>
```

### Public Props

- `width` *(number, default 640)*: Canvas width in pixels
- `height` *(number, default 360)*: Canvas height in pixels
- `initialNotes` *(Array<[id, NoteData]>)*: Seed notes loaded on mount
- `syncState` *(function)*: Callback invoked when internal state changes
- `showControlPanel` *(boolean, default true)*: Toggles the built-in toolbar
- `interactive` *(boolean, default true)*: Enables pointer and keyboard input

### Exposed Methods

- `setNotes(notes: NoteDataInput[])`: Replace all notes with the provided list
- `setLivePlayheadPosition(position: number)`: Update the live playhead (quarter notes)
- `getPlayStartPosition(): number`: Read the current queue playhead (quarter notes)
- `fitZoomToNotes()`: Zoom and scroll to fit all notes with minimum 4 beats × 12 pitches

## Interactions

### Adding Notes
- **Double-click** on empty area → adds quantized note at clicked position

### Selection
- **Click** on note → select (clears previous selection)
- **Shift + Click** → toggle note in/out of selection
- **Click + drag** on background → marquee selection
- **Shift + marquee** → add to selection

### Dragging
- **Click + drag** on selected note → move all selected notes
- Vertical dragging snaps to pitch (semitone)
- Horizontal dragging:
  - Small movements: free
  - Large movements: snap to grid
- Notes automatically snap to non-selected note start positions
- Overlapping notes shown with reduced opacity (delete preview)

### Resizing
- **Click + drag** resize handle → resize all selected notes
- Same quantization as dragging
- Start handle: changes position + duration
- End handle: changes duration only

### Keyboard Shortcuts
- **Cmd/Ctrl + Z**: Undo
- **Cmd/Ctrl + Shift + Z**: Redo
- **Backspace/Delete**: Delete selected notes
- **Arrow keys**: Move selected notes (1 semitone or 1/4 note)
- **Cmd/Ctrl + C**: Copy selected notes
- **Cmd/Ctrl + V**: Paste notes at cursor position

## Data Structures

### NoteData
```typescript
{
  id: string
  pitch: number        // 0-1
  position: number     // in quarter notes
  duration: number     // in quarter notes
  velocity: number     // 0-1
  metadata?: any
}
```

## Performance

- **Culling**: Only renders notes in visible viewport
- **Grid caching**: Grid only redraws on scroll/zoom
- **Batch drawing**: Single `batchDraw()` per RAF frame
- **Layer optimization**: Grid layer is `listening: false`

## Differences from SVG Version

1. **Immediate-mode rendering**: Notes outside viewport are not rendered
2. **Simpler state management**: Pure data with no Konva references in note state
3. **Snapshot-based undo/redo**: Entire state serialized as JSON for commands
4. **No explicit modes**: Interactions determined by click target
5. **RAF-based rendering**: Redraw triggered by `needsRedraw` flag
