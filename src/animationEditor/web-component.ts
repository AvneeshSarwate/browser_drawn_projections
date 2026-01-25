import { defineCustomElement } from 'vue'
import AnimationEditorView from './components/AnimationEditorView.vue'

const tagName = 'animation-editor-component'

const AnimationEditorElement = defineCustomElement(AnimationEditorView)

if (!customElements.get(tagName)) {
  customElements.define(tagName, AnimationEditorElement)
}

export { AnimationEditorElement }
export * from './types'
