// snapshotManager.ts – handling snapshot / slider-bank persistence & validation

import type { SonarAppState, SaveableProperties } from '../appState'

// --- generic helpers -------------------------------------------------------
export const deepClone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj))
const serialize  = (data: any) => JSON.stringify(data, null, 2)

// ---------------------------------------------------------------------------
//  Validation helpers (shared by all load paths)
// ---------------------------------------------------------------------------
export function validateSnapshots(snapshots: any): void {
  if (!Array.isArray(snapshots)) throw new Error('Invalid snapshots: expected array')
  for (const snap of snapshots) {
    if (!Array.isArray(snap.sliders)) throw new Error('Invalid snapshot: missing sliders')
    if (!Array.isArray(snap.voices))  throw new Error('Invalid snapshot: missing voices')
  }
}

// ---------------------------------------------------------------------------
//  Save / load to JSON file --------------------------------------------------
// ---------------------------------------------------------------------------
export function downloadSnapshotsFile(snaps: any[]) {
  const blob = new Blob([serialize(snaps)], { type: 'application/json' })
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `sonar_snapshots_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`
  })
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

export function loadSnapshotsFromFile(onLoaded:(snaps:any[])=>void) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json'
  input.onchange = (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const snaps = JSON.parse(reader.result as string)
        validateSnapshots(snaps)
        onLoaded(snaps)
      } catch (e:any) {
        alert(`Error loading snapshots: ${e.message}`)
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

// ---------------------------------------------------------------------------
//  Local-storage persistence --------------------------------------------------
// ---------------------------------------------------------------------------
const LOCAL_SNAP_KEY  = 'sonar_snapshots'
const LOCAL_STATE_KEY = 'sonar_current_state'

export function saveToLocalStorage(app: SonarAppState) {
  try {
    localStorage.setItem(LOCAL_SNAP_KEY, serialize(app.snapshots))
    localStorage.setItem(LOCAL_STATE_KEY, serialize(buildCurrentLiveState(app)))
  } catch (e) { console.error('localStorage save error', e) }
}

export function loadFromLocalStorage(app: SonarAppState) {
  try {
    const snapStr = localStorage.getItem(LOCAL_SNAP_KEY)
    if (snapStr) { const snaps = JSON.parse(snapStr); validateSnapshots(snaps); app.snapshots = snaps }

    const stateStr = localStorage.getItem(LOCAL_STATE_KEY)
    if (stateStr) {
      const state = JSON.parse(stateStr)
      if (Array.isArray(state.sliders)) app.sliders = [...state.sliders]
      if (Array.isArray(state.toggles)) app.toggles = [...state.toggles]
      if (Array.isArray(state.oneShots)) app.oneShots = [...state.oneShots]
      if (Array.isArray(state.voices)) state.voices.forEach((sv:SaveableProperties,i:number)=>{
        if (i<app.voices.length) {
          // Backfill jsCodeBanks if it doesn't exist (for backward compatibility)
          if (!sv.jsCodeBanks) {
            sv.jsCodeBanks = Array.from({ length: 8 }, () => '')
          }
          app.voices[i].saveable = sv
        }
      })
      if (state.sliderBanks?.topLevel) app.sliderBanks.topLevel = state.sliderBanks.topLevel.map((b:number[])=>[...b])
      if (state.toggleBanks?.topLevel) app.toggleBanks.topLevel = state.toggleBanks.topLevel.map((b: boolean[]) => [...b])
      if (state.oneShotBanks?.topLevel) app.oneShotBanks.topLevel = state.oneShotBanks.topLevel.map((b: boolean[]) => [...b])
      if (typeof state.currentTopLevelBank==='number') app.currentTopLevelBank = state.currentTopLevelBank
    }
  } catch (e) { console.error('localStorage load error', e) }
}

// ---------------------------------------------------------------------------
//  Snapshot helpers (operate directly on app state) --------------------------
// ---------------------------------------------------------------------------
export function saveSnapshot(app: SonarAppState) {
  app.snapshots.push(buildCurrentLiveState(app))
}

export function loadSnapshotStateOnly(app: SonarAppState, index:number, updateFxParams:(voiceIdx:number)=>void) {
  if (index<0 || index>=app.snapshots.length) return
  const snap = app.snapshots[index]
  app.sliders = [...snap.sliders]
  if (snap.toggles) app.toggles = [...snap.toggles]
  if (snap.oneShots) app.oneShots = [...snap.oneShots]
  app.voices.forEach((v,i)=>{ 
    const saveableData = deepClone(snap.voices[i])
    // Backfill jsCodeBanks if it doesn't exist (for backward compatibility)
    if (!saveableData.jsCodeBanks) {
      saveableData.jsCodeBanks = Array.from({ length: 8 }, () => '')
    }
    v.saveable = saveableData
  })
  if (snap.sliderBanks) {
    app.sliderBanks = { topLevel: snap.sliderBanks.topLevel.map((b:number[])=>[...b]) }
  }
  if (snap.toggleBanks) {
    app.toggleBanks = { topLevel: snap.toggleBanks.topLevel.map((b:boolean[])=>[...b]) }
  }
  if (snap.oneShotBanks) {
    app.oneShotBanks = { topLevel: snap.oneShotBanks.topLevel.map((b:boolean[])=>[...b]) }
  }
  app.voices.forEach((_,i)=>updateFxParams(i))
}

function buildCurrentLiveState(app: SonarAppState) {
  return {
    sliders: [...app.sliders],
    toggles: [...app.toggles],
    oneShots: [...app.oneShots],
    voices : app.voices.map(v=> deepClone(v.saveable) as SaveableProperties),
    sliderBanks: { topLevel: app.sliderBanks.topLevel.map(b => [...b]) },
    toggleBanks: { topLevel: app.toggleBanks.topLevel.map(b => [...b]) },
    oneShotBanks: { topLevel: app.oneShotBanks.topLevel.map(b => [...b]) },
    currentTopLevelBank: app.currentTopLevelBank
  }
}

// ---------------------------------------------------------------------------
//  Generic bank helpers (used by FX & slider banks)
// ---------------------------------------------------------------------------
export function saveBank<T>(bankArr: T[], bankIdx: number, data: T): void {
  if (bankIdx < 0 || bankIdx >= bankArr.length) return
  bankArr[bankIdx] = deepClone(data)
}

export function loadBank<T>(bankArr: T[], bankIdx: number): T | undefined {
  if (bankIdx < 0 || bankIdx >= bankArr.length) return
  return deepClone(bankArr[bankIdx])
}

export function makeBankClickHandler(
  saveFn: (idx:number)=>void,
  loadFn: (idx:number)=>void,
  selectFn?: (idx:number)=>void
) {
  return (idx:number, ev: MouseEvent) => {
    if (ev.shiftKey) {
      saveFn(idx)
      selectFn?.(idx)
    } else {
      loadFn(idx)
    }
  }
}

// ---------------------------------------------------------------------------
//  Slider-bank save / load helpers (top-level & per-voice FX)  ---------------
// ---------------------------------------------------------------------------
export function saveTopLevelSliderBank(app: SonarAppState, bankIndex:number) {
  saveBank(app.sliderBanks.topLevel, bankIndex, [...app.sliders])
}

export function loadTopLevelSliderBank(app: SonarAppState, bankIndex:number) {
  const bank = loadBank(app.sliderBanks.topLevel, bankIndex)
  if (!bank) return
  bank.forEach((s, i) => {
    if (i < app.sliders.length) app.sliders[i] = s
  })
  app.currentTopLevelBank = bankIndex
}

export function saveFxSliderBank(app: SonarAppState, voiceIndex:number, bankIndex:number) {
  if (voiceIndex<0 || voiceIndex>=app.voices.length) return
  const voice = app.voices[voiceIndex]
  saveBank(voice.saveable.fxBanks, bankIndex, voice.saveable.fxParams)
}

export function loadFxSliderBank(app: SonarAppState, voiceIndex:number, bankIndex:number, updateFxParams:(voiceIdx:number)=>void) {
  if (voiceIndex<0 || voiceIndex>=app.voices.length) return
  const voice = app.voices[voiceIndex]
  const params = loadBank(voice.saveable.fxBanks, bankIndex)
  if (!params) return
  voice.saveable.fxParams = params
  voice.currentFxBank = bankIndex
  updateFxParams(voiceIndex)
} 

// ---------------------------------------------------------------------------
//  JS Code bank save / load helpers  ----------------------------------------
// ---------------------------------------------------------------------------
export function saveJsCodeBank(app: SonarAppState, voiceIndex:number, bankIndex:number) {
  if (voiceIndex<0 || voiceIndex>=app.voices.length) return
  const voice = app.voices[voiceIndex]
  saveBank(voice.saveable.jsCodeBanks, bankIndex, voice.saveable.jsCode)
}

export function loadJsCodeBank(app: SonarAppState, voiceIndex:number, bankIndex:number) {
  if (voiceIndex<0 || voiceIndex>=app.voices.length) return
  const voice = app.voices[voiceIndex]
  const code = loadBank(voice.saveable.jsCodeBanks, bankIndex)
  if (code === undefined) return
  
  voice.currentJsBank = bankIndex
  return code
}

// ---------------------------------------------------------------------------
//  Toggle-bank save / load helpers (top-level)  -----------------------------
// ---------------------------------------------------------------------------
export function saveTopLevelToggleBank(app: SonarAppState, bankIndex:number) {
  saveBank(app.toggleBanks.topLevel, bankIndex, [...app.toggles])
}

export function loadTopLevelToggleBank(app: SonarAppState, bankIndex:number) {
  const bank = loadBank(app.toggleBanks.topLevel, bankIndex)
  if (!bank) return
  bank.forEach((t, i) => {
    if (i < app.toggles.length) app.toggles[i] = t
  })
  app.currentTopLevelBank = bankIndex
}

// ---------------------------------------------------------------------------
//  One-shot-bank save / load helpers (top-level)  -----------------------------
// ---------------------------------------------------------------------------
export function saveTopLevelOneShotBank(app: SonarAppState, bankIndex:number) {
  saveBank(app.oneShotBanks.topLevel, bankIndex, [...app.oneShots])
}

export function loadTopLevelOneShotBank(app: SonarAppState, bankIndex:number) {
  const bank = loadBank(app.oneShotBanks.topLevel, bankIndex)
  if (!bank) return
  bank.forEach((o, i) => {
    if (i < app.oneShots.length) app.oneShots[i] = o
  })
  app.currentTopLevelBank = bankIndex
}