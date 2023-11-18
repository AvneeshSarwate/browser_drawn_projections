import p5 from 'p5';
import type { AnimationSeq } from './planeAnimations';
import { Entity, EntityList, UndoableList } from '@/stores/undoCommands';
export type DrawMode = 'display' | 'addingPoint' | 'movingPoint';
type RegionSerialized = {
    points: ({
        x: number;
        y: number;
    })[];
    color: {
        r: number;
        g: number;
        b: number;
    };
    id: number;
};
export declare class Region extends Entity {
    points: UndoableList<p5.Vector>;
    color: {
        r: number;
        g: number;
        b: number;
    };
    type: string;
    grabPointIdx: number | undefined;
    drawMode: DrawMode;
    animationStartTime: number;
    animationSeq: AnimationSeq | undefined;
    visible: boolean;
    debug: boolean;
    get isActive(): boolean;
    constructor(createId?: boolean);
    serialize(): RegionSerialized;
    hydrate(serialized: object): void;
    drawDebugText(p5Instance: p5): void;
    drawPoints(p5Instance: p5, pts: p5.Vector[]): void;
    setDebugStyle(p5Instance: p5): void;
    drawBaseStyle(p5Instance: p5, pts: p5.Vector[]): void;
    display(p5Instance: p5): void;
    drawWhileAddingPoint(p5Instance: p5, point: p5.Vector): void;
    drawWhileMovingPoint(p5Instance: p5, point: p5.Vector, grabbedPointIdx: number): void;
    setStyle(p5Instance: p5): void;
    resetDrawState(): void;
    activate(): this;
    draw(p5inst: p5): void;
    draw2: ((reg: Region, p5: p5) => void) | undefined;
    drawDefault(p5Instance: p5): void;
}
export declare function findClosestPointAndRegion(p5Instance: p5, regions: EntityList<Region>): [number, Region] | undefined;
export declare const stats: any;
export type DevelopmentAppState = {
    regions: EntityList<Region>;
    p5Instance: p5 | undefined;
    threeRenderer: THREE.WebGLRenderer | undefined;
    codeStack: (() => void)[];
    codeStackIndex: number;
    drawFunctions: ((p5: p5) => void)[];
    drawFuncMap: Map<string, (p5: p5) => void>;
    paused: boolean;
};
export declare const appState: DevelopmentAppState;
export {};
