import { computed, ref } from 'vue'
import { availableStrokes, animationParams, gpuStrokesReady, launchByName, resolution, selectedGroupName, scriptCode, scriptExecuting, SCRIPT_STORAGE_KEY, globalStore } from './appState'
import { DrawingScene } from './gpuStrokes/drawingScene'
import { StrokeInterpolator } from './gpuStrokes/strokeInterpolator'
import { DRAWING_CONSTANTS } from './gpuStrokes/constants'
import type { FlattenedStroke, FlattenedStrokeGroup } from '@/canvas/canvasState'
import type { StrokePoint } from './gpuStrokes/strokeTypes'
import type { AnchorKind } from './gpuStrokes/coordinateUtils'
import type { LoopHandle } from '@/channels/base_time_context'
//@ts-ignore
// import Stats from '@/rendering/stats'
import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { launch, type CancelablePromisePoxy, type TimeContext } from '@/channels/channels'

const store = globalStore()
const appState = store.appStateRef

const getGroupStrokeIndices = (groupName: string): number[] => {
  return appState.freehandGroupMap[groupName] || []
}

type GPUStroke = {
  index: number
  stroke: {
    id: string
    points: StrokePoint[]
    boundingBox: { minX: number, maxX: number, minY: number, maxY: number }
  }
}

const arrayOf = (n: number) => Array.from(Array(n).keys())

export const babylonContainer = ref<HTMLCanvasElement>()
export const scriptEditorRef = ref<HTMLDivElement>()
export const webGPUSupported = computed(() => typeof navigator !== 'undefined' && !!navigator.gpu)
export const availableGroups = computed(() => Object.keys(appState.freehandGroupMap))

let drawingScene: DrawingScene | undefined
let strokeInterpolator: StrokeInterpolator | undefined
let scriptEditor: EditorView | undefined
// let stats: Stats | undefined
const timeLoops: CancelablePromisePoxy<any>[] = []

const gridXY = { x: 16, y: 9 }
const letterLoops: (LoopHandle | null)[][] = arrayOf(gridXY.x).map(() => arrayOf(gridXY.y).map(() => null))
const letterAnimationGroups: string[][][] = arrayOf(gridXY.x).map(() => arrayOf(gridXY.y).map(() => [] as string[]))
let lastMouseGridCell = { x: -1, y: -1 }
const ANIMATE_TIME = 1
const layoutActivated = ref(false)

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const mousePos2GridCell = (event: { x: number, y: number }) => {
  const x = Math.floor(event.x / resolution.width * gridXY.x)
  const y = Math.floor(event.y / resolution.height * gridXY.y)
  return { x, y }
}

const charToStrokeMap: Map<string, FlattenedStrokeGroup> = new Map()

const convertFreehandStrokesToGPUFormat = () => {
  if (!strokeInterpolator) return []

  const flattenedStrokes: FlattenedStroke[] = []

  const extractStrokes = (group: FlattenedStrokeGroup) => {
    group.children.forEach(child => {
      if (child.type === 'stroke') {
        flattenedStrokes.push(child)
      } else {
        extractStrokes(child)
      }
    })
  }

  appState.freehandRenderData.forEach(group => extractStrokes(group))

  const gpuStrokes: GPUStroke[] = []

  for (let i = 0; i < Math.min(flattenedStrokes.length, DRAWING_CONSTANTS.MAX_STROKES); i++) {
    const flattenedStroke = flattenedStrokes[i]
    try {
      const points = flattenedStroke.points.map(p => ({
        x: p.x,
        y: p.y,
        t: p.ts
      }))

      if (points.length < 2) continue

      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      points.forEach(p => {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      })

      const strokeData = {
        id: `gpu_stroke_${i}`,
        points,
        boundingBox: { minX, maxX, minY, maxY }
      }

      const normalizedPoints = strokeInterpolator.normalizeStroke(strokeData)

      if (strokeInterpolator.validateNormalizedStroke(normalizedPoints)) {
        gpuStrokes.push({
          index: i,
          stroke: {
            ...strokeData,
            points: normalizedPoints
          }
        })
      }
    } catch (error) {
      console.warn(`Failed to convert stroke ${i}:`, error)
    }
  }

  return gpuStrokes
}

export const updateGPUStrokes = () => {
  if (!drawingScene || !gpuStrokesReady.value) return

  try {
    const gpuStrokes = convertFreehandStrokesToGPUFormat()

    drawingScene.uploadStrokes(gpuStrokes)

    availableStrokes.value = gpuStrokes.map((stroke, idx) => ({
      index: idx,
      name: `Stroke ${idx + 1}`
    }))

    if (animationParams.value.strokeA >= gpuStrokes.length) {
      animationParams.value.strokeA = 0
    }
    if (animationParams.value.strokeB >= gpuStrokes.length) {
      animationParams.value.strokeB = 0
    }

    console.log(`Updated GPU with ${gpuStrokes.length} strokes`)
  } catch (error) {
    console.warn('Failed to update GPU strokes:', error)
  }
}

export const initializeGPUStrokes = async () => {
  if (!babylonContainer.value) return

  try {
    if (!navigator.gpu) {
      console.warn('WebGPU not supported - GPU strokes disabled')
      return
    }

    drawingScene = new DrawingScene()
    strokeInterpolator = new StrokeInterpolator()

    // stats = new Stats()
    // stats.showPanel(0)
    // babylonContainer.value.parentElement?.appendChild(stats.dom)

    await drawingScene.createScene(babylonContainer.value, null)

    gpuStrokesReady.value = true

    updateGPUStrokes()

    console.log('GPU Strokes initialized successfully')
  } catch (error) {
    console.error('Failed to initialize GPU Strokes:', error)
    gpuStrokesReady.value = false
  }
}

const mapCharToStrokeGroup = () => {
  appState.freehandRenderData.forEach(fsg => {
    if (fsg.metadata?.char && fsg.metadata.char.match(/^[a-z0-9]$/i)) {
      charToStrokeMap.set(fsg.metadata.char, fsg)
    }
  })
}

const flatIdxToCellCoord = (idx: number) => {
  return { x: idx % gridXY.x, y: Math.floor(idx / gridXY.x) }
}

const convertStringToCellIndices = (inputString: string) => {
  const cellDef = inputString.split('').map((c, idx) => {
    const hasName = ['a', 'b', 'c', 'd', 'e'].includes(c)
    const xy = flatIdxToCellCoord(idx)
    return { hasName, xy, name: c }
  }).filter(def => def.hasName)

  return cellDef
}

const launchLetterAtCell = (xInd: number, yInd: number, letterGroupName: string) => {
  const strokeIndices = getGroupStrokeIndices(letterGroupName)
  const groupBBox = drawingScene!.getGroupStrokeBounds(strokeIndices)!

  const bboxWidth = groupBBox.maxX - groupBBox.minX
  const bboxHeight = groupBBox.maxY - groupBBox.minY
  const cellWidth = resolution.width / gridXY.x
  const cellHeight = resolution.height / gridXY.y
  const scale = cellWidth / bboxWidth
  const baseline: number = charToStrokeMap.get(letterGroupName)?.metadata?.baseline ?? 0
  const yShift = bboxHeight * scale * baseline
  const launchX = cellWidth * xInd
  const launchY = cellHeight * yInd - yShift

  const launchedAnimationIds = drawingScene!.launchGroup(launchX, launchY, strokeIndices, {
    anchor: 'bbox-tl',
    scale,
    controlMode: 'manual'
  })

  letterAnimationGroups[xInd][yInd] = launchedAnimationIds
}

const launchAnimatedLetterLayoutForString = (inputStr: string) => {
  const existingStrokeIds = letterAnimationGroups.flat(3)
  existingStrokeIds.forEach(eid => {
    drawingScene!.cancelStroke(eid)
  })
  const existingPlayLoops = letterLoops.flat(2)
  existingPlayLoops.forEach(l => {
    l?.cancel()
  })

  const cellDef = convertStringToCellIndices(inputStr)

  cellDef.forEach(def => {
    const { xy: { x, y }, name } = def
    launchLetterAtCell(x, y, name)
  })
}

const mouseAnimationMove = (event: MouseEvent) => {
  if (!layoutActivated.value) return
  if (!drawingScene || !gpuStrokesReady.value) return

  const rect = babylonContainer.value?.getBoundingClientRect()
  if (!rect) return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const { x: newX, y: newY } = mousePos2GridCell({ x, y })

  const enteredNewCell = lastMouseGridCell.x !== newX || lastMouseGridCell.y !== newY
  if (enteredNewCell) {
    const cellLoop = letterLoops[newX][newY]
    if (cellLoop) {
      cellLoop.cancel()
    }
    launchLoop(async ctx => {
      const thread = ctx.branch(async ctx => {
        const startTime = ctx.time
        while (ctx.time - startTime < ANIMATE_TIME) {
          const phase = ((ctx.time - startTime) / ANIMATE_TIME) / 2
          letterAnimationGroups[newX][newY].forEach(id => {
            drawingScene!.updateStroke(id, { phase })
          })
          await ctx.waitSec(0.016)
        }
      })
      letterLoops[newX][newY] = thread
    })
  }

  lastMouseGridCell = { x: newX, y: newY }
  console.log('new mouse cell', lastMouseGridCell)
}

export const launchLayout = () => {
  layoutActivated.value = true
  const testText = 'aabababcdcde'
  mapCharToStrokeGroup()
  launchAnimatedLetterLayoutForString(testText)
}

export const handleBabylonCanvasMove = (event: MouseEvent) => {
  mouseAnimationMove(event)
}

export const handleBabylonCanvasClick = (event: MouseEvent) => {
  if (!drawingScene || !gpuStrokesReady.value) return

  const rect = babylonContainer.value?.getBoundingClientRect()
  if (!rect) return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  try {
    if (launchByName.value && selectedGroupName.value) {
      const strokeIndices = getGroupStrokeIndices(selectedGroupName.value)
      if (strokeIndices.length === 0) {
        console.warn(`No strokes found for group: ${selectedGroupName.value}`)
        return
      }

      const launchedAnimationIds = drawingScene.launchGroup(
        x,
        y,
        strokeIndices,
        {
          anchor: animationParams.value.position as AnchorKind,
          duration: animationParams.value.duration,
          scale: animationParams.value.scale,
          loop: animationParams.value.loop,
          startPhase: animationParams.value.startPhase,
          controlMode: 'manual'
        }
      )

      if (launchedAnimationIds.length === 0) {
        console.warn(`Failed to launch any strokes for group: ${selectedGroupName.value}`)
        return
      }

      launchLoop(async ctx => {
        const hangTimeFrac = 0.3

        const singleDur = animationParams.value.duration
        const totalDur = animationParams.value.duration * launchedAnimationIds.length
        const hangTimeDur = totalDur * hangTimeFrac
        const phaseInDur = (totalDur - hangTimeDur) / 2
        const piecewisPhaseInDur = phaseInDur / launchedAnimationIds.length
        const startTime = ctx.progTime
        let elapsedTime = 0
        while (elapsedTime < totalDur) {
          const currentlyDrawingProg = elapsedTime % singleDur
          const currentlyDrawingInd = Math.floor(elapsedTime / singleDur)
          const currentlyDrawingPhase = currentlyDrawingProg / singleDur

          const activeId = launchedAnimationIds[currentlyDrawingInd]

          drawingScene!.updateStroke(activeId, { phase: currentlyDrawingPhase })

          elapsedTime = ctx.progTime - startTime

          launchedAnimationIds.forEach((animId, ind) => {
            if (elapsedTime < phaseInDur) {
              const phaseInTime = (elapsedTime - ind * piecewisPhaseInDur) / piecewisPhaseInDur
              const clampedPhase = Math.min(1, Math.max(0, phaseInTime)) * 0.5
              drawingScene!.updateStroke(animId, { phase: clampedPhase })
            } else {
              const outElapsedTime = elapsedTime - (phaseInDur + hangTimeDur)
              const phaseOutTime = (outElapsedTime - ind * piecewisPhaseInDur) / piecewisPhaseInDur
              const clampedPhase = Math.min(1, Math.max(0, phaseOutTime)) * 0.5 + 0.5
              drawingScene!.updateStroke(animId, { phase: clampedPhase })
            }
          })

          await ctx.waitSec(0.016)
        }
        launchedAnimationIds.forEach(animId => {
          drawingScene!.cancelStroke(animId)
        })
      })

      console.log(`Launched group "${selectedGroupName.value}" with ${launchedAnimationIds.length} strokes at (${x.toFixed(1)}, ${y.toFixed(1)}) using ${animationParams.value.position} anchor`)
    } else {
      if (availableStrokes.value.length < 2) {
        console.warn('Need at least 2 strokes for interpolated launch')
        return
      }

      const animationId = drawingScene.launchStrokeWithAnchor(
        x,
        y,
        animationParams.value.strokeA,
        animationParams.value.strokeB,
        {
          anchor: animationParams.value.position as AnchorKind,
          interpolationT: animationParams.value.interpolationT,
          duration: animationParams.value.duration,
          scale: animationParams.value.scale,
          loop: animationParams.value.loop,
          startPhase: animationParams.value.startPhase
        }
      )

      console.log(`Launched interpolated animation ${animationId} at (${x.toFixed(1)}, ${y.toFixed(1)}) ${animationParams.value.loop ? '[LOOPING]' : ''}`)
    }
  } catch (error) {
    console.warn('Failed to launch animation:', error)
  }
}

export const clearLoopedAnimations = () => {
  if (!drawingScene || !gpuStrokesReady.value) return

  try {
    drawingScene.clearLoopedAnimations()
  } catch (error) {
    console.warn('Failed to clear looped animations:', error)
  }
}

export const initializeScriptEditor = () => {
  if (!scriptEditorRef.value) return

  const extensions = [
    basicSetup,
    javascript(),
    oneDark,
    EditorView.theme({
      '&': {
        maxHeight: '300px',
        width: '100%'
      },
      '.cm-scroller': {
        overflow: 'auto',
        maxHeight: '300px'
      },
      '.cm-editor': {
        fontSize: '14px'
      }
    }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const newCode = update.state.doc.toString()
        scriptCode.value = newCode
        localStorage.setItem(SCRIPT_STORAGE_KEY, newCode)
      }
    })
  ]

  scriptEditor = new EditorView({
    doc: scriptCode.value,
    extensions,
    parent: scriptEditorRef.value
  })
}

export const executeScript = () => {
  if (!drawingScene || !gpuStrokesReady.value || scriptExecuting.value) return

  scriptExecuting.value = true

  try {
    const launchStroke = (x: number, y: number, strokeA: number, strokeB: number, options?: any) => {
      if (!drawingScene || availableStrokes.value.length < 2) {
        console.warn('Insufficient strokes available for launching')
        return
      }

      if (strokeA < 0 || strokeA >= availableStrokes.value.length ||
        strokeB < 0 || strokeB >= availableStrokes.value.length) {
        console.warn(`Invalid stroke indices: strokeA=${strokeA}, strokeB=${strokeB}. Available: 0-${availableStrokes.value.length - 1}`)
        return
      }

      try {
        return drawingScene.launchStroke(x, y, strokeA, strokeB, options)
      } catch (error) {
        console.error('Error launching stroke:', error)
      }
    }

    const code = scriptEditor?.state.doc.toString() || scriptCode.value

    const scriptFunction = new Function('launchStroke', code)
    scriptFunction(launchStroke)

    console.log('Script executed successfully')
  } catch (error: any) {
    console.error('Script execution error:', error)
    // eslint-disable-next-line no-alert
    alert(`Script Error: ${error.message}`)
  } finally {
    scriptExecuting.value = false
  }
}

export const disposeStrokeLauncher = () => {
  drawingScene?.dispose()
  drawingScene = undefined
  strokeInterpolator = undefined
  scriptEditor?.destroy()
  scriptEditor = undefined
  while (timeLoops.length) {
    const loop = timeLoops.pop()
    loop?.cancel()
  }
  // stats = undefined
}
