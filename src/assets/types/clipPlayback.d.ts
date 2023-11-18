type Instrument = {
    triggerAttackRelease: (pitch: number, duration: number, time?: number, velocity?: number) => void;
};
export declare function note(synth: Instrument, pitch: number, duration: number, velocity?: number): void;
export type Clip = {
    time: number;
    pitch: number;
    duration: number;
    velocity: number;
}[];
export declare function clipToDeltas(clip: Clip, totalTime?: number): number[];
export declare const listToClip: (pitches: number[], stepTime?: number, dur?: number, vel?: number) => Clip;
export declare function playClip(clip: Clip, synth: Instrument): void;
export {};
