import { Scale, bestFitScale, fitToScale, scaleFromClip } from './scale'
import { AbletonClip } from '@/io/abletonClips'

export const transformLibs = {
  Scale,
  bestFitScale,
  fitToScale,
  scaleFromClip,
  AbletonClip,
}

export type TransformLibs = typeof transformLibs
