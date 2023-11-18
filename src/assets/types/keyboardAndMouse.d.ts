import type p5 from "p5";
export declare function clearListeners(): void;
export declare function keydownEvent(listener: (ev: KeyboardEvent) => void, target?: HTMLElement): void;
export declare function singleKeydownEvent(key: string, listener: (ev: KeyboardEvent) => void, target?: HTMLElement): void;
export declare function keyupEvent(listener: (ev: KeyboardEvent) => void, target?: HTMLElement): void;
export declare function mousemoveEvent(listener: (ev: MouseEvent) => void, target?: HTMLElement): void;
export declare function mousedownEvent(listener: (ev: MouseEvent) => void, target?: HTMLElement): void;
export declare function mouseupEvent(listener: (ev: MouseEvent) => void, target?: HTMLElement): void;
export declare function targetNormalizedCoords(ev: MouseEvent, target?: HTMLElement): {
    x: number;
    y: number;
};
export declare function targetToP5Coords(ev: MouseEvent, p: p5, target?: HTMLElement): {
    x: number;
    y: number;
};
