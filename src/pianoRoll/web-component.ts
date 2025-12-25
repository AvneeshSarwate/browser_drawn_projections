import { defineCustomElement } from 'vue'
import PianoRollRoot from './PianoRollRoot.vue'

const tagName = 'piano-roll-component'

const PianoRollElement = defineCustomElement(PianoRollRoot)

if (!customElements.get(tagName)) {
  customElements.define(tagName, PianoRollElement)
}

export { PianoRollElement }
export type { NoteData } from './pianoRollState'
