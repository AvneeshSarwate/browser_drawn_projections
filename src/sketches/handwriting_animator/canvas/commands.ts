import type { CanvasRuntimeState } from "./canvasState"
import { getGlobalCanvasState as getCurrentCanvasState } from "./canvasState"

// State-based command functions
export const executeCommandWithState = (state: CanvasRuntimeState, name: string, action: () => void) => {
  if (!state.command.executeCommand) {
    console.warn('executeCommand called before setup - falling back to direct execution')
    action()
    return
  }
  state.command.executeCommand(name, action)
}

export const pushCommandWithStatesAndState = (state: CanvasRuntimeState, name: string, beforeState: string, afterState: string) => {
  if (!state.command.pushCommand) {
    console.warn('pushCommandWithStates called before setup - ignoring')
    return
  }
  state.command.pushCommand(name, beforeState, afterState)
}

// Setup functions for CanvasRoot.vue to call
export const setCommandExecutor = (state: CanvasRuntimeState, fn: (name: string, action: () => void) => void) => {
  state.command.executeCommand = fn
}

export const setCommandPusher = (state: CanvasRuntimeState, fn: (name: string, beforeState: string, afterState: string) => void) => {
  state.command.pushCommand = fn
}

// TEMPORARY FALLBACK WRAPPERS - REMOVE IN PHASE 7
let globalExecuteCommand: ((name: string, action: () => void) => void) | undefined
let globalPushCommand: ((name: string, beforeState: string, afterState: string) => void) | undefined

export const setGlobalExecuteCommand = (fn: (name: string, action: () => void) => void) => {
  globalExecuteCommand = fn
}

export const setGlobalPushCommand = (fn: (name: string, beforeState: string, afterState: string) => void) => {
  globalPushCommand = fn
}

export const executeCommand = (name: string, action: () => void) => {
  if (globalExecuteCommand) {
    globalExecuteCommand(name, action)
  } else {
    // Fall back to state-based approach
    executeCommandWithState(getCurrentCanvasState(), name, action)
  }
}

export const pushCommandWithStates = (name: string, beforeState: string, afterState: string) => {
  if (globalPushCommand) {
    globalPushCommand(name, beforeState, afterState)
  } else {
    // Fall back to state-based approach
    pushCommandWithStatesAndState(getCurrentCanvasState(), name, beforeState, afterState)
  }
}
