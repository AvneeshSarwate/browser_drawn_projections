<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'

const props = defineProps({
  title: { type: String, default: 'Popout' },
  modelValue: { type: Boolean, default: false },
  width: { type: Number, default: 1280 },
  height: { type: Number, default: 720 },
  left: { type: Number, default: undefined },
  top: { type: Number, default: undefined },
  features: { type: String, default: '' },
  copyStyles: { type: Boolean, default: true },
  fullscreenTarget: { type: [String, Function] as unknown as () => string | ((root: HTMLElement) => Element), default: '' },
  fill: { type: Boolean, default: true },
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'beforePopOut'): void
  (e: 'beforePopIn'): void
  (e: 'opened', win: Window): void
  (e: 'closed'): void
}>()

const anchor = ref<HTMLElement | null>(null)
const contentRoot = ref<HTMLElement | null>(null)
const popupWin = ref<Window | null>(null)
let closePoll: number | null = null
let fullscreenChangeHandler: (() => void) | null = null

const popped = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

function buildFeatures() {
  if (props.features) return props.features
  const feats: string[] = []
  feats.push(`width=${props.width}`)
  feats.push(`height=${props.height}`)
  if (props.left != null) feats.push(`left=${props.left}`)
  if (props.top != null) feats.push(`top=${props.top}`)
  return feats.join(',')
}

function copyStylesToPopup(source: Document, target: Document) {
  try {
    // @ts-ignore
    if (source.adoptedStyleSheets?.length && 'adoptedStyleSheets' in target) {
      // @ts-ignore
      target.adoptedStyleSheets = source.adoptedStyleSheets
    }
  } catch (e) {
    // Ignore errors from adoptedStyleSheets
  }
  
  Array.from(source.querySelectorAll('link[rel="stylesheet"], style')).forEach(node => {
    const clone = node.cloneNode(true) as HTMLElement
    target.head.appendChild(clone)
  })
}

function resolveFullscreenTarget(root: HTMLElement): Element {
  if (typeof props.fullscreenTarget === 'function') {
    const el = props.fullscreenTarget(root)
    return el ?? root
  }
  if (typeof props.fullscreenTarget === 'string' && props.fullscreenTarget) {
    return root.querySelector(props.fullscreenTarget) ?? root
  }
  return root
}

function makePopupFullscreenButton(doc: Document, root: HTMLElement) {
  const btn = doc.createElement('button')
  btn.textContent = 'Fullscreen'
  Object.assign(btn.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    zIndex: '999999',
    padding: '8px 16px',
    backgroundColor: '#333',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  })
  
  const target = resolveFullscreenTarget(root)
  
  const updateVis = () => {
    const inFs = !!doc.fullscreenElement
    btn.style.display = inFs ? 'none' : 'inline-block'
  }
  
  btn.addEventListener('click', () => {
    // @ts-ignore
    target.requestFullscreen?.()
  })
  
  doc.addEventListener('fullscreenchange', updateVis)
  fullscreenChangeHandler = updateVis
  updateVis()
  doc.body.appendChild(btn)
  return btn
}

function moveToPopup(win: Window) {
  const root = contentRoot.value!
  const doc = win.document
  const adopted = doc.adoptNode(root)
  
  if (props.fill) {
    Object.assign(adopted.style, { width: '100vw', height: '100vh' })
    Object.assign(doc.documentElement.style, { height: '100%' })
    Object.assign(doc.body.style, { margin: '0', height: '100%' })
  }
  
  doc.body.appendChild(adopted)
}

function moveToMain() {
  const root = contentRoot.value
  if (root && anchor.value) {
    document.adoptNode(root)
    root.style.removeProperty('width')
    root.style.removeProperty('height')
    anchor.value.appendChild(root)
  }
}

function cleanupPopupListeners() {
  if (closePoll != null) {
    clearInterval(closePoll)
    closePoll = null
  }
  
  if (popupWin.value && fullscreenChangeHandler) {
    try {
      popupWin.value.document.removeEventListener('fullscreenchange', fullscreenChangeHandler)
      fullscreenChangeHandler = null
    } catch (e) {
      // Ignore errors from accessing closed popup
    }
  }
  
  if (popupWin.value) {
    try {
      popupWin.value.removeEventListener('beforeunload', onPopupClose)
      popupWin.value.removeEventListener('unload', onPopupClose)
    } catch (e) {
      // Ignore errors from accessing closed popup
    }
  }
}

function onPopupClose() {
  if (popped.value) {
    emit('beforePopIn')
    moveToMain()
    popped.value = false
    emit('closed')
  }
  cleanupPopup()
}

function cleanupPopup() {
  cleanupPopupListeners()
  try { 
    popupWin.value?.close() 
  } catch (e) {
    // Ignore errors from closing popup
  }
  popupWin.value = null
}

function openPopup() {
  if (popupWin.value && !popupWin.value.closed) return
  
  emit('beforePopOut')
  const win = window.open('', '_blank', buildFeatures())
  if (!win) return
  
  popupWin.value = win
  win.document.title = props.title
  win.document.body.style.background = 'black'
  
  if (props.copyStyles) {
    copyStylesToPopup(document, win.document)
  }
  
  win.document.documentElement.className = document.documentElement.className
  win.document.body.className = document.body.className
  
  moveToPopup(win)
  makePopupFullscreenButton(win.document, contentRoot.value!)
  
  win.addEventListener('beforeunload', onPopupClose)
  win.addEventListener('unload', onPopupClose)
  
  closePoll = window.setInterval(() => {
    if (!popupWin.value || popupWin.value.closed) {
      onPopupClose()
    }
  }, 1000) as unknown as number
  
  emit('opened', win)
  popped.value = true
}

function closePopup() {
  emit('beforePopIn')
  moveToMain()
  popped.value = false
  emit('closed')
  cleanupPopup()
}

function toggle() {
  if (popped.value) closePopup()
  else openPopup()
}

watch(() => props.modelValue, async (val) => {
  await nextTick()
  if (val) openPopup()
  else closePopup()
})

onMounted(() => {
  if (props.modelValue) {
    openPopup()
  }
})

onBeforeUnmount(() => {
  if (popped.value) {
    try { 
      closePopup() 
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
})

defineExpose({ openPopup, closePopup, toggle, isPopped: popped })
</script>

<template>
  <div class="popout-wrapper">
    <div class="popout-toolbar">
      <slot name="controls" :popped="popped" :popOut="openPopup" :popIn="closePopup">
        <button v-if="!popped" @click="openPopup">Pop out</button>
        <button v-else @click="closePopup">Pop in</button>
      </slot>
    </div>
    <div ref="anchor" class="popout-anchor">
      <div ref="contentRoot">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.popout-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.popout-toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.popout-anchor {
  display: block;
}
</style>
