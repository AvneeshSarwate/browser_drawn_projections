import { ref } from 'vue'
import { defineStore, acceptHMRUpdate } from 'pinia'
import p5 from 'p5'
import type { AnimationSeq } from '@/rendering/planeAnimations'

export class Entity {
  public type = 'Entity'
  public id = -1 
  private static idGenerator = 0
  private createId() {
    return this.id = Entity.idGenerator++
  }
  constructor(createId = true) {
    if(createId) this.createId()
  }
  public parent: Entity | null = null

  public children(): Entity[] {
    return []
  }

  public findInDescendants<T extends Entity>(type: new () => T): T[] {
    //perform a breadth first search of the tree and return all entities of type T
    const queue: Entity[] = []  
    const found: T[] = []
    queue.push(this)
    while (queue.length > 0) {
      const current = queue.shift()
      if (current) {
        if (current instanceof type) {
          found.push(current as T)
        }
        queue.push(...current.children())
      }
    }
    return found
  }

  public findInAncestors<T extends Entity>(type: new () => T): T[] {
    //search up the parents until null returning all istances of type T
    const found: T[] = []
    let current: Entity | null = this
    while (current) {
      if (current instanceof EntityList) {
        current = current.parent
      } else {
        if (current instanceof type) {
          found.push(current as T)
        }
        current = current.parent
      }
    }
    return found
  }
}

class Command {
  public name = ''
  public undo() { }
  public redo() { }
  constructor(name: string, undo: () => void, redo: () => void) {
    this.name = name
    this.undo = undo
    this.redo = redo
  }
}

class CompoundCommand extends Command{
  public commands: Command[] = []
  constructor(name: string, commands: Command[]) {
    const groupUndo = () => {
      for (let i = commands.length - 1; i >= 0; i--) {
        commands[i].undo()
      }
    }
    const groupRedo = () => {
      for (let i = 0; i < commands.length; i++) {
        commands[i].redo()
      }
    }
    super(name, groupUndo, groupRedo)
    this.commands = commands
  }
}

class CommandHistory {
  public history: Command[] = []
  public index = -1
  public add(command: Command) {
    if(this.index == this.history.length - 1) {
      this.history.push(command)
      this.index++
    } else {
      this.history.splice(this.index + 1, this.history.length - this.index)
      this.history.push(command)
      this.index++
    }
  }
  public undo() {
    if (this.index >= 0) {
      this.history[this.index].undo()
      this.index--
    }
  }
  public redo() {
    if (this.index < this.history.length - 1) {
      this.index++
      this.history[this.index].redo()
    }
  }
}

export const commandHistory = new CommandHistory()

/**
 * todo - refactor this to be a method on CommandHistory, pass in a CommandHistory instance to each
 * command generator as an argument. Then, the end of each command function can look like
 * 
 * if (!isPartOfComplexCommand) commandHistory.executeAndAddCommand(command)
 * return command
 */

function executeAndAddCommand(command: Command, isPartOfComplexCommand: boolean): Command {
  if (!isPartOfComplexCommand) {
    command.redo()
    commandHistory.add(command)
  }
  return command
}

const grabId = (item: any) => item.id ?? 'noId-'+typeof item

function removeListCommandGenerator<T>(list: UndoableList<T>, index: number, isPartOfComplexCommand = false) {
  const item = list.list[index]

  const command: Command = {
    name: `removeListCommand ${grabId(item)}`,
    undo: () => list.list.splice(index, 0, item),
    redo: () => list.list.splice(index, 1)
  }
  
  return executeAndAddCommand(command, isPartOfComplexCommand)
}

function addListCommandGenerator<T>(list: UndoableList<T>, index: number, item: T, isPartOfComplexCommand = false) {
  const command: Command = {
    name: `addListCommand ${grabId(item)}`,
    undo: () => list.list.splice(index, 1),
    redo: () => list.list.splice(index, 0, item)
  }

  return executeAndAddCommand(command, isPartOfComplexCommand)
}

function replaceListCommandGenerator<T>(list: UndoableList<T>, index: number, newItem: T, isPartOfComplexCommand = false) {
  const oldItem = list.list[index]

  const command: Command = {
    name: `replaceListCommand ${grabId(oldItem)} ${grabId(newItem)}`,
    undo: () => { list.list[index] = oldItem },
    redo: () => { list.list[index] = newItem}
  }

  return executeAndAddCommand(command, isPartOfComplexCommand)
}

function moveListItemCommandGenerator<T>(list: UndoableList<T>, oldIndex: number, newIndex: number) {
  const item = list.list[oldIndex]
  const removeCommand = removeListCommandGenerator<T>(list, oldIndex, true)
  const addCommand = addListCommandGenerator<T>(list, newIndex, item, true)
  const moveCommand = new CompoundCommand(`moveListItemCommand ${grabId(item)} ${oldIndex} ${newIndex}`, [removeCommand, addCommand])

  return executeAndAddCommand(moveCommand, false)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function modifyEntityCommandGenerator<T>(entity: T, prop: keyof T, value: any, isPartOfComplexCommand = false) {
  const oldValue = entity[prop]
  console.log('modifying entity', grabId(entity), prop, oldValue, value)
  const command: Command = {
    name: `modifyEntityCommand ${grabId(entity)} ${String(prop)}`,
    undo: () => entity[prop] = oldValue,
    redo: () => entity[prop] = value
  }
  
  return executeAndAddCommand(command, isPartOfComplexCommand)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function modifySnapshotPropEntityCommandGenerator<T>(entity: T, snapshotProp: keyof T, liveProp: keyof T, value: any, isPartOfComplexCommand = false) {
  const oldValue = entity[snapshotProp]
  console.log('modifying entity', grabId(entity), snapshotProp, oldValue, value)
  const command: Command = {
    name: `modifyEntityCommand ${grabId(entity)} ${String(snapshotProp)}`,
    undo: () => entity[snapshotProp] = entity[liveProp] = oldValue,
    redo: () => entity[snapshotProp] = entity[liveProp] = value
  }
  
  return executeAndAddCommand(command, isPartOfComplexCommand)
}

//a collection object still needs to be wrapped in a ref
//to access it's methods for modifying the collection

export class UndoableList<T> {
  public list: T[] = []

  public pushItem(item: T) {
    addListCommandGenerator<T>(this, this.list.length, item)
  }

  public setItem(item: T, index: number) {
    replaceListCommandGenerator<T>(this, index, item)
  }

  public removeItem(index: number) {
    removeListCommandGenerator<T>(this, index)
  }

  public moveItem(oldIndex: number, newIndex: number) {
    moveListItemCommandGenerator<T>(this, oldIndex, newIndex)
  }
}

export class EntityList<T extends Entity> extends Entity implements UndoableList<T> {
  public type = 'EntityList'
  public list: T[] = []

  public children(): Entity[] {
    return this.list
  }

  constructor(createId = true) {  // Added constructor to initialize ctor
    super(createId)
  }

  public pushItem(item: T) {
    item.parent = this
    addListCommandGenerator<T>(this, this.list.length, item)
  }

  public setItem(item: T, index: number) {
    item.parent = this
    replaceListCommandGenerator<T>(this, index, item)
  }

  public removeItem(index: number) {
    //todo - should we remove the parent reference for the removed item?
    removeListCommandGenerator<T>(this, index)
  }

  public moveItem(oldIndex: number, newIndex: number) {
    moveListItemCommandGenerator<T>(this, oldIndex, newIndex)
  }
}

export class Transport {
  public playhead = 0
  public isPlaying = false
  public length = 100
  public extraField = false
  private lastUpdateTimestamp = 0
  public play() {
    this.isPlaying = true
  }
  public stop() {
    console.log('stopping transport')
    this.isPlaying = false
  }
  public setPlayhead(v: number) {
    this.playhead = v
  }

  public update(timeStamp: number) {
    if (this.isPlaying && this.playhead < this.length) {
      const delta = timeStamp - this.lastUpdateTimestamp
      this.playhead += Math.min(delta / 1000, this.length)
      this.lastUpdateTimestamp = timeStamp
      requestAnimationFrame((ts) => this.update(ts))
    } else {
      this.lastUpdateTimestamp = -1
      this.isPlaying = false
    } 
  }

  public start() {
    if(this.isPlaying) return
    this.rawStart()
  }

  public rawStart() {
    console.log('starting transport')
    this.isPlaying = true
    this.lastUpdateTimestamp = performance.now()
    requestAnimationFrame((ts) => this.update(ts))
  }
}

export type DrawMode = 'display' | 'addingPoint' | 'movingPoint'

export class Region extends Entity {
  public points = new UndoableList<p5.Vector>()
  public color: p5.Color
  public type = 'Region'
  public grabPointIdx: number | undefined = undefined
  public drawMode: DrawMode = 'display'
  public animationStartTime = -1
  public animationSeq: AnimationSeq | undefined = undefined
  public get isActive() {
    return this.drawMode != 'display'
  }
  constructor(p5Instance: p5) {
    super()
    const r = () => p5Instance.random(0, 255)
    this.color = p5Instance.color(r(), r(), r())
  }

  drawPoints(p5Instance: p5, pts: p5.Vector[]) {
    p5Instance.push()
    this.setStyle(p5Instance)
    p5Instance.beginShape()
    for (let i = 0; i < pts.length; i++) {
      p5Instance.vertex(pts[i].x, pts[i].y)
    }
    p5Instance.endShape(p5Instance.CLOSE)
    p5Instance.pop()
  }

  display(p5Instance: p5) {
    this.drawPoints(p5Instance, this.points.list)
  }

  drawWhileAddingPoint(p5Instance: p5, point: p5.Vector) {
    const pts = [...this.points.list, point]
    this.drawPoints(p5Instance, pts)
  }

  drawWhileMovingPoint(p5Instance: p5, point: p5.Vector, grabbedPointIdx: number) {
    const pts = this.points.list.map((p, idx) => idx == grabbedPointIdx ? point : p)
    this.drawPoints(p5Instance, pts)
  }

  public setStyle(p5Instance: p5) {
    p5Instance.stroke(this.color)
    p5Instance.fill(this.color)
    p5Instance.strokeWeight(15)
  }

  public draw(p5inst: p5) {
    const testComment = `info about the function`
    // if (this.draw2) this.draw2(this, p5inst)
    if(this.animationSeq) this.animationSeq.draw(p5inst, this, this.animationStartTime, p5inst.millis()/1000)
    else this.drawBase(p5inst)
  }

  public draw2: ((reg: Region, p5: p5) => void) | undefined

  public drawBase(p5Instance: p5) {
    const mousePos = p5Instance.createVector(p5Instance.mouseX, p5Instance.mouseY)
    switch (this.drawMode) {
      case 'display':
        this.display(p5Instance)
        break
      case 'movingPoint':
        if (this.grabPointIdx != undefined) {
          this.drawWhileMovingPoint(p5Instance, mousePos, this.grabPointIdx)
        }
        break
      case 'addingPoint':
        this.drawWhileAddingPoint(p5Instance, mousePos)
        break
    }
  }
}

export function findClosestPointAndRegion(p5Instance: p5, regions: EntityList<Region>): [number, Region] | undefined {
  const mousePos = p5Instance.createVector(p5Instance.mouseX, p5Instance.mouseY)
  let closestPointIdx: number | undefined = undefined
  let closestRegion: Region | undefined = undefined
  let closestDistance = Number.MAX_VALUE
  regions.list.forEach((region) => {
    region.points.list.forEach((point, idx) => {
      const distance = p5Instance.dist(mousePos.x, mousePos.y, point.x, point.y)
      if (distance < closestDistance) {
        closestDistance = distance
        closestPointIdx = idx
        closestRegion = region
      }
    })
  })
  if (closestPointIdx != undefined && closestRegion != undefined) {
    return [closestPointIdx, closestRegion]
  }
}

export type AppState = {
  regions: EntityList<Region>
  p5Instance: p5 | undefined
}

const appState: AppState = {
  regions: new EntityList<Region>(),
  p5Instance: undefined
} 

export const globalStore = defineStore('appState', () => {
  const appStateRef = ref(appState)

  //@ts-ignore
  window.appState = appState

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
}


/**
 * more things to test:
 *  o adding/removing entity lists themselves
 *  o using swappable.js to swap entities in a list 
 *    o first pass at using complex commands for handling swap operation
 *  o slider being used like a playhead
 *    o "playing" value advances it via an external transport
 *    o can click to jump to a new play position
 *    o refactor to allow state access/manipulation outside of the vue app
 *      - eg, show playhead "value" as text written to a canvas object (like video would be)
 *  o sliders not commiting their value for undo/redo until you click off of them
 *  - save/load of state from a file
 *  - zoom in on a thing (and check performance)
 *  - async rendering of image in the UI (eg, from file on disk)
 *    - set it up as drawing the image to a canvas to mimic the real thing
 *  - integrate drag-resize library, and handle linked-resizing of entities
 *    - need to design "CompoundCommandContext" idea so that you can group commands together
 *      without needing to explicitly set the "isPartOfComplexCommand" flag on commands 
 *      that get issued as the ComplexCommand is built
 * 
 * optional
 *  - moving things from one list to another (just create a batch command that does both add and remove?)
 */