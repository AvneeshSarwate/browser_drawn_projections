<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type Polygon, type PolygonFillAppState, appStateName, resolution } from './appState';
import { inject, onMounted, onUnmounted, ref, type Ref, watch } from 'vue';
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
  'left': leftmostPointSortKey,
  'right': rightmostPointSortKey,
  'top': topmostPointSortKey,
  'bottom': bottommostPointSortKey
}
const sortPolygonsByDirection = (polygons: Polygon[], direction: SweepDir) => {
  const sortFunc = sortFuncs[direction]
  return polygons.sort((a, b) => sortFunc(a) - sortFunc(b))
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

const launchLoopForKey = (key: string, p5i: p5) => {
  const clipName = keyToClipNameMap.get(key)
  if (!clipName) return

  const clip = clipMap.get(clipName)
  if (!clip) return

  const launchId = generateId()
  const direction = clipName.split('_')[0] as SweepDir
  const useStatefulIdx = keyToUseStatefulIdxMap.get(key)!!

  launchQueue.push(async (ctx) => {
    const playInstance = ctx.branch(async (ctx) => {
      await playAndAnimateClip(launchId, clip, keyToColorMap.get(key)!!, direction, ctx, p5i, 0, useStatefulIdx)
    })
    
    playInstance.finally(() => {
      //remove the draw funcs for this launchId if crashed
      console.log('playInstance finally')
      appState.orderedDrawFuncs.forEach((drawFunc, key) => {
        if (key.startsWith(launchId)) {
          // appState.orderedDrawFuncs.delete(key)
        }
      })
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
    console.log('noteDrawKey', noteDrawKey)
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
  }

  //remove all draw funcs with key starting with launchId (if break in loop using playFlag)
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
        launchLoopForKey(ev.key, p5i)
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

</script>

<template>
  <div>
    <div style="margin-bottom: 10px;">
      <label>Cursor State</label>
      <select v-model="cursorState">
        <option value="drawNewPolygon">Draw New Polygon</option>
        <option value="addPointToPolygon">Add Point To Polygon</option>
        <option value="selectPoint">Select Point</option>
        <option value="selectPolygon">Select Polygon</option>
      </select>
      
      <label style="margin-left: 20px;">Display Mode</label>
      <select v-model="displayMode">
        <option value="editting">Editting</option>
        <option value="playing">Playing</option>
      </select>
    </div>
    
    <div style="margin-bottom: 10px;">
      <button @click="savePolygonsToFile" data-ignore-click>
        Save Polygons (Ctrl+S)
      </button>
      <button @click="loadPolygonsFromFile" data-ignore-click style="margin-left: 10px;">
        Load Polygons (Ctrl+O)
      </button>
      <button @click="clearAllPolygons" data-ignore-click style="margin-left: 10px; background-color: #ff4444;">
        Clear All (Shift+Delete)
      </button>
      <span style="margin-left: 20px; color: #888;">
        Polygons: {{ appState.polygons.length }}
      </span>
    </div>
  </div>
</template>

<style scoped></style>