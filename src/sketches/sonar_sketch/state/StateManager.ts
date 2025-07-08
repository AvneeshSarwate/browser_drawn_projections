// StateManager.ts - Centralized state management with clear layer separation

import { ref, reactive, computed, watch, type Ref } from 'vue'
import type { SonarAppState, VoiceState, SaveableProperties } from '../appState'
import type { UUIDMapping } from '../utils/transformHelpers'

// ============================================================================
// State Layer Definitions
// ============================================================================

/** UI Layer State - reactive Vue state for UI components */
export interface UIState {
  isJavascriptMode: Ref<boolean>
  selectedSnapshot: Ref<number>
  showInputEditor: Ref<boolean[]>
}

/** Editor Layer State - per-voice editor interaction state */
export interface EditorState {
  clickedDslRange: { from: number, to: number } | null
  clickedDslOriginalText: string | null
  clickedDslSegmentCount: number | null
  activeUUID: string | null
  scheduledUUIDs: string[]
  uuidMappings: UUIDMapping[]
}

/** Runtime Layer State - execution and playback state */
export interface RuntimeState {
  executableFunc: Function | null
  isAnalyzed: boolean
  lastAnalyzedCode: string
}

/** Persistence Layer State - saveable/serializable state */
export interface PersistenceState {
  snapshots: any[]
  currentBank: number
  autoSaveEnabled: boolean
}

// ============================================================================
// Centralized State Manager
// ============================================================================

export class StateManager {
  // Layer instances
  public ui: UIState
  public editors: Map<number, EditorState> = new Map()
  public runtime: Map<number, RuntimeState> = new Map()
  public persistence: PersistenceState
  
  // Core app state reference
  private appState: SonarAppState
  
  constructor(appState: SonarAppState) {
    this.appState = appState
    
    // Initialize UI state
    this.ui = {
      isJavascriptMode: ref(true),
      selectedSnapshot: ref(-1),
      showInputEditor: ref([true, true, true, true])
    }
    
    // Initialize persistence state
    this.persistence = reactive({
      snapshots: appState.snapshots,
      currentBank: appState.currentTopLevelBank,
      autoSaveEnabled: true
    })
    
    // Initialize per-voice states
    for (let i = 0; i < appState.voices.length; i++) {
      this.editors.set(i, this.createEditorState())
      this.runtime.set(i, this.createRuntimeState())
    }
    
    this.setupWatchers()
  }
  
  // ============================================================================
  // State Factory Methods
  // ============================================================================
  
  private createEditorState(): EditorState {
    return reactive({
      clickedDslRange: null,
      clickedDslOriginalText: null,
      clickedDslSegmentCount: null,
      activeUUID: null,
      scheduledUUIDs: [],
      uuidMappings: []
    })
  }
  
  private createRuntimeState(): RuntimeState {
    return reactive({
      executableFunc: null,
      isAnalyzed: false,
      lastAnalyzedCode: ''
    })
  }
  
  // ============================================================================
  // Unified Action Interface
  // ============================================================================
  
  /** Editor Actions - consistent interface for editor state changes */
  public editor = {
    setClickedDsl: (voiceIndex: number, range: {from: number, to: number} | null, originalText?: string, segmentCount?: number) => {
      const editorState = this.editors.get(voiceIndex)
      if (!editorState) return
      
      editorState.clickedDslRange = range
      editorState.clickedDslOriginalText = originalText || null
      editorState.clickedDslSegmentCount = segmentCount || null
      
      // Trigger UI updates
      this.notifyEditorChange(voiceIndex, 'clickedDsl', { range, originalText, segmentCount })
    },
    
    setActiveUUID: (voiceIndex: number, uuid: string | null) => {
      const editorState = this.editors.get(voiceIndex)
      if (!editorState) return
      
      editorState.activeUUID = uuid
      this.notifyEditorChange(voiceIndex, 'activeUUID', { uuid })
    },
    
    setScheduledUUIDs: (voiceIndex: number, uuids: string[]) => {
      const editorState = this.editors.get(voiceIndex)
      if (!editorState) return
      
      editorState.scheduledUUIDs = [...uuids]
      this.notifyEditorChange(voiceIndex, 'scheduledUUIDs', { uuids })
    },
    
    clearAll: (voiceIndex: number) => {
      const editorState = this.editors.get(voiceIndex)
      if (!editorState) return
      
      Object.assign(editorState, this.createEditorState())
      this.notifyEditorChange(voiceIndex, 'clearAll', {})
    }
  }
  
  /** Runtime Actions - code analysis and execution state */
  public runtime = {
    setExecutableFunc: (voiceIndex: number, func: Function | null, analyzedCode: string) => {
      const runtimeState = this.runtime.get(voiceIndex)
      if (!runtimeState) return
      
      runtimeState.executableFunc = func
      runtimeState.isAnalyzed = func !== null
      runtimeState.lastAnalyzedCode = analyzedCode
    },
    
    invalidate: (voiceIndex: number) => {
      const runtimeState = this.runtime.get(voiceIndex)
      if (!runtimeState) return
      
      runtimeState.executableFunc = null
      runtimeState.isAnalyzed = false
      runtimeState.lastAnalyzedCode = ''
    }
  }
  
  /** UI Actions - interface state management */
  public ui_actions = {
    switchToInputMode: (voiceIndex: number) => {
      this.ui.showInputEditor.value[voiceIndex] = true
      this.editor.clearAll(voiceIndex)
    },
    
    switchToVisualizeMode: (voiceIndex: number) => {
      this.ui.showInputEditor.value[voiceIndex] = false
      // Trigger analysis and visualization setup
      this.notifyModeChange(voiceIndex, 'visualize')
    },
    
    setMode: (mode: 'javascript' | 'text') => {
      this.ui.isJavascriptMode.value = mode === 'javascript'
    }
  }
  
  // ============================================================================
  // State Queries - Computed getters for component consumption
  // ============================================================================
  
  public queries = {
    // Editor state queries
    getClickedDsl: (voiceIndex: number) => computed(() => {
      const editorState = this.editors.get(voiceIndex)
      return editorState ? {
        range: editorState.clickedDslRange,
        originalText: editorState.clickedDslOriginalText,
        segmentCount: editorState.clickedDslSegmentCount
      } : null
    }),
    
    getActiveUUID: (voiceIndex: number) => computed(() => {
      return this.editors.get(voiceIndex)?.activeUUID || null
    }),
    
    // Runtime state queries
    isVoiceAnalyzed: (voiceIndex: number) => computed(() => {
      return this.runtime.get(voiceIndex)?.isAnalyzed || false
    }),
    
    // Cross-layer queries
    shouldShowPianoRoll: (voiceIndex: number) => computed(() => {
      const editorState = this.editors.get(voiceIndex)
      return !this.ui.showInputEditor.value[voiceIndex] && 
             editorState?.clickedDslRange !== null
    })
  }
  
  // ============================================================================
  // Event System - Notify external systems of state changes
  // ============================================================================
  
  private editorChangeListeners: ((voiceIndex: number, changeType: string, data: any) => void)[] = []
  private modeChangeListeners: ((voiceIndex: number, mode: string) => void)[] = []
  
  public onEditorChange(listener: (voiceIndex: number, changeType: string, data: any) => void) {
    this.editorChangeListeners.push(listener)
  }
  
  public onModeChange(listener: (voiceIndex: number, mode: string) => void) {
    this.modeChangeListeners.push(listener)
  }
  
  private notifyEditorChange(voiceIndex: number, changeType: string, data: any) {
    this.editorChangeListeners.forEach(listener => listener(voiceIndex, changeType, data))
  }
  
  private notifyModeChange(voiceIndex: number, mode: string) {
    this.modeChangeListeners.forEach(listener => listener(voiceIndex, mode))
  }
  
  // ============================================================================
  // Reactive Watchers - Auto-sync between layers
  // ============================================================================
  
  private setupWatchers() {
    // Watch slider changes and update all affected layers
    watch(
      () => this.appState.sliders,
      (newSliders) => {
        // Notify all voices that sliders changed
        for (let i = 0; i < this.appState.voices.length; i++) {
          this.notifyEditorChange(i, 'slidersChanged', { sliders: newSliders })
        }
      },
      { deep: true }
    )
    
    // Watch toggle changes and update runtime analysis
    watch(
      () => this.appState.toggles,
      (newToggles) => {
        for (let i = 0; i < this.appState.voices.length; i++) {
          const runtimeState = this.runtime.get(i)
          if (runtimeState?.isAnalyzed) {
            // Re-analyze when toggles change
            this.notifyEditorChange(i, 'togglesChanged', { toggles: newToggles })
          }
        }
      },
      { deep: true }
    )
  }
  
  // ============================================================================
  // Serialization - Convert state to/from JSON
  // ============================================================================
  
  public serialize() {
    return {
      persistence: this.persistence,
      ui: {
        isJavascriptMode: this.ui.isJavascriptMode.value,
        selectedSnapshot: this.ui.selectedSnapshot.value,
        showInputEditor: [...this.ui.showInputEditor.value]
      },
      // Note: editor and runtime state are ephemeral and not serialized
    }
  }
  
  public deserialize(data: any) {
    if (data.persistence) {
      Object.assign(this.persistence, data.persistence)
    }
    if (data.ui) {
      this.ui.isJavascriptMode.value = data.ui.isJavascriptMode
      this.ui.selectedSnapshot.value = data.ui.selectedSnapshot
      this.ui.showInputEditor.value = [...data.ui.showInputEditor]
    }
  }
}

// ============================================================================
// Integration with existing systems
// ============================================================================

/** Hook to create and provide state manager to Vue components */
export const useStateManager = (appState: SonarAppState) => {
  const stateManager = new StateManager(appState)
  
  // Set up integration with existing editor systems
  stateManager.onEditorChange((voiceIndex, changeType, data) => {
    switch (changeType) {
      case 'clickedDsl':
        // Update CodeMirror decorations
        // highlightClickedDsl(voiceIndex, data.range)
        break
      case 'activeUUID':
        // Update current line highlighting
        // highlightCurrentLineByUUID(voiceIndex, data.uuid, ...)
        break
      case 'slidersChanged':
        // Update CodeMirror content with resolved slider values
        // updateVoiceOnSliderChange(voiceIndex)
        break
    }
  })
  
  return stateManager
}
