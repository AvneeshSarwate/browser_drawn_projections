// Simple global command function that will be set by LivecodeHolder
let globalExecuteCommand: ((name: string, action: () => void) => void) | undefined

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