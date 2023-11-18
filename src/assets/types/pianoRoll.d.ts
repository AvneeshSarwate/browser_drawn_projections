import { Circle, Element, Rect, Svg, Text } from '@svgdotjs/svg.js';
type NoteInfo = {
    pitch: number;
    position: number;
    duration: number;
};
type Note = {
    elem: Rect;
    info: NoteInfo;
    label: Text;
    handles: {
        start: Circle;
        end: Circle;
    };
};
type MouseMoveRoot = {
    mouseX: number;
    mouseY: number;
    svgX: number;
    svgY: number;
    vbX: number;
    vbY: number;
    vbWidth: number;
    vbHeight: number;
    zoom: number;
};
type Box = {
    tl: {
        x: number;
        y: number;
    };
    br: {
        x: number;
        y: number;
    };
};
export declare class PianoRoll {
    svgRoot: Svg;
    noteModStartReference: {
        [key: string]: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    };
    notes: {
        [key: string]: Note;
    };
    spatialNoteTracker: {
        [key: string]: Note[];
    };
    selectedElements: Set<Rect>;
    selectedNoteIds: string[];
    selectRect: any;
    cursorElement: any;
    cursorPosition: number;
    cursorWidth: number;
    playCursorElement: any;
    backgroundElements: Set<Element>;
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
    refPt: DOMPoint;
    shiftKeyDown: boolean;
    historyList: NoteInfo[][];
    historyListIndex: number;
    pianoRollHeight: number;
    pianoRollWidth: number;
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
    dragTarget?: Rect;
    resizingActive: boolean;
    quantResizingActivated: boolean;
    resizeTarget?: Rect;
    rawSVGElementToWrapper: {
        [key: string]: Rect;
    };
    copiedNoteBuffer: NoteInfo[];
    containerElement: HTMLElement | null;
    containerElementId: any;
    temporaryMouseMoveHandler?: (event: MouseEvent) => void;
    mousePosition: {
        x: number;
        y: number;
    };
    playHandler: any;
    noteOnOffHandler: any;
    wIsDown: any;
    debugCircle0: Circle;
    debugCircle1: Circle;
    constructor(containerElementId: string, playHandler: () => void, noteOnOffHandler: () => void);
    drawBackgroundAndCursor(): void;
    addNote(pitch: number, position: number, duration: number, avoidHistoryManipulation?: boolean): string;
    deleteElement(elem: Rect): void;
    deleteElements(elements: Set<Rect>): void;
    getNoteData(): {
        pitch: number;
        position: number;
        duration: number;
    }[];
    setNoteData(noteData: NoteInfo[]): void;
    setViewportToShowAllNotes(): void;
    updateNoteInfo(note: Note, calledFromBatchUpdate: boolean): void;
    updateNoteInfoMultiple(notes: Note[]): void;
    updateNoteElement(nt: Note, position: number, pitch: number, duration: number): void;
    updateNoteElemScreenCoords(nt: Note, x?: number, y?: number, width?: number, persistData?: boolean, calledFromBatchUpdate?: boolean): void;
    svgMouseCoord(evt: MouseEvent): DOMPoint;
    svgYtoPitch(yVal: number): number;
    svgXtoPosition(xVal: number): number;
    svgXYtoPitchPos(xVal: number, yVal: number): {
        pitch: number;
        position: number;
    };
    svgXYtoPitchPosQuant(xVal: number, yVal: number): {
        pitch: number;
        position: number;
    };
    getMouseDelta(event: MouseEvent, root: MouseMoveRoot): {
        x: number;
        y: number;
    };
    resetMouseMoveRoot(event: MouseEvent): void;
    mouseScrollHandler(event: MouseEvent): void;
    mouseZoomHandler(event: MouseEvent): void;
    keydownHandler(event: KeyboardEvent): void;
    keyupHandler(event: KeyboardEvent): void;
    copyNotes(): void;
    pasteNotes(): void;
    shiftNotesPitch(shiftAmount: number): void;
    shiftNotesTime(shiftAmount: number): void;
    snapshotNoteState(): void;
    executeUndo(): void;
    executeRedo(): void;
    restoreNoteState(histIndex: number): void;
    midiPitchToPitchString(pitch: number): string;
    svgYToPitchString(yVal: number): string;
    refreshNoteModStartReference(noteIds: string[]): void;
    getNotesAtPosition(pos: number): Note[];
    checkIfNoteMovedSignificantly(noteElement: Rect, thresh: number): boolean;
    checkIfNoteResizedSignificantly(noteElement: Rect, thresh: number): boolean;
    initializeNoteModificationAction(element?: Rect): void;
    updateNoteStateOnModificationCompletion(): void;
    endSelect(): void;
    endDrag(): void;
    endResize(): void;
    startDragSelection(dragStart: DOMPoint): void;
    attachHandlersOnBackground(backgroundElements_: Set<Element>, _: Svg): void;
    populateSpatialNoteTracker(): void;
    executeOverlapVisibleChanges(): void;
    setDifference<T>(setA: Set<T>, setB: Set<T>): Set<T>;
    isDragOutOfBounds(): void;
    isResizeOutOfBounds(): void;
    attachHandlersOnNote(note: Note, svgParentObj: Svg): void;
    selectNote(noteElem: Rect): void;
    deselectNote(noteElem: Rect): void;
    selectRectIntersection(noteElem: Rect): boolean;
    boxIntersect(noteBox: Box, selectBox: Box): boolean;
    clearNoteSelection(): void;
}
export {};
