import { Region, type AppState } from '@/stores/stores';
import * as a from '@/rendering/planeAnimations'


const aseq = (animations: a.AnimationSegment[]) => {
  return new a.AnimationSeq(animations)
}

//this function can be live coded
export const groupedAnimation0 = (state: AppState, region: Region) => {
  const lr = a.lrLine(.52)
  const rl = a.rlLine(.52)
  const zi = a.zoomIn(1.52)
  const zo = a.zoomOut(1.52)

  const dots = new a.PerimiterDots(region, 10).anim(2.52)

  region.animationSeq = aseq([zi, zo, rl, lr, dots])
}