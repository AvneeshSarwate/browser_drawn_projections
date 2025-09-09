// Simple global command function that will be set by LivecodeHolder
let globalExecuteCommand: ((name: string, action: () => void) => void) | undefined
let globalPushCommand: ((name: string, beforeState: string, afterState: string) => void) | undefined

export const setGlobalExecuteCommand = (fn: (name: string, action: () => void) => void) => {
  globalExecuteCommand = fn
}

export const executeCommand = (name: string, action: () => void) => {
  if (!globalExecuteCommand) {
    console.warn('executeCommand called before setup - falling back to direct execution')
    action()
    return
  }
  globalExecuteCommand(name, action)
}

//todo - would be nice to not have to have this module-global var type pattern and integrate the CommandStack into the app state,
// but then it gets a bit tricky as to how to provide that state to individual tool modules

// Direct push for commands when before/after are already captured (e.g., transformer moves)
export const setGlobalPushCommand = (fn: (name: string, beforeState: string, afterState: string) => void) => {
  globalPushCommand = fn
}

export const pushCommandWithStates = (name: string, beforeState: string, afterState: string) => {
  if (!globalPushCommand) {
    console.warn('pushCommandWithStates called before setup - ignoring')
    return
  }
  globalPushCommand(name, beforeState, afterState)
}
