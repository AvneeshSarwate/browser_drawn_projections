import { defineCustomElement } from 'vue'
import CanvasRoot from './CanvasRoot.vue'

const tagName = 'handwriting-canvas'

const CanvasElement = defineCustomElement(CanvasRoot)

if (!customElements.get(tagName)) {
  customElements.define(tagName, CanvasElement)
}

export { CanvasElement }
export default CanvasElement
export type { CanvasStateSnapshot } from './canvasState'
