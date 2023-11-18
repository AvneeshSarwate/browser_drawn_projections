import type { Region } from './developmentAppState';
import p5 from 'p5';
export declare function lrLine(duration: number): AnimationSegment;
export declare function rlLine(duration: number): AnimationSegment;
export declare function tbLine(duration: number): AnimationSegment;
export declare function btLine(duration: number): AnimationSegment;
export declare function zoomIn(duration: number): AnimationSegment;
export declare function zoomOut(duration: number): AnimationSegment;
export declare class PerimiterDots {
    region: Region;
    numDots: number;
    private sideLengthsRunningSum;
    private sideLengths;
    constructor(region: Region, numDots: number);
    initMetadata(): void;
    getDot(phase: number): p5.Vector;
    draw(p5Instance: p5, phase: number): void;
    anim(duration: number): AnimationSegment;
}
export declare class AnimationSegment {
    duration: number;
    phaseDraw: (p5i: p5, region: Region, phase: number) => void;
    constructor(phaseDraw: (p5i: p5, region: Region, phase: number) => void, duration: number);
}
export declare class AnimationSeq {
    segments: AnimationSegment[];
    constructor(segDefs: AnimationSegment[]);
    draw(p5i: p5, r: Region, animStart: number, time: number): void;
}
