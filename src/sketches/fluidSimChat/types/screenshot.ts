import type { FluidDebugMode } from '../appState'

export type ScreenshotMediaType = 'image/webp' | 'image/png' | 'image/jpeg'

export interface Screenshot {
  id: string
  label: string
  createdAt: number
  debugMode: FluidDebugMode
  width: number
  height: number
  mediaType: ScreenshotMediaType
  base64: string
  sizeBytes: number
  blobUrl: string
  note?: string
}

export type ScreenshotSummary = Pick<Screenshot, 'id' | 'label' | 'debugMode' | 'mediaType' | 'blobUrl' | 'sizeBytes' | 'createdAt' | 'width' | 'height'>
