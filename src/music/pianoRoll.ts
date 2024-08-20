import { Circle, Element, G, Line, Rect, SVG, Svg, Text } from '@svgdotjs/svg.js'

/*
basic strategy for using SVG:
In SVG you can draw on an arbitrarily large plane and have a 'viewbox' that shows a sub-area of that.
Because of this, for a piano roll, you can 'draw' a piano-roll at an arbitrary size and move around
the viewbox rather than 'redrawing' the piano roll when you want to zoom/move. What's TBD is to see
how annoying it might be to program selecting/dragging/highlighting/resizing with this approach. 
In general, aiming for Ableton piano-roll feature parity wrt mouse interaction (assuming keyboard 
shortcuts are trivial to implement if you can get the mouse stuff right)

order of library features to test (for each, make sure they're sensible under viewbox zoom too):
NOTE - this is only a test of INTERACTIONS - the look is ugly and the code is organized for quick hacking.
How note-state <-> note-svg-elements is handled is still TBD. 

- X - dragging behavior 
- X - dragging and snap to grid
  - NOTE - clicking on a note is interpeted as a 'drag' and will automatically quantize it (see bugs below)
- X - multiselection + dragging via mouse
- X - multiselection + dragging + snap to grid
- X - multiselection and ableton style note length resizing
- X - multiselected resizing + snap to grid
  - done, but design choices necessary 
- X figure out good UI for viewbox resizing/position control and scroll (panzoom plugin if necessary?)
  - done, but more polished design choices necessary 
  - could implement 2 finger scroll - https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Multi-touch_interaction
- X implement double-click to add note interaction (should be straightforwards, svg-wise)
- X implement delete
- X implement undo/redo
- get to ableton parity with regards to 
  - X selected notes and then moving/resizing a non-sected note 
  - POSTPONED - handle drag quantization to be ableton like
    - handle drag quantizing so that clicked note snaps to grid when moved large distances
  - need to handle out-of-bounds dragging
  - handling overlaps on resizing, drag and doubleclick-to-add-note
    - resizing quantization should be triggered once the end nears a note-section border. currently it quantizes
      once the deviation distance is near the quanization length
    - in general - if selected/new notes intersect with start start of 'other' note, the 'other' note is deleted,
      and if they intersect with the end of 'other' notes, the 'other' notes are truncated.
      - The exception is if a selected note is resized into another selected note, in which case the resizing is 
      truncated at the start of the next selected note
- X implement showing note names on notes
- implement cursor and cut/copy/paste
- implement moving highlighted notes by arrow click 
- figure out floating note names on side and time-values on top 
- figure out cursor animation and viewbox movement for a playing piano roll
- decide how to do ableton 'draw mode' style interaction (shouldn't require any new funky 
 SVG behavior, but will likely be tricky wrt UI-state management)


 comment tags
 cleanup - stuff that works but needs cleaning
 inProgress - stuff that's not totally built yet
 future - guide notes for longer term extensible implementation ideas
 postponed - features that are wanted but can be done later

*/


/*
General organization - 
Look at attachHandlersOnBackground to see how notes are drawn/created.
Look at attachHandlersOnNote to see how notes can be moved and modified. 

Basic strategy for implementing multi-note modifications - 
- Define the 'target' element (the one the mouse gestures are happening on) and
  the other 'selected' elements. 
- Calulate the mouse motion/deviation from the mousedown point on the target element
- Use this mouse deviation info to control movement/resizing of all selected elements
*/



/**
 basic layout strategy for envelope editor over piano roll 
 - separate svg document over piano roll, envelope editor has translucent background to show notes
 - width is same as piano roll, height is constant
 - x dimension of viewbox + scroll gets bounced back and forth between the two
 - piano roll object contains the envelope editor object
 - tab box for envelope selection is fixed with in the svg, and gets shifted along with scroll
   - it's height is subtracted from element height to give range for [0-1] y values
 */

type EnvelopePoint = {t: number, y: number, id: number, selected: boolean}

export class EnvelopeEditor {
  numEnvelopes: number = 8
  envelopes: EnvelopePoint[][] = Array.from({length: this.numEnvelopes}, () => [])
  idToPointMap: Map<number, EnvelopePoint> = new Map()
  idToCircleMap: Map<number, Circle> = new Map()
  pointIdToLinesMap: Map<number, {to?: Line, from?: Line}> = new Map()
  selectedEnvelopeIndex: number = 0
  svgRoot: Svg
  containerElementId: string
  viewportWidth: number
  viewportHeight: number
  tabBoxHeight: number = 20
  tabBoxWidth: number = 40
  tabBoxGroup!: G 

  envelopeBackground!: Rect 
  envelopeGroup!: G 

  //todo - link these to piano roll
  quarterNoteWidth: number = 120
  numMeasures: number = 100
  envelopePointIdGenerator: number = 0

  mouseDownPoint: {x: number, y: number} = {x: 0, y: 0}
  mouseScrollActive = false;
  mouseZoomActive = false;
  mouseMoveRootNeedsReset = true;
  mouseMoveRoot = {mouseX: 0, mouseY: 0, svgX: 0, svgY: 0, vbX: 0, vbY: 0, vbWidth: 0, vbHeight: 0, zoom: 0};
  maxZoom: number = 0;
  ptRadius: number = 8
  tabBackgrounds: Rect[] = []
  containerElement: HTMLElement
  scrollPos = 0
  scrollCallback = (x: number) => {}


  constructor(containerElementId: string, viewportWidth: number, viewportHeight: number) {
    this.containerElementId = containerElementId
    this.viewportWidth = viewportWidth
    this.viewportHeight = viewportHeight
    this.svgRoot = SVG().addTo("#"+this.containerElementId).attr('id', 'envelopeEditorSVG').size(this.viewportWidth, this.viewportHeight);
    this.containerElement = document.getElementById(this.containerElementId)!!
    this.refPt = this.svgRoot.node.createSVGPoint();
    this.maxZoom = 20/180 //taken from piano roll constants

    this.createBackground()
    this.svgRoot.attr('preserveAspectRatio', 'none')
    this.svgRoot.viewbox(0, 0, this.viewportWidth, this.viewportHeight)
  }

  mouseXY!: DOMPoint

  backgroundMouseMoveHandler(evt: Event) {
    this.mouseXY = this.svgMouseCoord(evt as MouseEvent);
    //todo - make sure this translates properly into xy coord for enevelope group area
  }

  temporaryMouseMoveHandler: (evt: Event) => void = () => {}

  backgroundKeyDownHandler(evt: Event) {
    const kEvt = evt as KeyboardEvent
    console.log("envelope key", evt)
    if(kEvt.key == "d") {
      const t = this.pxToT(this.mouseXY.x)
      const y = this.pxToY(this.mouseXY.y)
      this.createEnvelopePoint(this.selectedEnvelopeIndex, t, y, false)
    }
    if (kEvt.ctrlKey && !kEvt.altKey){
      this.mouseMoveRootNeedsReset = true;
      this.mouseScrollActive = true;
      this.temporaryMouseMoveHandler = ev => this.mouseScrollHandler(ev as MouseEvent);
      this.containerElement!!.addEventListener('mousemove', this.temporaryMouseMoveHandler);
    }
    if (kEvt.altKey && !kEvt.ctrlKey){
      this.mouseMoveRootNeedsReset = true;
      this.mouseZoomActive = true;
      this.temporaryMouseMoveHandler = ev => this.mouseZoomHandler(ev as MouseEvent);
      this.containerElement!!.addEventListener('mousemove', this.temporaryMouseMoveHandler);
    }
  }

  backgroundKeyUpHanlder(evt: Event) {
    const kEvt = evt as KeyboardEvent
    if (!kEvt.ctrlKey && this.mouseScrollActive) {
      console.log('disengaging scroll')
      this.mouseScrollActive = false;
      this.containerElement!!.removeEventListener('mousemove', this.temporaryMouseMoveHandler!!);
      this.temporaryMouseMoveHandler = () => {}
    }
    if (!kEvt.altKey && this.mouseZoomActive) {
      this.mouseZoomActive = false;
      this.containerElement!!.removeEventListener('mousemove', this.temporaryMouseMoveHandler!!);
      this.temporaryMouseMoveHandler = () => {}
    }
  }

  createBackground() {

    //create enevelope box that fills the rest of the svg
    this.envelopeBackground = this.svgRoot.rect(this.quarterNoteWidth * this.numMeasures * 4, this.viewportHeight - this.tabBoxHeight).id('envelopeBackground').fill('#777').opacity(0.5)
    this.envelopeBackground.on('mousemove', (e) => this.backgroundMouseMoveHandler(e))
    this.containerElement.addEventListener('keydown', (e) => this.backgroundKeyDownHandler(e))
    this.containerElement.addEventListener('keyup', (e) => this.backgroundKeyUpHanlder(e))
    this.containerElement.onmouseenter = () => {
      this.containerElement.focus()
      console.log("mouse entered")
    }
    this.envelopeGroup = this.svgRoot.group().add(this.envelopeBackground)

    //create tab box 
    this.tabBoxGroup = this.svgRoot.group()

    this.tabBoxGroup.on('mousedown', (event) => {
      console.log("clicked tab box", event)
    })

    for(let i = 0; i < this.numEnvelopes; i++) {
      //create a tab group, which has a background rect and a text label
      const tabGroup = this.tabBoxGroup.group().translate(i * this.tabBoxWidth, 0)
      const tabBackground = tabGroup.rect(this.tabBoxWidth, this.tabBoxHeight).fill('#5f5')
      if(i === 0) {
        tabBackground.stroke({width: 2, color: '#f00'})
      }
      this.tabBackgrounds.push(tabBackground)
      const tabLabel = tabGroup.text("env " + i.toString()).font({size: 10, weight: 'bold'}).move(0, this.tabBoxHeight/2)

      tabGroup.on('click', () => {
        console.log("clicked tab group", i)
        this.tabBackgrounds.forEach((tabBackground, index) => {
          if(index === i) {
            tabBackground.stroke({width: 2, color: '#f00'})
          } else {
            tabBackground.stroke({width: 0, color: '#f00'})
          }
        })
        this.selectedEnvelopeIndex = i
        this.renderEnvelope(i)
      })
    }    

    //add handler for scroll 

    //add hadler for add point
    this.envelopeGroup.on('dblclick', (event) => {
      const mouseXY = this.svgMouseCoord(event as MouseEvent);
      console.log("env create point")
      this.createEnvelopePoint(this.selectedEnvelopeIndex, this.pxToT(mouseXY.x), this.pxToY(mouseXY.y), false)
    })
  }

  createEnvelopePoint(envelopeId: number, t: number, y: number, selected: boolean) {
    //add to data collection 

    const id = this.envelopePointIdGenerator++

    const point = {t, y, id, selected}

    this.envelopes[envelopeId].push(point)
    this.envelopes[envelopeId].sort((a, b) => a.t - b.t)

    //re-render envelope
    this.renderEnvelope(envelopeId)
  }


  tToPx(t: number) {
    return t * this.quarterNoteWidth
  }

  pxToT(px: number) {
    return px / this.quarterNoteWidth
  }

  yToPx(y: number) {
    return (1 - y) * (this.viewportHeight - this.tabBoxHeight) + this.tabBoxHeight
  }

  pxToY(px: number) {
    return 1 - (px - this.tabBoxHeight) / (this.viewportHeight - this.tabBoxHeight)
  }

  tyToPx(t: number, y: number) {
    return {x: this.tToPx(t), y: this.yToPx(y)}
  }

  tyToCirclePx(t: number, y: number) {
    const px = this.tyToPx(t, y)
    return {x: px.x - this.ptRadius/2, y: px.y - this.ptRadius/2}
  }

  attachHandlersToPoint(envelopeIndex: number, point: EnvelopePoint, circle: Circle) {
    circle.on('click', () => {
      point.selected = !point.selected
      //add red border
      circle.stroke({width: point.selected ? 2 : 0, color: '#f00'})
    })

    //delete on double click
    circle.on('dblclick', (e) => {
      console.log("delete point", point)
      this.envelopes[envelopeIndex] = this.envelopes[envelopeIndex].filter(p => p.id !== point.id)
      this.renderEnvelope(envelopeIndex)
      e.stopImmediatePropagation()
    })

    circle.on('mousedown', (event) => {
      const mouseXY = this.svgMouseCoord(event as MouseEvent);
      this.startDraggingPoint(envelopeIndex, point)
    })

    //todo, add drag handler - moves point and changes its lines

  }



  startDraggingPoint(envelopeIndex: number, point: EnvelopePoint) {
    //add red border
    point.selected = true
    const circle = this.idToCircleMap.get(point.id)!
    circle.stroke({color: '#f00'})

    const pointIndex = this.envelopes[envelopeIndex].indexOf(point)
    const prevPoint: EnvelopePoint | undefined = this.envelopes[envelopeIndex][pointIndex - 1]
    const nextPoint: EnvelopePoint | undefined = this.envelopes[envelopeIndex][pointIndex + 1]
    console.log("prevIndex", pointIndex - 1, "nextIndex", pointIndex + 1)

    const clampT = (t: number) => {
      if(prevPoint) t = Math.max(t, prevPoint.t)
      else t = Math.max(t, 0)
    
      if(nextPoint) t = Math.min(t, nextPoint.t)
      return t
    }

    this.envelopeGroup.on('mousemove', (event) => {
      const mouseXY = this.svgMouseCoord(event as MouseEvent);
      const rawTVal = this.pxToT(mouseXY.x)
      const clampedTVal = clampT(rawTVal)
      point.t = clampedTVal
      point.y = this.pxToY(mouseXY.y)
      const circPX = this.tyToCirclePx(clampedTVal, point.y)
      circle.move(circPX.x, circPX.y)
      const mousePX = this.tyToPx(clampedTVal, point.y)

      //move lines as well 
      const lineToPoint = this.pointIdToLinesMap.get(point.id)?.to
      const lineFromPoint = this.pointIdToLinesMap.get(point.id)?.from
      if(lineToPoint) {
        const prevXY = prevPoint ? this.tyToPx(prevPoint.t, prevPoint.y) : {x: 0, y: mousePX.y}
        lineToPoint.plot(prevXY.x, prevXY.y, mousePX.x, mousePX.y)
      }
      if(lineFromPoint) {
        const nextXY = nextPoint ? this.tyToPx(nextPoint.t, nextPoint.y) : {x: this.viewportWidth, y: mousePX.y}
        lineFromPoint.plot(mousePX.x, mousePX.y, nextXY.x, nextXY.y)
      }
    })

    const mouseUpHandler = () => {
      this.envelopeGroup.off('mousemove')
      circle.stroke({color: '#fff'})
    }

    this.svgRoot.on('mouseup', mouseUpHandler)

    circle.on('mouseup', mouseUpHandler)
    
  }

  renderEnvelope(envelopeIndex: number) {
    
    //todo - consolidate line so that only 2 pts are at a single t value 
    //(might need to add move-time metadata to point to help determine which ones to keep)

    //clear envelope group
    this.envelopeGroup.children().forEach(child => {
      if(child.id() !== 'envelopeBackground') {
        child.remove()
      }
    })
    this.idToCircleMap.clear()
    this.pointIdToLinesMap.clear()

    //draw points
    //attach handlers for delete/move (delete just re-renders envelope)
    this.envelopes[envelopeIndex].forEach(point => {
      const px = this.tyToCirclePx(point.t, point.y)
      const circle = this.envelopeGroup.circle(this.ptRadius).fill('#fff').move(px.x, px.y)

      this.idToCircleMap.set(point.id, circle)

      this.attachHandlersToPoint(envelopeIndex, point, circle)
    })

    //draw line before first point
    if(this.envelopes[envelopeIndex].length > 0 && this.envelopes[envelopeIndex][0].t > 0) {
      const p1 = this.envelopes[envelopeIndex][0]
      const x1 = this.tToPx(p1.t)
      const y1 = this.yToPx(p1.y)
      const line = this.envelopeGroup.line(0, y1, x1, y1).stroke({width: 1, color: '#fff'})
      this.pointIdToLinesMap.set(p1.id, {to: line})
    }

    //draw lines between points
    for(let i = 0; i < this.envelopes[envelopeIndex].length - 1; i++) {
      const p1 = this.envelopes[envelopeIndex][i]
      const p2 = this.envelopes[envelopeIndex][i + 1]
      const x1 = this.tToPx(p1.t)
      const y1 = this.yToPx(p1.y)
      const x2 = this.tToPx(p2.t)
      const y2 = this.yToPx(p2.y)
      const line = this.envelopeGroup.line(x1, y1, x2, y2).stroke({width: 1, color: '#fff'})

      if(!this.pointIdToLinesMap.has(p1.id)) {
        this.pointIdToLinesMap.set(p1.id, {})
      }
      const p1Lines = this.pointIdToLinesMap.get(p1.id)
      if(p1Lines) {
        p1Lines.from = line
      }

      if(!this.pointIdToLinesMap.has(p2.id)) {
        this.pointIdToLinesMap.set(p2.id, {})
      }
      const p2Lines = this.pointIdToLinesMap.get(p2.id)
      if(p2Lines) {
        p2Lines.to = line
      }
    }

    //draw line after last point
    if(this.envelopes[envelopeIndex].length > 0) {
      const p1 = this.envelopes[envelopeIndex][this.envelopes[envelopeIndex].length - 1]
      const x1 = this.tToPx(p1.t)
      const y1 = this.yToPx(p1.y)
      const line = this.envelopeGroup.line(x1, y1, this.quarterNoteWidth * this.numMeasures * 4, y1).stroke({width: 1, color: '#fff'})
      this.pointIdToLinesMap.get(p1.id)!.from = line
    }

  }

  refPt!: DOMPoint;

  // Get point in global SVG space from mousemove event
  svgMouseCoord(evt: MouseEvent){
    this.refPt.x = evt.clientX; 
    this.refPt.y = evt.clientY;
    return this.refPt.matrixTransform(this.svgRoot.node.getScreenCTM()!.inverse());
  }

  // need to calculate mouse delta from screen coordinates rather than SVG coordinates because
  // the SVG view moves after every frame, thus changing the read mouse coordintates and creating
  // wild feedback. root is the mouse position 'snapshot' against which the delta is measured
  getMouseDelta(event: MouseEvent, root: MouseMoveRoot){
    return {x: event.clientX - root.mouseX, y: event.clientY - root.mouseY};
  }

  //take a snapshot of the mouse position and viewbox size/position
  resetMouseMoveRoot(event: MouseEvent){
    const vb = this.svgRoot.viewbox();
    const svgXY = this.svgMouseCoord(event);
    this.mouseMoveRoot = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      svgX: svgXY.x,
      svgY: svgXY.y,
      vbX: vb.x,
      vbY: vb.y,
      vbWidth: vb.width,
      vbHeight: vb.height,
      zoom: this.svgRoot.zoom() //todo refactor check
    };
    console.log("resetMouseMoveRoot", this.mouseMoveRoot)
    this.mouseMoveRootNeedsReset = false;
  }

  mouseScrollHandler(event: MouseEvent){
    if (this.mouseMoveRootNeedsReset) this.resetMouseMoveRoot(event);
    if (this.mouseScrollActive){
      const mouseDetla = this.getMouseDelta(event, this.mouseMoveRoot);
      const boundVal = (n: number, l: number, h: number) => Math.min(h, Math.max(l, n));
      //inverted scrolling
      const scrollFactor = 1/this.mouseMoveRoot.zoom;
      const newVBPos = {
        x: boundVal(this.mouseMoveRoot.vbX - mouseDetla.x * scrollFactor, 0, this.quarterNoteWidth * this.numMeasures * 4 - this.mouseMoveRoot.vbWidth),
      };
      this.scrollPos = newVBPos.x

      // console.log("scroll x", newVBPos.x)
      // console.log("viewbox", newVBPos.x, this.mouseMoveRoot.vbY, this.mouseMoveRoot.vbWidth, this.mouseMoveRoot.vbHeight)

      //todo - change tab box to scroll to the new position
      this.tabBoxGroup.move(newVBPos.x, this.tabBoxGroup.y())
      this.svgRoot.viewbox(newVBPos.x, this.mouseMoveRoot.vbY, this.mouseMoveRoot.vbWidth, this.mouseMoveRoot.vbHeight);

      this.scrollCallback(this.scrollPos)
    }
  }

  seXScrollDirectly(x: number) {
    const vbd = {w: this.svgRoot.viewbox().width, h: this.svgRoot.viewbox().height, y: this.svgRoot.viewbox().y}
    this.svgRoot.viewbox(x, vbd.y, vbd.w, vbd.h)
  }

  zoomLevel = 1

  mouseZoomHandler2(event: MouseEvent) {
    if (this.mouseMoveRootNeedsReset) this.resetMouseMoveRoot(event);
    if (this.mouseZoomActive){
      const mouseDetla = this.getMouseDelta(event, this.mouseMoveRoot);


    }
  }

  mouseZoomHandler(event: MouseEvent){
    if (this.mouseMoveRootNeedsReset) this.resetMouseMoveRoot(event);
    if (this.mouseZoomActive){
      const mouseDetla = this.getMouseDelta(event, this.mouseMoveRoot);
      const boundVal = (n: number, l: number, h: number) => Math.min(h, Math.max(l, n));

      const zoomChange = (4**(mouseDetla.y/this.mouseMoveRoot.zoom / this.viewportHeight));
      const zoomFactor = this.mouseMoveRoot.zoom * zoomChange;
      if (zoomFactor < this.maxZoom) return;
      
      const svgMouseVBOffsetX = this.mouseMoveRoot.svgX - this.mouseMoveRoot.vbX;

      const newWidth = this.mouseMoveRoot.vbWidth/zoomChange;

      const newVBPos = {
        x: boundVal(this.mouseMoveRoot.svgX - svgMouseVBOffsetX/zoomChange, 0, this.quarterNoteWidth * this.numMeasures * 4 - newWidth),
        y: this.mouseMoveRoot.vbY,
        w: newWidth,
        h: this.mouseMoveRoot.vbHeight
      };

      console.log("envelope zoom", newVBPos)

      this.svgRoot.viewbox(newVBPos.x, newVBPos.y, newVBPos.w, newVBPos.h);
    }
  }
}


export type NoteInfo<T> = {pitch: number, position: number, duration: number, velocity: number, metadata?: T}

type Note<T> = {
  elem: Rect,
  info: NoteInfo<T>,
  label: Text,
  handles: {
    start: Circle,
    end: Circle
  }
}

type MouseMoveRoot = {
  mouseX: number,
  mouseY: number,
  svgX: number,
  svgY: number,
  vbX: number,
  vbY: number,
  vbWidth: number,
  vbHeight: number,
  zoom: number
}

type Box = {
  tl: { x: number, y: number },
  br: { x: number, y: number }
}

export class PianoRoll<T> {
  private svgRoot!: Svg;
  noteModStartReference: { [key: string]: { x: number, y: number, width: number, height: number } };
  private notes: {[key: string]: Note<T>};
  private spatialNoteTracker: {[key: string]: Note<T>[]};
  private selectedElements: Set<Rect>;
  selectedNoteIds: string[];
  private selectRect?: Rect;
  private cursorElement!: Rect
  cursorPosition: number;
  lastCursorPosition = 0
  cursorWidth: number;
  playCursorElement: any;
  private backgroundElements: Set<Element> = new Set();
  quarterNoteWidth: number;
  noteHeight: number;
  handleRad: number;
  whiteNotes: number[];
  noteSubDivision: number;
  timeSignature: number;
  numMeasures: number;
  sectionColoringDivision: number;
  NUM_MIDI_NOTES: number;
  xSnap: number;
  ySnap: any;
  backgroundColor1: string;
  backgroundColor2: string;
  noteColor: string;
  selectedNoteColor: string;
  thickLineWidth: number;
  thinLineWidth: number;
  viewportHeight: number;
  viewportWidth: number;
  maxZoom: any;
  noteCount: number;
  refPt!: DOMPoint;
  shiftKeyDown: boolean;
  historyList: NoteInfo<T>[][];
  historyListIndex: number;
  pianoRollHeight: number = 0;
  pianoRollWidth: number = 0;
  pitchStrings: string[];
  textDev: number;
  mouseScrollActive: boolean;
  mouseZoomActive: boolean;
  mouseMoveRootNeedsReset: boolean;
  mouseMoveRoot: MouseMoveRoot;
  nonSelectedModifiedNotes: Set<string>;
  count: number;
  draggingActive: boolean;
  quantDragActivated: boolean;
  private dragTarget?: Rect;
  resizingActive: boolean;
  quantResizingActivated: boolean;
  private resizeTarget?: Rect;
  private rawSVGElementToWrapper: {[key: string]: Rect}
  copiedNoteBuffer: NoteInfo<T>[];
  containerElement: HTMLElement | null;
  containerElementId: any;
  temporaryMouseMoveHandler?: (event: MouseEvent) => void;
  mousePosition: { x: number; y: number; };
  playHandler: any;
  noteOnOffHandler: any;
  wIsDown: any;
  private debugCircle0: Circle
  private debugCircle1: Circle
  scrollPos = 0
  scrollCallback = (x: number) => {}

  constructor(containerElementId: string, playHandler: (pitch: number) => void, noteOnOffHandler: (pitch: number, onOff: ('on' | 'off')) => void){
    this.svgRoot; //the svg root element

    /* a dictionary that, upon the start of a group drag/resize event, stores the 
     * initial positions and lengths of all notes so that the mouse modifications to
     * one note can be bounced to the rest of the selected notes*/
    this.noteModStartReference = {};

    //structure tracking both note info and note svg element state
    this.notes = {};


    //used to track note show/hide on resize/drag - map of pitch -> noteInfo of that pitch sorted by start time
    this.spatialNoteTracker = {}

    //elements selected by a mouse-region highlight
    this.selectedElements = new Set();
    this.selectedNoteIds = []; //IDs of selected notes saved separtely to speed up multi drag/resize performance

    this.selectRect; //the variable holding the mouse-region highlight svg rectabgle 

    this.cursorElement; //cursor that corresponds to interaction and editing
    this.cursorPosition = 0.25; //cursor position is in beats
    this.cursorWidth = 2.1; 

    this.playCursorElement; //cursor that moves when piano roll is being played

    //svg elements in the pianoRoll background
    this.backgroundElements;

    this.quarterNoteWidth = 120; //in pixels
    this.noteHeight = 20; //in pixels
    this.handleRad = 5; //radius of the resize handles in pixels
    this.whiteNotes = [0, 2, 4, 5, 7, 9, 11];
    this.noteSubDivision = 16; //where to draw lines and snap to grid
    this.timeSignature = 4/4; //b
    this.numMeasures = 100;
    // Every quarter note region of the background will be alternately colored.
    // In ableton this changes on zoom level - TODO - is this even used? Could ignore this behavior
    this.sectionColoringDivision = 4; 
    this.NUM_MIDI_NOTES = 128;

    //snap to grid quantization sizes
    this.xSnap = 1; //x-variable will change depending on user quantization choice, or be vertLineSpace as calculated below
    this.ySnap = this.noteHeight;

    this.backgroundColor1 = '#ddd';
    this.backgroundColor2 = '#bbb';
    this.noteColor = '#f23';
    this.selectedNoteColor = '#2ee'
    this.thickLineWidth = 1.8;
    this.thinLineWidth = 1;
    this.viewportHeight = 360;
    this.viewportWidth = 640;
    this.maxZoom;
    this.noteCount = 0;
    // Create an SVGPoint for future math
    this.refPt; 
    this.shiftKeyDown = false;


    this.historyList = [[]]; //list of states. upon an edit, the end of historyList is always the current state 

    // How far away from end of array (e.g, how many redos available).
    //  historyListIndex  is always the index of the current state in historyList
    this.historyListIndex = 0; 

    this.pianoRollHeight;
    this.pianoRollWidth;

    //variables relating to note-name labels
    this.pitchStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.textDev = 4;

    //variables relating to mouse movement state (scroll, zoom, resize, drag, etc)
    this.mouseScrollActive = false;
    this.mouseZoomActive = false;
    this.mouseMoveRootNeedsReset = true;
    this.mouseMoveRoot = {mouseX: 0, mouseY: 0, svgX: 0, svgY: 0, vbX: 0, vbY: 0, vbWidth: 0, vbHeight: 0, zoom: 0};

    //notes that are modified during drag or resize because they overlap with selected notes
    this.nonSelectedModifiedNotes = new Set();
    this.count = 0; //some debugging variable

    this.draggingActive = false;
    this.quantDragActivated = false;
    // this.dragTarget = null;

    this.resizingActive = false;
    this.quantResizingActivated = false;

    //used to get around scope/'this' issues - for drag/resize handlers we have access to raw 
    //svg element but need the SVG.js wrapper 
    this.rawSVGElementToWrapper = {}; 

    this.copiedNoteBuffer = [];

    this.containerElement = document.getElementById(containerElementId);
    this.containerElement!!.tabIndex = 0;
    this.containerElementId = containerElementId;

    // this.temporaryMouseMoveHandler = null; //variable used to manage logic for various mouse-drag gestures
    this.mousePosition = {x: 0, y: 0}; //current position of mouse in SVG coordinates
    
    //callback to play notes when selected/moved/etc. Takes a single pitch argument
    this.playHandler = playHandler; 

    //handler for separate on/off actions. takes a pitch val and on/off string
    this.noteOnOffHandler = noteOnOffHandler;


    this.drawBackgroundAndCursor();

    // attach the interaction handlers not related to individual notes
    this.attachHandlersOnBackground(this.backgroundElements, this.svgRoot);

    // this.addNote(55, 0, 1, false);
    // this.addNote(60, 0, 1, false);


    //set the view-area so we aren't looking at the whole 127 note 100 measure piano roll
    this.svgRoot.viewbox(0, 55 * this.noteHeight, this.viewportWidth*1.5, this.viewportHeight*1.5);
    this.debugCircle0 = this.svgRoot.circle(10).move(0, 0).fill('#f00');
    this.debugCircle1 = this.svgRoot.circle(10).move(0, 0).fill('#0f0');

    this.containerElement!!.addEventListener('keydown', event => this.keydownHandler(event));
    this.containerElement!!.addEventListener('keyup', event => this.keyupHandler(event));
    this.containerElement!!.addEventListener('mousemove', event => {
        this.mousePosition = this.svgMouseCoord(event);
      });
  }

  drawBackgroundAndCursor() {
    this.pianoRollHeight = this.noteHeight * this.NUM_MIDI_NOTES;
    const pulsesPerMeasure = this.timeSignature * 4;
    this.pianoRollWidth = this.quarterNoteWidth * pulsesPerMeasure * this.numMeasures;
    const numVertLines = this.numMeasures * pulsesPerMeasure * (this.noteSubDivision / 4);
    const vertLineSpace = this.pianoRollWidth / numVertLines;
    this.xSnap = vertLineSpace;
    const measureWidth = this.quarterNoteWidth*pulsesPerMeasure;
    this.svgRoot = SVG().addTo("#"+this.containerElementId).attr('id', 'pianoRollSVG').size(this.viewportWidth, this.viewportHeight);
    this.refPt = this.svgRoot.node.createSVGPoint();
    this.maxZoom = this.viewportHeight / this.pianoRollHeight;

    this.backgroundElements = new Set<Element>();
    for(let i = 0; i < this.numMeasures; i++){
      const color = i % 2 == 0 ? this.backgroundColor1 : this.backgroundColor2;
      const panel = this.svgRoot.rect(measureWidth, this.pianoRollHeight).move(i*measureWidth, 0).fill(color);
      this.backgroundElements.add(panel);
    }
    for(let i = 1; i < numVertLines; i++){
      const xPos = i*vertLineSpace;
      const strokeWidth = xPos % this.quarterNoteWidth == 0 ? this.thickLineWidth : this.thinLineWidth;
      const line = this.svgRoot.line(xPos, 0, xPos, this.pianoRollHeight).stroke({ width: strokeWidth, color: "#000" });
      this.backgroundElements.add(line);
    }
    for(let i = 1; i < this.NUM_MIDI_NOTES; i++){
      const line = this.svgRoot.line(0, i * this.noteHeight, this.pianoRollWidth, i * this.noteHeight).stroke({ width: this.thinLineWidth, color: "#000" });
      this.backgroundElements.add(line);
    }

    this.cursorElement = this.svgRoot.rect(this.cursorWidth, this.pianoRollHeight).move(this.cursorPosition * this.quarterNoteWidth, 0).fill(this.noteColor);
    this.playCursorElement = this.svgRoot.rect(this.cursorWidth, this.pianoRollHeight).move(this.cursorPosition * this.quarterNoteWidth, 0).fill('#2d2').opacity(0);
    this.cursorElement.animate(1500).attr({fill: '#fff'}).loop(Infinity, true);
  }


  //duration is number of quarter notes, pitch is 0-indexed MIDI
  //todo pianoRoll - refactor this to use groups
  addNote(pitch: number, position: number, duration: number, avoidHistoryManipulation: boolean = false) {
    const xPos = position * this.quarterNoteWidth
    const yPos = (127 - pitch) * this.noteHeight
    const width = duration * this.quarterNoteWidth
    const rect = this.svgRoot.rect(width, this.noteHeight).move(xPos, yPos).fill(this.noteColor);
    rect.id(this.noteCount.toString());
    this.rawSVGElementToWrapper[rect.id()] = rect;
    // rect.selectize({rotationPoint: false, points:['r', 'l']}).resize();
    const text = this.svgRoot.text(this.svgYToPitchString(rect.y().valueOf() as number))
      .font({size: 14})
      .move(xPos + this.textDev, (127-pitch)*this.noteHeight)
      // .style('pointer-events', 'none');
    const startHandle = this.svgRoot.circle(this.handleRad).move(xPos - this.handleRad/2, yPos + (this.noteHeight-this.handleRad)/2).fill('#000');
    const endHandle = this.svgRoot.circle(this.handleRad).move(xPos + width - this.handleRad / 2, yPos + (this.noteHeight - this.handleRad) / 2).fill('#000');
    const newNote: Note<T> = {
      elem: rect, 
      info: {pitch, position, duration, velocity: 0.5},
      label: text,
      handles: {start: startHandle, end: endHandle}
    }
    this.notes[this.noteCount] = newNote
    this.attachHandlersOnNote(newNote, this.svgRoot);
    this.noteCount++;
    if (!avoidHistoryManipulation){
      this.snapshotNoteState();
    }

    this.playHandler(pitch);

    return rect.id();
  }

  private deleteElement(elem: Rect){
    // elem.selectize(false);
    elem.remove();
    const note = this.notes[elem.id()]
    note.label.remove();
    note.handles.start.remove();
    note.handles.end.remove();
  }

  private deleteElements(elements: Set<Rect>){
    //for selected notes - delete svg elements, remove entries from 'notes' objects
    elements.forEach((elem)=>{
      this.deleteElement(elem);
      delete this.notes[elem.id()];
    });
    this.snapshotNoteState();
  }

  getNoteData(){
    return Object.values(this.notes).map(note => ({ ...note.info }));
  }

  setNoteData(noteData: NoteInfo<T>[]) {
    this.deleteElements(new Set(Object.values(this.notes).map(note => note.elem)))
    this.notes = {};
    noteData.forEach((noteInfo) => {
      this.addNote(
        noteInfo.pitch,
        noteInfo.position,
        noteInfo.duration,
        true
      );
    });
    this.snapshotNoteState();
  }

  setViewportToShowAllNotes() {
    const noteData = Object.values(this.notes).map(note => note.info);
    const minNoteStartPos = Math.min(...noteData.map(info => info.position));
    const maxNoteEndPos = Math.max(...noteData.map(info => info.position + info.duration));
    const notePosRange = maxNoteEndPos - minNoteStartPos;

    const minNoteStartPitch = Math.min(...noteData.map(info => info.pitch));
    const maxNoteEndPitch = Math.max(...noteData.map(info => info.pitch + 1));
    const notePitchRange = maxNoteEndPitch - minNoteStartPitch;

    const vbX = minNoteStartPos * this.quarterNoteWidth;
    const vbY = (127 - maxNoteEndPitch) * this.noteHeight;
    const vbWidth = notePosRange * this.quarterNoteWidth;
    const vbHeight = notePitchRange * this.noteHeight;

    this.svgRoot.viewbox(vbX, vbY, vbWidth, vbHeight);
  }

  //update underlying note info from SVG element change
  private updateNoteInfo(note: Note<T>, calledFromBatchUpdate: boolean){
    if (note.elem.visible()) {
      const pitch = this.svgYtoPitch(note.elem.y().valueOf() as number);
      const position = this.svgXtoPosition(note.elem.x().valueOf() as number);
      const duration = note.elem.width().valueOf() as number / this.quarterNoteWidth; //todo refactor check all these valueOf() calls
      note.info = {pitch, position, duration, velocity: 0.5};
    } else {
      this.deleteElement(note.elem);
      delete this.notes[note.elem.id()];
    }
    if (!calledFromBatchUpdate) this.snapshotNoteState();
  }

  //a separate function so that batch note changes are saved in the undo history as a single event
  private updateNoteInfoMultiple(notes: Note<T>[]){
    notes.forEach(note => this.updateNoteInfo(note, true));
    this.snapshotNoteState();
  }

  //update note SVG element from underlying info change
  private updateNoteElement(nt: Note<T>, position: number, pitch: number, duration: number){
    nt.elem.show();
    nt.label.show();
    nt.handles.start.show();
    nt.handles.end.show();
    const yPos = (127 - pitch) * this.noteHeight
    const xPos = position * this.quarterNoteWidth
    const width = duration * this.quarterNoteWidth
    this.updateNoteElemScreenCoords(nt, xPos, yPos, width);
  }

  private updateNoteElemScreenCoords(nt: Note<T>, x?: number, y?: number, width?: number, persistData: boolean = true, calledFromBatchUpdate: boolean = true) {
    x = x ?? nt.elem.x().valueOf() as number;
    y = y ?? nt.elem.y().valueOf() as number;
    width = width ?? nt.elem.width().valueOf() as number;

    nt.elem.x(x);
    nt.label.x(x + this.textDev);
    nt.handles.start.x(x - this.handleRad / 2);

    nt.elem.y(y);
    nt.label.y(y);
    nt.label.text(this.svgYToPitchString(y));
    nt.handles.start.y(y + (this.noteHeight - this.handleRad) / 2);
    nt.handles.end.y(y + (this.noteHeight - this.handleRad) / 2);
    
    nt.elem.width(width);
    nt.handles.end.x(x + width - this.handleRad / 2);
    if(persistData) this.updateNoteInfo(nt, calledFromBatchUpdate);
  }

  // Get point in global SVG space from mousemove event
  svgMouseCoord(evt: MouseEvent){
    this.refPt.x = evt.clientX; 
    this.refPt.y = evt.clientY;
    return this.refPt.matrixTransform(this.svgRoot.node.getScreenCTM()!!.inverse());
  }

  svgYtoPitch(yVal: number) {return 127 - yVal/this.noteHeight;}
  svgXtoPosition(xVal: number) {return xVal/this.quarterNoteWidth}
  svgXYtoPitchPos(xVal: number, yVal: number){
    return {pitch: 127 - yVal/this.noteHeight, position: xVal/this.quarterNoteWidth};
  }
  svgXYtoPitchPosQuant(xVal: number, yVal: number) {
    const notesPerQuarterNote = this.noteSubDivision/4;
    const rawPosition = xVal / this.quarterNoteWidth;
    return {pitch: 127 - Math.floor(yVal/this.noteHeight), position: Math.floor(rawPosition * notesPerQuarterNote)/notesPerQuarterNote};
  }


  // need to calculate mouse delta from screen coordinates rather than SVG coordinates because
  // the SVG view moves after every frame, thus changing the read mouse coordintates and creating
  // wild feedback. root is the mouse position 'snapshot' against which the delta is measured
  getMouseDelta(event: MouseEvent, root: MouseMoveRoot){
    return {x: event.clientX - root.mouseX, y: event.clientY - root.mouseY};
  }


  seXScrollDirectly(x: number) {
    const vbd = {w: this.svgRoot.viewbox().width, h: this.svgRoot.viewbox().height, y: this.svgRoot.viewbox().y}
    const zoom = this.svgRoot.zoom()
    this.svgRoot.viewbox(x / zoom, vbd.y, vbd.w, vbd.h)
  }

  //take a snapshot of the mouse position and viewbox size/position
  resetMouseMoveRoot(event: MouseEvent){
    const vb = this.svgRoot.viewbox();
    const svgXY = this.svgMouseCoord(event);
    this.mouseMoveRoot = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      svgX: svgXY.x,
      svgY: svgXY.y,
      vbX: vb.x,
      vbY: vb.y,
      vbWidth: vb.width,
      vbHeight: vb.height,
      zoom: this.svgRoot.zoom() //todo refactor check
    };
    this.mouseMoveRootNeedsReset = false;
  }

  mouseScrollHandler(event: MouseEvent){
    if (this.mouseMoveRootNeedsReset) this.resetMouseMoveRoot(event);
    if (this.mouseScrollActive){
      const mouseDetla = this.getMouseDelta(event, this.mouseMoveRoot);
      const boundVal = (n: number, l: number, h: number) => Math.min(h, Math.max(l, n));
      
      //inverted scrolling
      const scrollFactor = 1/this.mouseMoveRoot.zoom;
      const newVBPos = {
        x: boundVal(this.mouseMoveRoot.vbX - mouseDetla.x * scrollFactor, 0, this.pianoRollWidth - this.mouseMoveRoot.vbWidth),
        y: boundVal(this.mouseMoveRoot.vbY - mouseDetla.y * scrollFactor, 0, this.pianoRollHeight - this.mouseMoveRoot.vbHeight)
      };
      this.svgRoot.viewbox(newVBPos.x, newVBPos.y, this.mouseMoveRoot.vbWidth, this.mouseMoveRoot.vbHeight);

      this.scrollPos = newVBPos.x
      this.scrollCallback(this.scrollPos)
    }
  }

  mouseZoomHandler(event: MouseEvent){
    if (this.mouseMoveRootNeedsReset) this.resetMouseMoveRoot(event);
    if (this.mouseZoomActive){
      const mouseDetla = this.getMouseDelta(event, this.mouseMoveRoot);
      const boundVal = (n: number, l: number, h: number) => Math.min(h, Math.max(l, n));

      const zoomChange = (4**(mouseDetla.y/this.mouseMoveRoot.zoom / this.mouseMoveRoot.vbHeight));
      const zoomFactor = this.mouseMoveRoot.zoom * zoomChange;
      if (zoomFactor < this.maxZoom) return;
      
      const svgMouseVBOffsetX = this.mouseMoveRoot.svgX - this.mouseMoveRoot.vbX;
      const svgMouseVBOffsetY = this.mouseMoveRoot.svgY - this.mouseMoveRoot.vbY;
      const newWidth = this.mouseMoveRoot.vbWidth/zoomChange;
      const newHeight = this.mouseMoveRoot.vbHeight/zoomChange;
      const newVBPos = {
        x: boundVal(this.mouseMoveRoot.svgX - svgMouseVBOffsetX/zoomChange, 0, this.pianoRollWidth - newWidth),
        y: boundVal(this.mouseMoveRoot.svgY - svgMouseVBOffsetY/zoomChange, 0, this.pianoRollHeight - newHeight)
      };

      this.svgRoot.viewbox(newVBPos.x, newVBPos.y, newWidth, newHeight);
    }
  }

  keydownHandler(event: KeyboardEvent){
    if (event.key == 'Shift') this.shiftKeyDown = true; 
    if (event.ctrlKey && !event.altKey){
      this.mouseMoveRootNeedsReset = true;
      this.mouseScrollActive = true;
      this.temporaryMouseMoveHandler = ev => this.mouseScrollHandler(ev);
      this.containerElement!!.addEventListener('mousemove', this.temporaryMouseMoveHandler);
    }
    if (event.altKey && !event.ctrlKey){
      this.mouseMoveRootNeedsReset = true;
      this.mouseZoomActive = true;
      this.temporaryMouseMoveHandler = ev => this.mouseZoomHandler(ev);
      this.containerElement!!.addEventListener('mousemove', this.temporaryMouseMoveHandler);
    }
    if (event.key == 'Backspace'){
      this.deleteElements(this.selectedElements);
    }
    if (event.key === 'z' && event.metaKey){
      if (this.shiftKeyDown) this.executeRedo();
      else this.executeUndo();
    }
    if (event.key === 'c' && event.metaKey){
      if (this.selectedElements.size > 0) this.copyNotes();
    }
    if (event.key === 'v' && event.metaKey){
      if (this.copiedNoteBuffer.length > 0) this.pasteNotes();
    }
    if (event.key === 'ArrowUp'){
      if (this.selectedElements.size > 0) this.shiftNotesPitch(1);
      event.preventDefault();
    }
    if (event.key === 'ArrowDown'){
      if (this.selectedElements.size > 0) this.shiftNotesPitch(-1);
      event.preventDefault();
    }
    if (event.key === 'ArrowLeft'){
      if (this.selectedElements.size > 0) this.shiftNotesTime(-0.25);
      event.preventDefault();
    }
    if (event.key === 'ArrowRight'){
      if (this.selectedElements.size > 0) this.shiftNotesTime(0.25);
      event.preventDefault();
    }
    // if (event.key === ' '){
    //   if (pianoRollIsPlaying) {
    //     stopPianoRoll(this);
    //   }
    //   else {
    //     playPianoRoll(this);
    //   }
    //   event.preventDefault();
    // }
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)){//have 1, 2, 3, 4 be different lengths
      const noteInfo = this.svgXYtoPitchPosQuant(this.mousePosition.x, this.mousePosition.y);
      const keyNum = parseFloat(event.code[5]);
      const dur = 2**(keyNum-1) * (this.shiftKeyDown ? 2 : 1) * 0.25;
      const newNoteId = this.addNote(noteInfo.pitch, noteInfo.position, dur, true);
      //truncate or delete old note as appropriate
      const notesAtPitch = Object.values(this.notes).filter(n => n.info.pitch == noteInfo.pitch);
      const samePitch = notesAtPitch.filter(n => n.info.position < noteInfo.position + dur && noteInfo.position < n.info.position + n.info.duration);
      //todo - refactor this logic into a function
      samePitch.forEach(note => {
        console.log('checking', note.elem.id());
        if(newNoteId == note.elem.id()) return;
        //if new note interests with start of old note, delete old note
        if (noteInfo.position <= note.info.position && note.info.position < noteInfo.position + dur) {
          console.log('delete intersect', note.elem.id());
          this.deleteElement(note.elem);
          delete this.notes[note.elem.id()];
        }
        //if new note intersects with end of old note, truncate old note
        else if (noteInfo.position < note.info.position + note.info.duration && note.info.position + note.info.duration <= noteInfo.position + dur) {
          console.log('truncate end', note.elem.id());
          const newNoteDuration = note.info.position - noteInfo.position;
          this.updateNoteElement(note, note.info.position, note.info.pitch, newNoteDuration);
        }
        //if new note is contained in old note, truncate old note
        else if (note.info.position <= noteInfo.position && noteInfo.position + dur <= note.info.position + note.info.duration) {
          console.log('truncate contained', note.elem.id());
          const newNoteDuration = noteInfo.position - note.info.position;
          this.updateNoteElement(note, note.info.position, note.info.pitch, newNoteDuration);
        }
        //if new note contains old note, delete old note
        else if (noteInfo.position <= note.info.position && note.info.position + note.info.duration <= noteInfo.position + dur) {
          console.log('delete contains', note.elem.id());
          this.deleteElement(note.elem);
          delete this.notes[note.elem.id()];
        } else {
          console.log('no change', note.elem.id());
        }
      });
      this.snapshotNoteState();
    }
    if (event.key == 'q'){ 
      this.getNotesAtPosition(this.cursorPosition+0.01).map(n => this.playHandler(n.pitch));
    }
    if (event.key == 'w'){
      if (!this.wIsDown){
        this.wIsDown = true;
        this.getNotesAtPosition(this.cursorPosition+0.01).map(n => this.noteOnOffHandler(n.pitch, 'on'));
      }
    }
    event.stopPropagation();
  }

  keyupHandler(event: KeyboardEvent){
    if (event.key == 'Shift') this.shiftKeyDown = false; 
    if (!event.ctrlKey && this.mouseScrollActive) {
      this.mouseScrollActive = false;
      this.containerElement!!.removeEventListener('mousemove', this.temporaryMouseMoveHandler!!);
      this.temporaryMouseMoveHandler = undefined;
    }
    if (!event.altKey && this.mouseZoomActive) {
      this.mouseZoomActive = false;
      this.containerElement!!.removeEventListener('mousemove', this.temporaryMouseMoveHandler!!);
      this.temporaryMouseMoveHandler = undefined;
    }
    if (event.key == 'w'){ 
      this.wIsDown = false;
      //replace with generic interactionPlay() handler 
      this.getNotesAtPosition(this.cursorPosition+0.01).map(n => this.noteOnOffHandler(n.pitch, 'off'));
    }
  }

  copyNotes(){
    this.selectedNoteIds = Array.from(this.selectedElements).map(elem => elem.id());
    const selectedNoteInfos = this.selectedNoteIds.map(id => this.notes[id].info);
    const minNoteStart = Math.min(...selectedNoteInfos.map(info => info.position));
    this.copiedNoteBuffer = selectedNoteInfos.map(info => {
      const newInfo = Object.assign({}, info);
      newInfo.position -= minNoteStart
      return newInfo;
    });
  }

  pasteNotes(){
    this.initializeNoteModificationAction();

    //marking the newly pasted notes as 'selected' eases overlap handling
    this.selectedNoteIds = this.copiedNoteBuffer.map(info => this.addNote(info.pitch, this.cursorPosition+info.position, info.duration, true));
    this.selectedElements = new Set(this.selectedNoteIds.map(id => this.notes[id].elem));
    
    this.executeOverlapVisibleChanges();
    this.updateNoteStateOnModificationCompletion();

    //deselect all notes to clean up 
    Object.keys(this.notes).forEach((id)=>this.deselectNote(this.notes[id].elem));
  }

  shiftNotesPitch(shiftAmount: number){
    this.initializeNoteModificationAction();
    this.selectedNoteIds.forEach(id => {
      const note = this.notes[id];
      note.info.pitch += shiftAmount;
      this.playHandler(note.info.pitch);
      this.updateNoteElement(note, note.info.position, note.info.pitch, note.info.duration);
    });
    this.executeOverlapVisibleChanges();
    this.updateNoteStateOnModificationCompletion();
    // this.refreshNoteModStartReference(this.selectedNoteIds);
    // this.snapshotNoteState();
  }

  shiftNotesTime(shiftAmount: number){
    this.initializeNoteModificationAction();
    this.selectedNoteIds.forEach(id => {
      const note = this.notes[id];
      note.info.position += shiftAmount;
      this.updateNoteElement(note, note.info.position, note.info.pitch, note.info.duration);
    });
    this.executeOverlapVisibleChanges();
    this.updateNoteStateOnModificationCompletion();
    // this.refreshNoteModStartReference(this.selectedNoteIds);//
    // this.snapshotNoteState();
  }

  snapshotNoteState(){
    // console.log('snapshot', this.historyList.length, this.historyListIndex);
    const noteState = Object.values(this.notes).map(note => Object.assign({}, note.info));
    if (this.historyListIndex == this.historyList.length-1){
      this.historyList.push(noteState);
    } else {
      this.historyList = this.historyList.splice(0, this.historyListIndex+1);
      this.historyList.push(noteState);
    }
    this.historyListIndex++;
  }

  executeUndo() {
    if (this.historyListIndex == 0) return; //always start with an 'no-notes' state
    this.historyListIndex--;
    this.restoreNoteState(this.historyListIndex);
  }

  executeRedo() {
    if (this.historyListIndex == this.historyList.length-1) return;
    this.historyListIndex++;
    this.restoreNoteState(this.historyListIndex);
  }

  restoreNoteState(histIndex: number){
    Object.values(this.notes).forEach(note => this.deleteElement(note.elem));
    this.notes = {};
    const noteState = this.historyList[histIndex];
    noteState.forEach((noteInfo)=>{
      this.addNote(noteInfo.pitch, noteInfo.position, noteInfo.duration, true);
    });
  }

  midiPitchToPitchString(pitch: number){ 
    return this.pitchStrings[pitch%12] + (Math.floor(pitch/12)-2)
  }

  svgYToPitchString(yVal: number){
    const pitch = this.svgYtoPitch(yVal);
    return this.midiPitchToPitchString(pitch);
  }

  // Resets the 'start' positions/sizes of notes for multi-select transformations to current position/sizes
  refreshNoteModStartReference(noteIds: string[]){
    this.noteModStartReference = {};
    noteIds.forEach((id: string)=>{ 
      this.noteModStartReference[id] = {
        x:  this.notes[id].elem.x().valueOf() as number, 
        y:  this.notes[id].elem.y().valueOf() as number, 
        width: this.notes[id].elem.width().valueOf() as number, 
        height: this.notes[id].elem.height().valueOf() as number
      };
    });
  }


  private getNotesAtPosition(pos: number){
    const notesAtPos = Object.values(this.notes).filter(n => n.info.position <= pos && pos <= n.info.position+n.info.duration).map(n => n.info);
    return notesAtPos;
  }

  //used to differentiate between 'clicks' and 'drags' from a user perspective
  //to stop miniscule changes from being added to undo history
  private checkIfNoteMovedSignificantly(noteElement: Rect, thresh: number){
    return Math.abs(noteElement.x().valueOf() as number - this.noteModStartReference[noteElement.id()].x) > thresh || Math.abs(noteElement.y().valueOf() as number - this.noteModStartReference[noteElement.id()].y) > thresh;
    //todo refactor check all these valueOf() calls
  }

  //used to differentiate between 'clicks' and 'resize' from a user perspective 
  //to stop miniscule changes from being added to undo history
  private checkIfNoteResizedSignificantly(noteElement: Rect, thresh: number){
    return Math.abs(noteElement.width().valueOf() as number - this.noteModStartReference[noteElement.id()].width) > thresh;
    //todo refactor check all these valueOf() calls
  }

  private initializeNoteModificationAction(element?: Rect){
    this.selectedNoteIds = Array.from(this.selectedElements).map(elem => elem.id());
    this.nonSelectedModifiedNotes.clear();
    // console.log('mousedown', element, !this.selectedNoteIds.includes(element.id()));
    if (element && !this.selectedNoteIds.includes(element.id())) {
      if (!this.shiftKeyDown) this.clearNoteSelection();
      this.selectNote(element);
      this.selectedNoteIds = [element.id()];
    }
    this.populateSpatialNoteTracker();
    this.refreshNoteModStartReference(this.selectedNoteIds);
  }


  updateNoteStateOnModificationCompletion(){
    this.refreshNoteModStartReference(this.selectedNoteIds);
    const changedNotes = this.selectedNoteIds.map(id => this.notes[id]).concat(Array.from(this.nonSelectedModifiedNotes).map(id => this.notes[id]));
    this.updateNoteInfoMultiple(changedNotes);
  }


  endSelect(){
    // this.selectRect.draw('stop', event);
    this.selectRect?.remove();
    this.svgRoot.off('mousemove');
    this.selectRect = undefined;
  }

  endDrag(){
    this.draggingActive = false;
    this.quantDragActivated = false;

    this.svgRoot.off('mousemove');

    //used to prevent click events from triggering after drag
    const significantDrag = this.checkIfNoteMovedSignificantly(this.dragTarget!!, 3);
    if (!significantDrag) return;
    //todo refactor check - verify: only needed for drag logic using plugin?

    //refresh the startReference so the next multi-select-transform works right
    this.updateNoteStateOnModificationCompletion();
    this.dragTarget = undefined;
  }

  endResize(){
    this.resizingActive= false;
    this.quantResizingActivated = false;

    this.svgRoot.off('mousemove');

    if (!this.checkIfNoteResizedSignificantly(this.resizeTarget!!, 3)) return;
    console.log('resize done');

    // this.resizeTarget!!.resize();

    this.updateNoteStateOnModificationCompletion();
    this.resizeTarget = undefined;
  }

  startDragSelection(dragStart: DOMPoint){
    //clear previous mouse multi-select gesture state
    this.clearNoteSelection();

    //restart new mouse multi-select gesture
    this.selectRect = this.svgRoot.rect().fill('#008').attr('opacity', 0.25).move(dragStart.x, dragStart.y);
    // this.selectRect.draw(event); //todo refactor - have to reimplement this
    this.svgRoot.on('mousemove', (evt) => {
      
      const movePos = this.svgMouseCoord(evt as MouseEvent);
      const newTopLeft = { x: Math.min(dragStart.x, movePos.x), y: Math.min(dragStart.y, movePos.y) };
      const newBottomRight = { x: Math.max(dragStart.x, movePos.x), y: Math.max(dragStart.y, movePos.y) };

      this.selectRect?.move(newTopLeft.x, newTopLeft.y);
      this.selectRect?.size(newBottomRight.x - newTopLeft.x, newBottomRight.y - newTopLeft.y);
      
      //select this.notes which intersect with the selectRect (mouse selection area)
      Object.keys(this.notes).forEach((noteId)=>{
        const noteElem = this.notes[noteId].elem;
        
        const intersecting = this.selectRectIntersection(noteElem);
        if (intersecting) {
          this.selectNote(noteElem);            
        } else {
          this.deselectNote(noteElem)
        }
      });
    });
  }

  // attaches the appropriate handlers to the mouse event allowing to to 
  // start a multi-select gesture (and later draw mode)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private attachHandlersOnBackground(backgroundElements_: Set<Element>, _: Svg){ 
    // need to listen on window so select gesture ends even if released outside the 
    // bounds of the root svg element or browser
    window.addEventListener('mouseup', () => {
      //end a multi-select drag gesture
      if (this.selectRect) {
        this.endSelect();
      }
      this.selectRect?.remove();
      this.selectRect = undefined;

      if (this.draggingActive){
        this.endDrag();
      } 
      if (this.resizingActive){
        this.endResize();
      }
    });

    backgroundElements_.forEach((elem)=>{
      elem.on('mousedown', (event)=>{
        const quantRound = (val: number, qVal: number) => Math.round(val/qVal) * qVal;
        const mouseXY = this.svgMouseCoord(event as MouseEvent);
        const posSVG = quantRound(mouseXY.x, this.quarterNoteWidth/4);
        this.cursorElement.x(posSVG-this.cursorWidth/2);
        this.cursorPosition = posSVG/this.quarterNoteWidth;
        // console.log('mousedown background', posSym, posSVG, event);
        this.startDragSelection(mouseXY);
      });

      elem.on('dblclick', (event)=>{
        const svgXY = this.svgMouseCoord(event as MouseEvent);
        const pitchPos = this.svgXYtoPitchPosQuant(svgXY.x, svgXY.y);
        this.addNote(pitchPos.pitch, pitchPos.position, 4/this.noteSubDivision, false);
      }); 
    });
  }

  setCursorPos(beats: number) {
    this.cursorPosition = beats
    this.cursorElement.x(beats * this.quarterNoteWidth)
  }


  populateSpatialNoteTracker(){ //todo - probably don't need this - just query directly for notes of a pitch
    this.spatialNoteTracker = {};
    Object.values(this.notes).forEach((note)=>{
      if (this.spatialNoteTracker[note.info.pitch]){
        this.spatialNoteTracker[note.info.pitch].push(note);
      } else {
        this.spatialNoteTracker[note.info.pitch] = [];
        this.spatialNoteTracker[note.info.pitch].push(note);
      }
    });
    Object.values(this.spatialNoteTracker).forEach(noteList => noteList.sort((a1, a2) => a1.info.position - a2.info.position));
  }

  executeOverlapVisibleChanges(){
    const currentlyModifiedNotes = new Set<string>();
    this.selectedElements.forEach((selectedElem)=>{
      const selectedNote = this.notes[selectedElem.id()];
      const samePitch = this.spatialNoteTracker[selectedNote.info.pitch];
      if (samePitch) {
        samePitch.forEach((note)=>{
          if (selectedElem.id() != note.elem.id()) {
            if (this.selectedElements.has(note.elem)) {
              
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const earlierElem = note.elem.x() < selectedNote.elem.x() ? note : selectedNote;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const laterElem = note.elem.x() > selectedNote.elem.x() ? note : selectedNote; 
              //todo - handle case when two selected notes are the same pitch and you do a group resize and one overlaps another


            } else {

              //truncating the end of the non-selected note
              if (note.info.position < selectedNote.info.position && selectedNote.info.position < note.info.position+note.info.duration) {
                if (this.count++ < 10) {
                  //console.log(this.nonSelectedModifiedNotes, currentlyModifiedNotes);
                }
                currentlyModifiedNotes.add(note.elem.id());
                note.elem.show();
                note.label.show();
                note.handles.start.show();
                note.handles.end.show();
                const width = (selectedNote.info.position - note.info.position) * this.quarterNoteWidth
                this.updateNoteElemScreenCoords(note, undefined, undefined, width, false);
              //deleting the non-selected note
              } else if (selectedNote.info.position <= note.info.position && note.info.position < selectedNote.info.position+selectedNote.info.duration) {
                currentlyModifiedNotes.add(note.elem.id());
                note.elem.hide();
                note.label.hide();
                note.handles.start.hide();
                note.handles.end.hide();
              }
            }
          }
        });
      }
    });
    const notesToRestore = this.setDifference(this.nonSelectedModifiedNotes, currentlyModifiedNotes);
    notesToRestore.forEach(id => this.updateNoteElement(this.notes[id], this.notes[id].info.position, this.notes[id].info.pitch, this.notes[id].info.duration));
    this.nonSelectedModifiedNotes = currentlyModifiedNotes;
  }

  setDifference<T>(setA: Set<T>, setB: Set<T>){
    const difference = new Set(setA);
    for (const elem of setB) {
      difference.delete(elem);
    }
    return difference;
  }

  isDragOutOfBounds(){

  }

  isResizeOutOfBounds(){

  }

  // sets event handlers on each note element for position/resize multi-select changes
  private attachHandlersOnNote(note: Note<T>, svgParentObj: Svg){
    
    /* Performs the same drag deviation done on the clicked element to 
     * the other selected elements
     */

    const noteElement = note.elem;

    noteElement.on('point', (event)=>{ console.log('select', event)});

    noteElement.on('mousedown', (event) => {
      if (!this.mouseScrollActive && !this.mouseZoomActive) {
        this.resetMouseMoveRoot(event as MouseEvent);
        this.dragTarget = this.rawSVGElementToWrapper[(event.target!! as HTMLElement).id];
        console.log('drag target', this.rawSVGElementToWrapper, (event.target!! as HTMLElement).id);
        this.initializeNoteModificationAction(this.dragTarget);
        this.draggingActive = true;
        svgParentObj.on('mousemove', (event)=>{
          const svgXY = this.svgMouseCoord(event as MouseEvent);
          let xMove: number;
          const xDevRaw = svgXY.x - this.mouseMoveRoot.svgX;
          const quantWidth = this.quarterNoteWidth * (4/this.noteSubDivision);
          const quant = (val: number, qVal: number) => Math.floor(val/qVal) * qVal;
          const quantRound = (val: number, qVal: number) => Math.round(val/qVal) * qVal;
          
          if (Math.abs(svgXY.x - this.mouseMoveRoot.svgX) < quantWidth * 0.9 && !this.quantDragActivated) { 
            xMove = xDevRaw;
          } else {
            xMove = quantRound(xDevRaw, quantWidth);
            this.quantDragActivated = true;
          }
          const yMove = quant(svgXY.y, this.noteHeight) - quant(this.mouseMoveRoot.svgY, this.noteHeight);
          this.selectedNoteIds.forEach((id)=>{
            const noteModStart = this.noteModStartReference[id];
            //Todo - make note quantization more like ableton's on drag
            const xPos = noteModStart.x + xMove;
            const yPos = noteModStart.y + yMove;
            this.updateNoteElemScreenCoords(this.notes[id], xPos, yPos);
          });
          this.executeOverlapVisibleChanges();
        });
      }
    });

    note.handles.start.on('mousedown', (event) => { noteElement.fire('resizestart', {startMouseEvt: event, isEndChange: false}) })
    note.handles.end.on('mousedown', (event) => { noteElement.fire('resizestart', {startMouseEvt: event, isEndChange: true}) })

    noteElement.on('resizestart', (event)=>{
      this.resizeTarget = this.rawSVGElementToWrapper[(event.target!! as HTMLElement).id];
      this.initializeNoteModificationAction(this.resizeTarget);

      console.log('restireStartEvent', event);
      //@ts-ignore
      const isEndChange = event.detail.isEndChange;
      //@ts-ignore
      const startMouseEvt = event.detail.startMouseEvt;
      const resizeStartXY = this.svgMouseCoord(startMouseEvt as MouseEvent);


      //extracting the base dom-event from the SVG.js event so we can snapshot the current mouse coordinates
      // this.resetMouseMoveRoot(event.detail.event.detail.event);

      //inProgress - to get reizing to work with inter-select overlap and to stop resizing of 
      //clicked element at the start of another selected element, might need to remove the resize
      //handlers of all of the selected elements here, calculate the resize using 'mousemove' info 
      //by moving 'resizing' handler logic to 'mousemove', and then on 'mouseup' reattaching 'resize'
      //handler (at least, for 'resizestart' to piggyback on the gesture detection).
      
      // this.resizeTarget.resize('stop');
      this.resizingActive = true;
      svgParentObj.on('mousemove', (event)=>{
        const svgXY = this.svgMouseCoord(event as MouseEvent);
        const xDevRaw = svgXY.x - resizeStartXY.x;

        this.selectedNoteIds.forEach((id)=>{
          const oldNoteVals = this.noteModStartReference[id];
          //inProgress - control the resizing/overlap of the selected elements here and you don't 
          //have to worry about them in executeOverlapVisibleChanges()

          //inProgress - quantize long drags
          if (isEndChange) { 
            const width = oldNoteVals.width + xDevRaw;
            this.updateNoteElemScreenCoords(this.notes[id], undefined, undefined, width);
          } else { 
            const xVal = oldNoteVals.x + xDevRaw;
            const width = oldNoteVals.width - xDevRaw;
            this.updateNoteElemScreenCoords(this.notes[id], xVal, undefined, width);
          }
        });
        this.executeOverlapVisibleChanges();
      })
    });

    // noteElement.on('click', function(event){
    //   if (!this.motionOnDrag) {
    //     if (!this.shiftKeyDown) clearNoteSelection();
    //     console.log('this.shiftKeyDown on click', this.shiftKeyDown);
    //     selectNote(this);
    //   }
    // });

    noteElement.on('dblclick', (event)=>{
      this.deleteElements(new Set([this.rawSVGElementToWrapper[(event.target!! as HTMLElement).id]]));
    })
  }


  private selectNote(noteElem: Rect){
    if (!this.selectedElements.has(noteElem)) {
      this.selectedElements.add(noteElem);
      noteElem.fill(this.selectedNoteColor);
      this.playHandler(this.notes[noteElem.id()].info.pitch)
    }
  }

  private deselectNote(noteElem: Rect){
    if (this.selectedElements.has(noteElem)) {
      this.selectedElements.delete(noteElem);
      noteElem.fill(this.noteColor);
    }
  }

  // calculates if a note intersects with the mouse-multiselect rectangle
  private selectRectIntersection(noteElem: Rect){
    //top-left and bottom right of bounding rect. done this way b/c getBBox doesnt account for line thickness
    const noteBox = {
      tl: {x: noteElem.x().valueOf() as number, y: noteElem.y().valueOf() as number - this.noteHeight/2},  
      br: {x: (noteElem.x().valueOf() as number) + (noteElem.width().valueOf() as number), y: noteElem.y().valueOf() as number + this.noteHeight/2},
    };
    const selectRectBox = this.selectRect!!.node.getBBox();
    const selectBox = {
      tl: {x: selectRectBox.x, y: selectRectBox.y},
      br: {x: selectRectBox.x + selectRectBox.width , y: selectRectBox.y + selectRectBox.height}
    };
    return this.boxIntersect(noteBox, selectBox);
  }

  //the actual rectangle intersection calculation, separated out for debugging ease
  boxIntersect(noteBox: Box, selectBox: Box){
    let returnVal = true;
    //if noteBox is full to the left or right of select box
    if (noteBox.br.x < selectBox.tl.x || noteBox.tl.x > selectBox.br.x) returnVal = false;

    //if noteBox is fully below or above rect box
    //comparison operators are wierd because image coordinates used e.g (0,0) at 'upper left' of positive quadrant
    if (noteBox.tl.y > selectBox.br.y || noteBox.br.y < selectBox.tl.y) returnVal = false;
    return returnVal;
  }

  clearNoteSelection(){
    this.selectedElements.forEach(noteElem => this.deselectNote(noteElem));
  }
}
