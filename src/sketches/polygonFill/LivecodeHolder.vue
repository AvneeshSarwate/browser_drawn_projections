<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type Polygon, type PolygonFillAppState, appStateName, resolution } from './appState';
import { inject, onMounted, onUnmounted, ref, type Ref, watch, reactive } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, mouseupEvent, singleKeyupEvent, keydownEvent, keyupEvent } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { findClosestPolygonLineAtPoint, lineToPointDistance, isPointInPolygon, directionSweep } from '@/creativeAlgs/shapeHelpers';
import { clipMap, INITIALIZE_ABLETON_CLIPS, type AbletonClip } from '@/io/abletonClips';
import { m2f } from '@/music/mpeSynth';
import * as Tone from 'tone'
import { getPianoChain, TONE_AUDIO_START } from '@/music/synths';
import { MIDI_READY, midiOutputs } from '@/io/midi';
import type { MIDIValOutput } from '@midival/core';
import type { LoopHandle } from '@/channels/base_time_context';

const appState = inject<PolygonFillAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const mod2 = (n: number, m: number) =>  (n % m + m) % m

type DisplayMode = 'editting' | 'playing'
const displayMode: Ref<DisplayMode> = ref('editting')

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

let playNote: (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, voiceIdx: number) => void

type CursorState = 'drawNewPolygon' | 'addPointToPolygon' | 'selectPoint'| 'selectPolygon' 
type SweepDir = 'top' | 'bottom' | 'left' | 'right'
const cursorState: Ref<CursorState> = ref('drawNewPolygon')
let isMouseDown = false

const leftmostPointSortKey = (polygon: Polygon) => {
  return polygon.points.reduce((min, p) => p.x < min.x ? p : min, polygon.points[0]).x
}
const rightmostPointSortKey = (polygon: Polygon) => {
  return polygon.points.reduce((max, p) => p.x > max.x ? p : max, polygon.points[0]).x
}
const topmostPointSortKey = (polygon: Polygon) => {
  return polygon.points.reduce((max, p) => p.y < max.y ? p : max, polygon.points[0]).y
}
const bottommostPointSortKey = (polygon: Polygon) => {
  return polygon.points.reduce((min, p) => p.y > min.y ? p : min, polygon.points[0]).y
}
const sortFuncs = {
  'left': (p: Polygon[]) => p.sort((a, b) => leftmostPointSortKey(a) - leftmostPointSortKey(b)),
  'right': (p: Polygon[]) => p.sort((a, b) => rightmostPointSortKey(a) - rightmostPointSortKey(b)).reverse(),
  'top': (p: Polygon[]) => p.sort((a, b) => topmostPointSortKey(a) - topmostPointSortKey(b)),
  'bottom': (p: Polygon[]) => p.sort((a, b) => bottommostPointSortKey(a) - bottommostPointSortKey(b)).reverse()
}
const sortPolygonsByDirection = (polygons: Polygon[], direction: SweepDir) => {
  console.log('sortPolygonsByDirection', direction)
  const sortFunc = sortFuncs[direction]
  return sortFunc(polygons)
}

const keyToClipNameMap = new Map<string, string>()
keyToClipNameMap.set('q', 'left_to_right')
keyToClipNameMap.set('w', 'right_to_left')
keyToClipNameMap.set('e', 'top_to_bottom')
keyToClipNameMap.set('r', 'bottom_to_top')

const keyToColorMap = new Map<string, Color>()
keyToColorMap.set('q', {r: 255, g: 0, b: 0, a: 255})
keyToColorMap.set('w', {r: 0, g: 255, b: 0, a: 255})
keyToColorMap.set('e', {r: 0, g: 0, b: 255, a: 255})
keyToColorMap.set('r', {r: 255, g: 255, b: 0, a: 255})

const keyToUseStatefulIdxMap = new Map<string, boolean>()
keyToUseStatefulIdxMap.set('q', false)
keyToUseStatefulIdxMap.set('w', true)
keyToUseStatefulIdxMap.set('e', true)
keyToUseStatefulIdxMap.set('r', true)

const keyToPlayInstanceMap = new Map<string, LoopHandle>()
const keyToToggleStateMap = reactive(new Map<string, boolean>())
// Initialize toggle states
keyToToggleStateMap.set('q', false)
keyToToggleStateMap.set('w', false)
keyToToggleStateMap.set('e', false)
keyToToggleStateMap.set('r', false)

const launchLoopForKey = (key: string, p5i: p5) => {
  const clipName = keyToClipNameMap.get(key)
  if (!clipName) return

  const clip = clipMap.get(clipName)
  if (!clip) return

  // Check if this key is already playing
  const isCurrentlyPlaying = keyToToggleStateMap.get(key)
  
  if (isCurrentlyPlaying) {
    // Stop the current loop
    stopLoopForKey(key)
    keyToToggleStateMap.set(key, false)
    return
  }

  // Start a new loop
  keyToToggleStateMap.set(key, true)
  const launchId = generateId()
  const direction = clipName.split('_')[0] as SweepDir
  const useStatefulIdx = keyToUseStatefulIdxMap.get(key)!!

  const cleanUpDrawFuncs = () => {
    console.log('playInstance cleanup for key:', key)
    keyToToggleStateMap.set(key, false)
    // Clean up draw funcs for this key
    const keysToDelete: string[] = []
    appState.orderedDrawFuncs.forEach((drawFunc, drawKey) => {
      if (drawKey.includes(launchId)) {
        keysToDelete.push(drawKey)
      }
    })
    keysToDelete.forEach(drawKey => {
      appState.orderedDrawFuncs.delete(drawKey)
    })
  }

  const voiceIdx = ['q', 'w', 'e', 'r'].indexOf(key)

  launchQueue.push(async (ctx) => {
    const playInstance = ctx.branch(async (ctx) => {
      // Loop continuously until cancelled
      while (keyToToggleStateMap.get(key)) {
        await playAndAnimateClip(launchId, clip, keyToColorMap.get(key)!!, direction, ctx, p5i, voiceIdx, useStatefulIdx)
      }
      cleanUpDrawFuncs()
    })
    
    playInstance.finally(() => {
      cleanUpDrawFuncs()
    })
    keyToPlayInstanceMap.set(key, playInstance)
  })
}

const stopLoopForKey = (key: string) => {
  const playInstance = keyToPlayInstanceMap.get(key)
  if (playInstance) {
    playInstance.cancel()
    keyToPlayInstanceMap.delete(key)
  }
  keyToToggleStateMap.set(key, false)
}

type Color = {r: number, g: number, b: number, a: number}
async function playAndAnimateClip(launchId: string, clip: AbletonClip, color: Color, direction: SweepDir, ctx: TimeContext, p5i: p5, voiceIdx: number, useStatefulIdx: boolean)  {

  //todo - need to figure out how this behaves when cancelled 
  // - individual "is running" flags since cancellation doesn't run heirarically?
  // - or can just cancel, because only "deep" branches are 1 level down note play and node animation progress ramp, which self clean up?

  const sortedPolygons = sortPolygonsByDirection(appState.polygons, direction)
  const playStartTime = parseFloat(ctx.beats.toFixed(3))
  
  const buffer = clip.noteBuffer()
  for(const [idx, note] of buffer.entries()) {
    //if not playFlag, break?
    await ctx.wait(note.preDelta)
    playNote(note.note.pitch, note.note.velocity, ctx, note.note.duration, voiceIdx)

    let sweepProgress = 0
    const noteDrawKey = `${launchId}-${voiceIdx}-${idx}`
    // console.log('noteDrawKey', noteDrawKey)
    const sortKey = parseFloat(ctx.beats.toFixed(3)) + playStartTime * 0.0001 //sort by note time, tie break by playStartTime

    const statefulIdx = appState.voiceStepIndexes[voiceIdx]
    appState.voiceStepIndexes[voiceIdx] = (statefulIdx + 1) % sortedPolygons.length
    const polygonIdx = useStatefulIdx ? statefulIdx : mod2(idx, sortedPolygons.length)

    const polygonForNote = sortedPolygons[polygonIdx]
    //add a draw func to the orderedDrawFuncs map
    const drawFunc = (p5i: p5) => {
      p5i.push()

      const sweptPolygon = directionSweep(polygonForNote.points, sweepProgress, direction)

      p5i.stroke(color.r, color.g, color.b, color.a)
      p5i.fill(color.r, color.g, color.b, color.a)
      p5i.beginShape()
      sweptPolygon.polygon.forEach(p => p5i.vertex(p.x, p.y))
      p5i.endShape(p5i.CLOSE)
      
      p5i.pop()

      p5i.push()
      p5i.stroke(color.r, color.g, color.b, color.a)
      p5i.noFill()
      p5i.beginShape()
      polygonForNote.points.forEach(p => p5i.vertex(p.x, p.y))
      p5i.endShape(p5i.CLOSE)
      p5i.pop()
    }

    appState.orderedDrawFuncs.set(noteDrawKey, {func: drawFunc, sortKey})

    ctx.branch(async ctx => {
      const startBeats = ctx.beats
      while(ctx.beats - startBeats < note.note.duration) {
        sweepProgress = (ctx.beats - startBeats) / note.note.duration
        await ctx.wait(0.016)
      }

      //remove the draw func from the orderedDrawFuncs map
      appState.orderedDrawFuncs.delete(noteDrawKey)
    })

    await ctx.wait(note.postDelta)
  }

  //remove all draw funcs with key starting with launchId (if break in loop using playFlag)
  const keysToDelete: string[] = []
  appState.orderedDrawFuncs.forEach((drawFunc, drawKey) => {
    if (drawKey.includes(launchId)) {
      keysToDelete.push(drawKey)
    }
  })
  keysToDelete.forEach(drawKey => {
    appState.orderedDrawFuncs.delete(drawKey)
  })
}

const pianoChains = Array.from({ length: 10 }, (_, i) => getPianoChain())
const midiOuts: MIDIValOutput[] = [];


const edittingDrawFunc = (p: p5) => {
  appState.polygons.forEach(polygon => {
    const points = polygon.points;
    
    // Draw polygon outline
    p.stroke(polygon.selected ? '#00FF00' : '#FFFFFF');
    p.noFill();
    p.beginShape();
    points.forEach(point => {
      p.vertex(point.x, point.y);
    });
    p.endShape(p.CLOSE);
    
    // Draw polygon points
    p.noStroke();
    points.forEach((point, idx) => {
      // Highlight the selected point in green
      if (polygon.selected && idx === selectedPointIndex) {
        p.fill('#00FF00');
      } else {
        p.fill('#AAAAAA');
      }
      p.ellipse(point.x, point.y, 10, 10);
    });
  });
  
  // Draw active polygon being created
  if (activePolygon.length > 0) {
    p.stroke('#FFFFFF');
    p.noFill();
    p.beginShape();
    activePolygon.forEach(point => {
      p.vertex(point.x, point.y);
    });
    p.endShape();
    
    // Draw points of active polygon
    p.noStroke();
    p.fill('#AAAAAA');
    activePolygon.forEach(point => {
      p.ellipse(point.x, point.y, 10, 10);
    });
  }
}

const playingDrawFunc = (p: p5) => {
  const sortedDrawFuncs = Array.from(appState.orderedDrawFuncs.values()).sort((a, b) => a.sortKey - b.sortKey)
  sortedDrawFuncs.forEach(drawFunc => {
    drawFunc.func(p)
  })
}

/*

interactions:

mode : drawNewPolygon
- first click starts the polygon
- subsequent clicks add points in order

mode : addPointToPolygon
- if no polygon selected, click finds the nearest edge and selects that polygon
- clicks with selected polygon adds a point to the nearest edge, half way along the edge

mode : selectPoint
- click selects the closest point
- drag moves the selected point

mode : selectPolygon
- click selects the closest polygon
- drag moves the selected polygon

keyboard keys 1/2/3/4 swap between modes

by default draw polygons in white, points in grey. draw selected polygon in green, selected point in green

after a mouse up event occurs, save the polygons to polygonHistory

*/

// Track the active polygon being created
let activePolygon: { x: number, y: number }[] = []
let selectedPolygonIndex = -1
let selectedPointIndex = -1
let dragStartMouse = { x: 0, y: 0 }
let dragStartPolygonPoints: { x: number, y: number }[] = []

// Helper function to generate unique IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function savePolygonHistory() {
  // Create a deep copy of the current polygons state
  const polygonsCopy = appState.polygons.map(polygon => ({
    id: polygon.id,
    selected: polygon.selected,
    points: polygon.points.map(p => ({ x: p.x, y: p.y }))
  }));
  
  appState.polygonHistory.push(polygonsCopy);
}

function getDistanceBetweenPoints(p1: {x: number, y: number}, p2: {x: number, y: number}): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function findClosestPoint(points: {x: number, y: number}[], point: {x: number, y: number}): number {
  let minDist = Infinity;
  let closestIndex = -1;
  
  points.forEach((pt, idx) => {
    const dist = getDistanceBetweenPoints(pt, point);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = idx;
    }
  });
  
  return closestIndex;
}

// Function to finalize the active polygon if it has enough points
function finalizeActivePolygon() {
  if (activePolygon.length >= 3) {
    // Add the polygon to the app state
    appState.polygons.push({
      points: [...activePolygon],
      id: generateId(),
      selected: false
    });
    
    // Save to history
    savePolygonHistory();
  }
  
  // Reset the active polygon
  activePolygon = [];
}

// Watch for mode changes
watch(cursorState, (newMode, oldMode) => {
  if (oldMode === 'drawNewPolygon' && newMode !== 'drawNewPolygon') {
    finalizeActivePolygon();
  }
});

const launchQueue: ((ctx: TimeContext) => Promise<any>)[] = []

let checkPopupState = 0; 
let currentEventListeners: {
  target: HTMLCanvasElement | Document,
  events: { type: string, handler: EventListener }[]
} | null = null
let currentKeyboardListeners: {
  target: Window | Document,
  events: { type: string, handler: EventListener, key?: string }[]
} | null = null

onMounted(async () => {
  try {

    await MIDI_READY
    //todo - add static data eventually
    await INITIALIZE_ABLETON_CLIPS('src/sketches/polygonFill/piano_melodies Project/piano_melodies.als', null, false)
    await TONE_AUDIO_START

    const iac1 = midiOutputs.get('IAC Driver Bus 1')
    const iac2 = midiOutputs.get('IAC Driver Bus 2')
    const iac3 = midiOutputs.get('IAC Driver Bus 3')
    const iac4 = midiOutputs.get('IAC Driver Bus 4')

    midiOuts.push(iac1, iac2, iac3, iac4)

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    // Helper function to get the correct target for events
    const getEventTarget = (): HTMLCanvasElement | null => {
      if (appState.canvasInPopup && appState.popupWindow) {
        const popupCanvas = appState.popupWindow.document.getElementById('threeCanvas') as HTMLCanvasElement
        return popupCanvas || null
      }
      return threeCanvas
    }

    // Enhanced coordinate calculation that handles all scenarios
    const getP5Coords = (ev: MouseEvent, logCoords: boolean = false) => {
      const target = getEventTarget()
      if (!target) return { x: 0, y: 0 }
      
      // Check if we're in fullscreen mode
      let isFullscreen = false
      if (appState.canvasInPopup && appState.popupWindow) {
        isFullscreen = !!(appState.popupWindow.document.fullscreenElement || 
                         (appState.popupWindow.document as any).webkitFullscreenElement || 
                         (appState.popupWindow.document as any).mozFullScreenElement || 
                         (appState.popupWindow.document as any).msFullscreenElement)
      } else {
        isFullscreen = !!(document.fullscreenElement || 
                         (document as any).webkitFullscreenElement || 
                         (document as any).mozFullScreenElement || 
                         (document as any).msFullscreenElement)
      }
      
      if (isFullscreen) {
        // In fullscreen, we need to map from screen space to canvas space
        const rect = target.getBoundingClientRect()
        
        // Use the resolution from appState which should match p5 canvas
        const canvasWidth = resolution.width
        const canvasHeight = resolution.height
        
        // Calculate the scale factors
        const scaleX = canvasWidth / rect.width
        const scaleY = canvasHeight / rect.height
        
        const x = (ev.clientX - rect.left) * scaleX
        const y = (ev.clientY - rect.top) * scaleY
        
        if (logCoords) {
          console.log('Fullscreen coords:', {
            clientX: ev.clientX,
            clientY: ev.clientY,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            canvas: { width: canvasWidth, height: canvasHeight },
            scale: { x: scaleX, y: scaleY },
            result: { x, y }
          })
        }
        
        return { x, y }
      } else {
        // Use the existing function for non-fullscreen
        return targetToP5Coords(ev, p5i, target)
      }
    }

    let p5Mouse = { x: 0, y: 0 }
    
    // Use a wrapper function that can handle both main page and popup events
    const handleMouseMove = (ev: MouseEvent) => {
      // Also check for ignored elements on mouse move
      const target = ev.target as HTMLElement;
      if (target && (target.hasAttribute('data-ignore-click') || target.tagName === 'BUTTON')) {
        return;
      }
      
      p5Mouse = getP5Coords(ev, false) // Don't log on mouse move
      
      // Handle drag behavior for selected point or polygon
      if (isMouseDown) {
        if (cursorState.value === 'selectPoint' && selectedPolygonIndex >= 0 && selectedPointIndex >= 0) {
          // Move the selected point
          appState.polygons[selectedPolygonIndex].points[selectedPointIndex].x = p5Mouse.x;
          appState.polygons[selectedPolygonIndex].points[selectedPointIndex].y = p5Mouse.y;
        } else if (cursorState.value === 'selectPolygon' && selectedPolygonIndex >= 0) {
          // Move the entire polygon
          const deltaX = p5Mouse.x - dragStartMouse.x;
          const deltaY = p5Mouse.y - dragStartMouse.y;
          
          appState.polygons[selectedPolygonIndex].points = dragStartPolygonPoints.map(p => ({
            x: p.x + deltaX,
            y: p.y + deltaY
          }));
        }
      }
    }

    const handleMouseDown = (ev: MouseEvent) => {
      // Check if the click is on the fullscreen button or any element that should be ignored
      const target = ev.target as HTMLElement;
      if (target && (target.hasAttribute('data-ignore-click') || target.tagName === 'BUTTON')) {
        console.log('Ignoring click on UI element');
        return;
      }
      
      p5Mouse = getP5Coords(ev, true) // Log coordinates on click
      
      switch (cursorState.value) {
        case 'drawNewPolygon':
          if (activePolygon.length === 0) {
            // Start a new polygon
            activePolygon.push({ x: p5Mouse.x, y: p5Mouse.y });
          } else {
            // Add a new point to the active polygon
            activePolygon.push({ x: p5Mouse.x, y: p5Mouse.y });
            
            // If we click close to the first point, complete the polygon
            const firstPoint = activePolygon[0];
            const dist = getDistanceBetweenPoints(firstPoint, p5Mouse);
            
            if (activePolygon.length > 2 && dist < 20) {
              // Complete the polygon and add it to the appState
              appState.polygons.push({
                points: [...activePolygon],
                id: generateId(),
                selected: false
              });
              
              // Reset active polygon
              activePolygon = [];
            }
          }
          break;
          
        case 'addPointToPolygon':
          if (selectedPolygonIndex < 0) {
            // Find the nearest polygon by checking the closest edge
            const result = findClosestPolygonLineAtPoint(
              appState.polygons.map(p => ({ points: p.points })), 
              p5Mouse
            );
            
            if (result.polygonIndex >= 0) {
              // Deselect any previously selected polygon
              appState.polygons.forEach(p => p.selected = false);
              
              // Select the found polygon
              selectedPolygonIndex = result.polygonIndex;
              appState.polygons[selectedPolygonIndex].selected = true;
            }
          } else {
            // We already have a selected polygon, so add a point to the nearest edge
            const polygon = appState.polygons[selectedPolygonIndex];
            const points = polygon.points;
            
            // Find the closest edge
            let minDist = Infinity;
            let closestEdgeIndex = -1;
            
            for (let i = 0; i < points.length; i++) {
              const nextIndex = (i + 1) % points.length;
              const p1 = points[i];
              const p2 = points[nextIndex];
              
              const dist = lineToPointDistance(p1, p2, p5Mouse);
              if (dist < minDist) {
                minDist = dist;
                closestEdgeIndex = i;
              }
            }
            
            if (closestEdgeIndex >= 0) {
              const p1 = points[closestEdgeIndex];
              const p2 = points[(closestEdgeIndex + 1) % points.length];
              
              // Calculate midpoint of the edge
              const midpoint = {
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
              };
              
              // Insert the new point after the first point of the edge
              polygon.points.splice(closestEdgeIndex + 1, 0, midpoint);
            }
          }
          break;
          
        case 'selectPoint':
          // Find the closest point in the closest polygon
          let closestPolygonIdx = -1;
          let closestPointIdx = -1;
          let minDist = Infinity;
          
          appState.polygons.forEach((polygon, polyIdx) => {
            const pointIdx = findClosestPoint(polygon.points, p5Mouse);
            if (pointIdx >= 0) {
              const dist = getDistanceBetweenPoints(polygon.points[pointIdx], p5Mouse);
              if (dist < minDist) {
                minDist = dist;
                closestPolygonIdx = polyIdx;
                closestPointIdx = pointIdx;
              }
            }
          });
          
          if (closestPolygonIdx >= 0 && minDist < 30) {
            // Deselect any previously selected polygon
            appState.polygons.forEach(p => p.selected = false);
            
            // Select the new polygon and point
            selectedPolygonIndex = closestPolygonIdx;
            selectedPointIndex = closestPointIdx;
            appState.polygons[selectedPolygonIndex].selected = true;
          } else {
            selectedPolygonIndex = -1;
            selectedPointIndex = -1;
            appState.polygons.forEach(p => p.selected = false);
          }
          break;
          
        case 'selectPolygon':
          // Find the polygon that contains the click point
          let containingPolyIdx = -1;
  
          
          if (containingPolyIdx < 0) {
            const result = findClosestPolygonLineAtPoint(
              appState.polygons.map(p => ({ points: p.points })),
              p5Mouse
            );
            
            if (result.polygonIndex >= 0 && result.distance < 30) {
              containingPolyIdx = result.polygonIndex;
            }
          }
          
          if (containingPolyIdx >= 0) {
            // Deselect any previously selected polygon
            appState.polygons.forEach(p => p.selected = false);
            
            // Select the new polygon
            selectedPolygonIndex = containingPolyIdx;
            appState.polygons[selectedPolygonIndex].selected = true;
            
            // Store drag start info
            dragStartMouse = { ...p5Mouse };
            dragStartPolygonPoints = appState.polygons[selectedPolygonIndex].points.map(p => ({ ...p }));
          } else {
            selectedPolygonIndex = -1;
            appState.polygons.forEach(p => p.selected = false);
          }
          break;
      }
      isMouseDown = true;
    }

    const handleMouseUp = (ev: MouseEvent) => {
      isMouseDown = false;
      
      // Save the current state to history when we complete an action
      savePolygonHistory();
    }

    // Store keyboard event handlers for reuse
    const keyboardHandlers = {
      mode1: () => {
        cursorState.value = 'drawNewPolygon';
        selectedPolygonIndex = -1;
        selectedPointIndex = -1;
        appState.polygons.forEach(p => p.selected = false);
      },
      mode2: () => {
        cursorState.value = 'addPointToPolygon';
        selectedPointIndex = -1;
      },
      mode3: () => {
        cursorState.value = 'selectPoint';
        selectedPolygonIndex = -1;
        selectedPointIndex = -1;
        appState.polygons.forEach(p => p.selected = false);
      },
      mode4: () => {
        cursorState.value = 'selectPolygon';
        selectedPointIndex = -1;
      },
      backtick: () => {
        if (cursorState.value === 'drawNewPolygon') {
          finalizeActivePolygon();
        }
      },
      pause: () => {
        appState.paused = !appState.paused;
      },
      save: () => {
        savePolygonsToFile();
      },
      load: () => {
        loadPolygonsFromFile();
      },
      clear: () => {
        clearAllPolygons();
      },
      keydown: (ev: KeyboardEvent) => {
        console.log('keydown', ev.key)
        // Only handle Q, W, E, R keys for toggle functionality
        if (['q', 'w', 'e', 'r'].includes(ev.key.toLowerCase())) {
          launchLoopForKey(ev.key.toLowerCase(), p5i)
        }
      }
    }

    // Set up keyboard listeners that work for both main page and popup
    const setupKeyboardListeners = () => {
      // Remove existing keyboard listeners
      if (currentKeyboardListeners) {
        currentKeyboardListeners.events.forEach(({ type, handler }) => {
          currentKeyboardListeners!.target.removeEventListener(type, handler)
        })
        currentKeyboardListeners = null
      }

      let keyboardTarget: Window | Document
      
      if (appState.canvasInPopup && appState.popupWindow) {
        // Add listeners to popup window
        keyboardTarget = appState.popupWindow
        // Focus the popup window to ensure it receives keyboard events
        appState.popupWindow.focus()
      } else {
        // Add listeners to main window
        keyboardTarget = window
      }

      // Create keyboard event handlers
      const handleKeydown = (ev: KeyboardEvent) => {
        switch(ev.key) {
          case '1':
            keyboardHandlers.mode1()
            break
          case '2':
            keyboardHandlers.mode2()
            break
          case '3':
            keyboardHandlers.mode3()
            break
          case '4':
            keyboardHandlers.mode4()
            break
          case '`':
            keyboardHandlers.backtick()
            break
          case 'p':
            keyboardHandlers.pause()
            break
          case 's':
            if (ev.ctrlKey || ev.metaKey) {
              ev.preventDefault()
              keyboardHandlers.save()
            }
            break
          case 'o':
            if (ev.ctrlKey || ev.metaKey) {
              ev.preventDefault()
              keyboardHandlers.load()
            }
            break
          case 'Delete':
          case 'Backspace':
            if (ev.shiftKey) {
              keyboardHandlers.clear()
            }
            break
          default:
            keyboardHandlers.keydown(ev)
            break
        }
      }

      const events = [
        { type: 'keydown', handler: handleKeydown }
      ]

      // Add the event listeners
      events.forEach(({ type, handler }) => {
        keyboardTarget.addEventListener(type, handler)
      })

      // Store reference for cleanup
      currentKeyboardListeners = { target: keyboardTarget, events }
      
      console.log('Keyboard listeners set up for:', appState.canvasInPopup ? 'popup' : 'main window')
    }

    // Modified setupEventListeners to also handle keyboard
    const setupAllEventListeners = () => {
      // Setup mouse events
      // Remove existing listeners first
      if (currentEventListeners) {
        currentEventListeners.events.forEach(({ type, handler }) => {
          currentEventListeners!.target.removeEventListener(type, handler)
        })
        currentEventListeners = null
      }

      const target = getEventTarget()
      if (!target) {
        console.log('No target available for event listeners')
        return
      }

      let eventTarget: HTMLCanvasElement | Document
      let events: { type: string, handler: EventListener }[]

      if (appState.canvasInPopup && appState.popupWindow) {
        // Add listeners to popup window document for better event capture
        eventTarget = appState.popupWindow.document
        events = [
          { type: 'mousemove', handler: handleMouseMove },
          { type: 'mousedown', handler: handleMouseDown },
          { type: 'mouseup', handler: handleMouseUp }
        ]
      } else {
        // Add listeners to the canvas element
        eventTarget = target
        events = [
          { type: 'mousemove', handler: handleMouseMove },
          { type: 'mousedown', handler: handleMouseDown },
          { type: 'mouseup', handler: handleMouseUp }
        ]
      }

      // Add the event listeners
      events.forEach(({ type, handler }) => {
        eventTarget.addEventListener(type, handler)
      })

      // Store reference for cleanup
      currentEventListeners = { target: eventTarget, events }
      
      console.log('Mouse listeners set up for:', appState.canvasInPopup ? 'popup' : 'main page')

      // Setup keyboard events
      setupKeyboardListeners()
    }

    // Initial setup
    setupAllEventListeners()

    // Watch for popup state changes and re-setup listeners
    checkPopupState = setInterval(() => {
      const target = getEventTarget()
      const needsMouseResetup = appState.canvasInPopup ? 
        (target && currentEventListeners?.target !== appState.popupWindow?.document) :
        (currentEventListeners?.target !== threeCanvas)
      
      const needsKeyboardResetup = appState.canvasInPopup ?
        (currentKeyboardListeners?.target !== appState.popupWindow) :
        (currentKeyboardListeners?.target !== window)
      
      if (needsMouseResetup || needsKeyboardResetup) {
        console.log('Event state changed, resetting all listeners')
        setupAllEventListeners()
      }
    }, 500)

    launchLoop(async (ctx) => {
      while(true) {
        launchQueue.forEach(async (func) => {
          ctx.branch(func)
        })
        launchQueue.length = 0
        await ctx.wait(0.25)
      }
    })


    const playNoteMidi = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, voiceIdx: number) => {
      const inst = midiOuts[voiceIdx]
      inst.sendNoteOn(pitch, velocity)
      ctx.branch(async ctx => {
        await ctx.wait((noteDur ?? 0.1) * 0.98)
        inst.sendNoteOff(pitch)
      }).finally(() => {
        // console.log('loop canclled finally', pitch) //todo core - need to cancel child contexts properly (this doesn't fire immediately on parent cancel)
        inst.sendNoteOff(pitch)
      })
    }


    const playNotePiano = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, pianoIndex = 0) => {
      // Update the FX parameters before playing the note
      
      const piano = pianoChains[mod2(pianoIndex, pianoChains.length)].piano
      // const bpm = ctx.bpm
      // const dur = noteDur * (60 / bpm)
      // piano.triggerAttackRelease([m2f(pitch)], dur, null, velocity)
      piano.triggerAttack([m2f(pitch)], Tone.now(), velocity/127)
      ctx.branch(async ctx => {
        await ctx.wait(noteDur)
        piano.triggerRelease(m2f(pitch))
      }).finally(() => {
        piano.triggerRelease(m2f(pitch))
      })
    }

    playNote = playNoteMidi

    appState.drawFunctions.push((p: p5) => {
      // Draw completed polygons
      // displayMode.value === 'editting' ? edittingDrawFunc(p) : playingDrawFunc(p)
      edittingDrawFunc(p)
      if (displayMode.value === 'playing') {
        playingDrawFunc(p)
      }
    });

    const passthru = new Passthru({ src: p5Canvas }, 2560, 1440)
    const canvasPaint = new CanvasPaint({ src: passthru }, 2560, 1440)

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })

  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  
  // Clean up mouse event listeners
  if (currentEventListeners) {
    currentEventListeners.events.forEach(({ type, handler }) => {
      currentEventListeners!.target.removeEventListener(type, handler)
    })
  }
  
  // Clean up keyboard event listeners
  if (currentKeyboardListeners) {
    currentKeyboardListeners.events.forEach(({ type, handler }) => {
      currentKeyboardListeners!.target.removeEventListener(type, handler)
    })
  }
  
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
  timeLoops.forEach(tl => tl.cancel())
  clearInterval(checkPopupState)
})

// Function to save polygons to JSON file
function savePolygonsToFile() {
  const polygonData = {
    polygons: appState.polygons.map(polygon => ({
      id: polygon.id,
      selected: polygon.selected,
      points: polygon.points.map(p => ({ x: p.x, y: p.y }))
    })),
    timestamp: new Date().toISOString(),
    version: "1.0"
  };

  const dataStr = JSON.stringify(polygonData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `polygons_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  link.click();
  
  // Clean up
  URL.revokeObjectURL(link.href);
}

// Function to load polygons from JSON file
function loadPolygonsFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target?.result as string);
        
        // Validate the JSON structure
        if (!jsonData.polygons || !Array.isArray(jsonData.polygons)) {
          throw new Error('Invalid polygon data format');
        }
        
        // Clear existing polygons and reset selection state
        appState.polygons = [];
        selectedPolygonIndex = -1;
        selectedPointIndex = -1;
        activePolygon = [];
        
        // Load the polygons
        jsonData.polygons.forEach((polygonData: any) => {
          if (polygonData.points && Array.isArray(polygonData.points)) {
            appState.polygons.push({
              id: polygonData.id || generateId(),
              selected: false, // Reset selection state
              points: polygonData.points.map((p: any) => ({ x: p.x || 0, y: p.y || 0 }))
            });
          }
        });
        
        // Save to history
        savePolygonHistory();
        
        console.log(`Loaded ${appState.polygons.length} polygons from file`);
      } catch (error) {
        console.error('Error loading polygon file:', error);
        alert('Error loading polygon file. Please check the file format.');
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
}

// Function to clear all polygons
function clearAllPolygons() {
  if (appState.polygons.length === 0) return;
  
  if (confirm('Are you sure you want to clear all polygons? This action cannot be undone.')) {
    appState.polygons = [];
    selectedPolygonIndex = -1;
    selectedPointIndex = -1;
    activePolygon = [];
    savePolygonHistory();
  }
}

// Helper functions for template
const getLoopBackgroundColor = (key: string): string => {
  if (keyToToggleStateMap.get(key)) {
    const color = keyToColorMap.get(key)
    if (color) {
      return `rgba(${color.r}, ${color.g}, ${color.b}, 0.3)`
    }
    return '#90EE90'
  }
  return '#f0f0f0'
}

const getClipDisplayName = (key: string): string => {
  return keyToClipNameMap.get(key)?.replace(/_/g, ' ') || ''
}

</script>

<template>
  <div class="livecode-container">
    <!-- Control Panel -->
    <div class="control-panel">
      <div class="control-row">
        <div class="control-group">
          <label class="control-label">Cursor State</label>
          <select v-model="cursorState" class="control-select">
            <option value="drawNewPolygon">Draw New Polygon</option>
            <option value="addPointToPolygon">Add Point To Polygon</option>
            <option value="selectPoint">Select Point</option>
            <option value="selectPolygon">Select Polygon</option>
          </select>
        </div>
        
        <div class="control-group">
          <label class="control-label">Display Mode</label>
          <select v-model="displayMode" class="control-select">
            <option value="editting">Editing</option>
            <option value="playing">Playing</option>
          </select>
        </div>
      </div>
    </div>
    
    <!-- Loop Status Panel -->
    <div class="status-panel">
      <h3 class="panel-title">Loop Status</h3>
      <div class="loop-indicators">
        <div 
          v-for="key in ['q', 'w', 'e', 'r']" 
          :key="key"
          class="loop-indicator"
          :class="{ 'active': keyToToggleStateMap.get(key) }"
        >
          <div class="loop-key">{{ key.toUpperCase() }}</div>
          <div class="loop-name">{{ getClipDisplayName(key) }}</div>
          <div class="loop-status">
            <span 
              class="status-dot"
              :class="{ 'playing': keyToToggleStateMap.get(key) }"
            ></span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Action Panel -->
    <div class="action-panel">
      <div class="action-buttons">
        <button @click="savePolygonsToFile" data-ignore-click class="btn btn-primary">
          <span class="btn-icon">💾</span>
          Save
          <span class="btn-shortcut">Ctrl+S</span>
        </button>
        <button @click="loadPolygonsFromFile" data-ignore-click class="btn btn-secondary">
          <span class="btn-icon">📁</span>
          Load
          <span class="btn-shortcut">Ctrl+O</span>
        </button>
        <button @click="clearAllPolygons" data-ignore-click class="btn btn-danger">
          <span class="btn-icon">🗑️</span>
          Clear
          <span class="btn-shortcut">Shift+Del</span>
        </button>
      </div>
      
      <div class="stats">
        <div class="stat-item">
          <span class="stat-label">Polygons:</span>
          <span class="stat-value">{{ appState.polygons.length }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.livecode-container {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #333;
  background: #f8f9fa;
  border-radius: 4px;
  padding: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 8px;
}

/* Control Panel */
.control-panel {
  margin-bottom: 8px;
}

.control-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.control-label {
  font-weight: 600;
  font-size: 13px;
  color: #495057;
  white-space: nowrap;
}

.control-select {
  padding: 4px 8px;
  border: 1px solid #ced4da;
  border-radius: 3px;
  background: white;
  font-size: 13px;
  color: #495057;
  min-width: 140px;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.control-select:focus {
  outline: none;
  border-color: #80bdff;
  box-shadow: 0 0 0 1px rgba(0, 123, 255, 0.25);
}

/* Status Panel */
.status-panel {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}

.panel-title {
  margin: 0 0 6px 0;
  font-size: 14px;
  font-weight: 600;
  color: #495057;
}

.loop-indicators {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 6px;
}

.loop-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid #e9ecef;
  border-radius: 3px;
  background: #f8f9fa;
  transition: all 0.2s ease;
}

.loop-indicator.active {
  border-color: #28a745;
  background: rgba(40, 167, 69, 0.1);
  box-shadow: 0 1px 2px rgba(40, 167, 69, 0.2);
}

.loop-key {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #6c757d;
  color: white;
  border-radius: 3px;
  font-weight: bold;
  font-size: 12px;
}

.loop-indicator.active .loop-key {
  background: #28a745;
}

.loop-name {
  flex: 1;
  font-weight: 500;
  color: #495057;
  text-transform: capitalize;
  font-size: 13px;
}

.loop-status {
  display: flex;
  align-items: center;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #dee2e6;
  transition: background-color 0.2s ease;
}

.status-dot.playing {
  background: #28a745;
  box-shadow: 0 0 4px rgba(40, 167, 69, 0.6);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}

/* Action Panel */
.action-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.action-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  position: relative;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.btn:active {
  transform: translateY(0);
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover {
  background: #c82333;
}

.btn-icon {
  font-size: 12px;
}

.btn-shortcut {
  font-size: 10px;
  opacity: 0.8;
  background: rgba(255, 255, 255, 0.2);
  padding: 1px 4px;
  border-radius: 2px;
  margin-left: 2px;
}

/* Stats */
.stats {
  display: flex;
  gap: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 3px;
}

.stat-label {
  font-size: 12px;
  color: #6c757d;
  font-weight: 500;
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  color: #495057;
}

/* Responsive Design */
@media (max-width: 768px) {
  .control-row {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  
  .control-group {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
  }
  
  .loop-indicators {
    grid-template-columns: 1fr;
  }
  
  .action-panel {
    flex-direction: column;
    align-items: stretch;
  }
  
  .action-buttons {
    justify-content: center;
  }
}
</style>