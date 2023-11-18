export declare abstract class Entity {
    type: string;
    id: number;
    protected static idGenerator: number;
    private createId;
    constructor(createId?: boolean);
    parent: Entity | null;
    children(): Entity[];
    findInDescendants<T extends Entity>(type: new () => T): T[];
    findInAncestors<T extends Entity>(type: new () => T): T[];
    abstract serialize(): any;
    abstract hydrate(serialized: object): void;
    deserialize(serialized: object): this;
}
declare class Command {
    name: string;
    undo(): void;
    redo(): void;
    constructor(name: string, undo: () => void, redo: () => void);
}
declare class CommandHistory {
    history: Command[];
    index: number;
    add(command: Command): void;
    undo(): void;
    redo(): void;
}
export declare const commandHistory: CommandHistory;
export declare class UndoableList<T> {
    list: T[];
    pushItem(item: T): void;
    setItem(item: T, index: number): void;
    removeItem(index: number): void;
    moveItem(oldIndex: number, newIndex: number): void;
}
type Constructor<T> = new (...args: any[]) => T;
export declare class EntityList<T extends Entity> extends Entity implements UndoableList<T> {
    type: string;
    list: T[];
    private ctor;
    children(): Entity[];
    constructor(ctor: Constructor<T>, createId?: boolean);
    pushItem(item: T): void;
    setItem(item: T, index: number): void;
    removeItem(index: number): void;
    moveItem(oldIndex: number, newIndex: number): void;
    serialize(): any[];
    hydrate(serialized: object): void;
}
export declare class Transport {
    playhead: number;
    isPlaying: boolean;
    length: number;
    extraField: boolean;
    private lastUpdateTimestamp;
    play(): void;
    stop(): void;
    setPlayhead(v: number): void;
    update(timeStamp: number): void;
    start(): void;
    rawStart(): void;
}
export {};
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
