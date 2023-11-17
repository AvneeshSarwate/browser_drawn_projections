

export const channelSrc = `
export declare class CancelablePromisePoxy<T> implements Promise<T> {
  promise?: Promise<T>;
  abortController: AbortController;
  constructor(ab: AbortController);
  cancel(): void;
  [Symbol.toStringTag]: string;
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): Promise<T>;
}
export declare function launch<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromisePoxy<T>;
export declare abstract class TimeContext {
  abortController: AbortController;
  time: number;
  startTime: number;
  isCanceled: boolean;
  get progTime(): number;
  constructor(time: number, ab: AbortController);
  branch<T>(block: (ctx: ToneTimeContext) => Promise<T>): CancelablePromisePoxy<T>;
  abstract wait(sec: number): Promise<void>;
  waitFrame(): Promise<void>;
}
declare class ToneTimeContext extends TimeContext {
  wait(sec: number): Promise<void>;
}
export declare const testCancel: () => Promise<void>;
interface Envelope {
  hold(time?: number): Envelope;
  release(time?: number): Envelope;
  trigger(time?: number): Envelope;
  val(time?: number): number;
  onFinish?: () => void;
  cancel: () => void;
  releaseDur: number;
  isHeld: boolean;
  onTime: number;
  releaseTime: number;
  started: boolean;
}
export declare class Ramp implements Envelope {
  releaseDur: number;
  isHeld: boolean;
  onTime: number;
  releaseTime: number;
  started: boolean;
  constructor(releaseDur: number);
  scheduleReleaseCallback(): void;
  onFinish?: () => void;
  cancel(): void;
  hold(time?: number): this;
  release(time?: number): this;
  trigger(time?: number): this;
  val(time?: number): number;
}
export declare const now: () => number;
export declare class EventChop<T> {
  idGen: number;
  events: ({
      evt: Envelope;
      metadata: T;
      id: number;
  })[];
  newEvt(evt: Envelope, metadata: T): void;
  ramp(time: number, metadata: T): Ramp;
  samples(): (T & {
      evtId: number;
      val: number;
  })[];
}
/**
* what people want out of node based systems is to be able to easily see
* high level data flow, CORE STATE (eg, separating "things" and "transforms on things"),
* and to be able to have a formal notion of PROGRESSION OF TIME
*
* can still have your code-based-node system work with callbacks,
* (e.g, "fluent api" with chains of provided callbacks at each processing step)
* just name your callbacks and pass in the variables instead of
* defining them all inline. Makes the code cleaner
*
* being able to define functions is auto-componentization - many of the
* nodes in a node graph are getting around things that are 1 line of code.
* in building a "node graph like" code system, don't try to duplicate
* nodes specifically, try to duplicate the "feel" of the node graph:
* - easy to see high level data flow
* - easy to see core state
* - easy to see progression of time
* If you define good APIs for core functions and hooks, as well as good utilities,
* you don't actually need to implement many nodes at all
*
* even "opening a menu of a node object" can be simulated by cmd-clicking to
* go to the place where the arguments-variable is defined
*/
export declare const sinN: (phase: number) => number;
export declare const cosN: (phase: number) => number;
export declare const sin: (phase: number) => number;
export declare const cos: (phase: number) => number;
export declare const tri: (phase: number) => number;
export declare const saw: (phase: number) => number;
export declare const xyZip: (phase: number, xPat: (phase: number) => number, yPat: (phase: number) => number, count?: number, cycles?: number) => {
  x: number;
  y: number;
}[];
export declare const steps: (start: number, end: number, count: number) => number[];
export {};
`
