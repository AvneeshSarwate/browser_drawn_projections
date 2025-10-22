import { computed, inject, ref, type ComputedRef, type Ref } from 'vue'
import type { FluidDebugMode, ParamDef } from './appState'
import type { Screenshot, ScreenshotMediaType, ScreenshotParameter } from './types/screenshot'

interface CreateScreenshotStoreOptions {
  getCanvas: () => HTMLCanvasElement | null | undefined
  getDebugMode: () => FluidDebugMode
  getParameters?: () => ParamDef[]
  ensureFreshFrame?: () => void | Promise<void>
}

interface CaptureOptions {
  lossless?: boolean
}

export interface ScreenshotStore {
  screenshots: Ref<Screenshot[]>
  selectedIds: Ref<string[]>
  selectedIdSet: ComputedRef<Set<string>>
  selectedScreenshots: ComputedRef<Screenshot[]>
  isCapturing: Ref<boolean>
  capture: (options?: CaptureOptions) => Promise<Screenshot>
  remove: (id: string) => void
  setSelected: (ids: string[]) => void
  toggleSelected: (id: string) => void
  clearSelection: () => void
  getSelected: () => Screenshot[]
  maxItems: number
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `shot-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image data'))
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Unexpected capture result'))
        return
      }
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

async function waitForAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

export const screenshotStoreKey = Symbol('fluid-screenshot-store')

export function createScreenshotStore(options: CreateScreenshotStoreOptions): ScreenshotStore {
  const screenshots = ref<Screenshot[]>([])
  const selectedIds = ref<string[]>([])
  const isCapturing = ref(false)
  const maxItems = 30
  let captureCount = 0

  const selectedIdSet = computed(() => new Set(selectedIds.value))

  const selectedScreenshots = computed(() => {
    const lookup = new Map(screenshots.value.map(item => [item.id, item] as const))
    const ordered: Screenshot[] = []
    for (const id of selectedIds.value) {
      const found = lookup.get(id)
      if (found) {
        ordered.push(found)
      }
    }
    return ordered
  })

  function revokeScreenshotResources(target: Screenshot | undefined): void {
    if (!target) {
      return
    }
    if (target.blobUrl) {
      URL.revokeObjectURL(target.blobUrl)
    }
  }

  function enforceLimit(): void {
    while (screenshots.value.length > maxItems) {
      const removed = screenshots.value.pop()
      if (!removed) {
        break
      }
      revokeScreenshotResources(removed)
      selectedIds.value = selectedIds.value.filter(id => id !== removed.id)
    }
  }

  function setSelected(ids: string[]): void {
    const validIds = new Set(screenshots.value.map(s => s.id))
    const unique: string[] = []
    for (const id of ids) {
      if (validIds.has(id) && !unique.includes(id)) {
        unique.push(id)
      }
    }
    selectedIds.value = unique
  }

  function toggleSelected(id: string): void {
    if (!screenshots.value.some(s => s.id === id)) {
      return
    }
    const exists = selectedIds.value.includes(id)
    if (exists) {
      selectedIds.value = selectedIds.value.filter(item => item !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }

  function remove(id: string): void {
    const index = screenshots.value.findIndex(s => s.id === id)
    if (index === -1) {
      return
    }
    const [removed] = screenshots.value.splice(index, 1)
    revokeScreenshotResources(removed)
    selectedIds.value = selectedIds.value.filter(item => item !== id)
  }

  function clearSelection(): void {
    selectedIds.value = []
  }

  function getSelected(): Screenshot[] {
    const lookup = new Map(screenshots.value.map(s => [s.id, s] as const))
    const result: Screenshot[] = []
    for (const id of selectedIds.value) {
      const found = lookup.get(id)
      if (found) {
        result.push(found)
      }
    }
    return result
  }

  async function capture(captureOptions?: CaptureOptions): Promise<Screenshot> {
    if (isCapturing.value) {
      throw new Error('Capture already in progress')
    }
    isCapturing.value = true
    try {
      await options.ensureFreshFrame?.()
      await waitForAnimationFrame()

      const canvas = options.getCanvas()
      if (!canvas) {
        throw new Error('Fluid simulation canvas not available')
      }

      const lossless = captureOptions?.lossless ?? false
      const mediaType: ScreenshotMediaType = lossless ? 'image/png' : 'image/webp'
      const quality = lossless ? undefined : 0.85

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => {
          if (result) {
            resolve(result)
          } else {
            reject(new Error('Canvas capture failed'))
          }
        }, mediaType, quality)
      })

      const base64 = await blobToBase64(blob)
      const now = Date.now()
      captureCount += 1

      const parameters: ScreenshotParameter[] | undefined = options.getParameters?.()
        ?.map(param => ({
          name: param.name,
          value: param.value.value,
          label: param.label
        }))

      const screenshot: Screenshot = {
        id: makeId(),
        label: `Shot ${captureCount}`,
        createdAt: now,
        debugMode: options.getDebugMode(),
        width: canvas.width,
        height: canvas.height,
        mediaType,
        base64,
        sizeBytes: blob.size,
        blobUrl: URL.createObjectURL(blob),
        parameters
      }

      screenshots.value = [screenshot, ...screenshots.value]
      enforceLimit()

      return screenshot
    } finally {
      isCapturing.value = false
    }
  }

  return {
    screenshots,
    selectedIds,
    selectedIdSet,
    selectedScreenshots,
    isCapturing,
    capture,
    remove,
    setSelected,
    toggleSelected,
    clearSelection,
    getSelected,
    maxItems
  }
}

export function useScreenshotStore(): ScreenshotStore {
  const store = inject<ScreenshotStore | null>(screenshotStoreKey, null)
  if (!store) {
    throw new Error('Screenshot store is not available in this component tree')
  }
  return store
}
