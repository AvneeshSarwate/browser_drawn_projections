
//todo note - for some reason, you need to remove the export that precedes the declare
// in order for it to work. I think this is because the export is not part of the
// declaration, but rather a separate statement that is not allowed in a declaration?

export const channelDefs = `
declare function defineCallback<T>(cb: (block: (ctx: TimeContext) => Promise<T>) => CancelablePromisePoxy<T>): void;

 declare class CancelablePromisePoxy<T> implements Promise<T> {
  promise?: Promise<T>;
  abortController: AbortController;
  constructor(ab: AbortController);
  cancel(): void;
  [Symbol.toStringTag]: string;
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): Promise<T>;
}
 declare function launch<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromisePoxy<T>;
 declare abstract class TimeContext {
  abortController: AbortController;
  time: number;
  startTime: number;
  isCanceled: boolean;
  get progTime(): number;
  constructor(time: number, ab: AbortController);
  branch<T>(block: (ctx: ToneTimeContext) => Promise<T>): void;
  branchWait<T>(block: (ctx: ToneTimeContext) => Promise<T>): CancelablePromisePoxy<T>;
  abstract wait(sec: number): Promise<void>;
  waitFrame(): Promise<void>;
}
declare class ToneTimeContext extends TimeContext {
  wait(sec: number): Promise<void>;
}
 declare const testCancel: () => Promise<void>;
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
 declare class Ramp implements Envelope {
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
 declare const now: () => number;
 declare class EventChop<T> {
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
 declare const sinN: (phase: number) => number;
 declare const cosN: (phase: number) => number;
 declare const sin: (phase: number) => number;
 declare const cos: (phase: number) => number;
 declare const tri: (phase: number) => number;
 declare const saw: (phase: number) => number;
 declare const xyZip: (phase: number, xPat: (phase: number) => number, yPat: (phase: number) => number, count?: number, cycles?: number) => {
  x: number;
  y: number;
}[];
 declare const steps: (start: number, end: number, count: number) => number[];
 {};
`

export const channelModDefs = `
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
  branch<T>(block: (ctx: ToneTimeContext) => Promise<T>): void;
  branchWait<T>(block: (ctx: ToneTimeContext) => Promise<T>): CancelablePromisePoxy<T>;
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
export declare const chanExports: {
  CancelablePromisePoxy: typeof CancelablePromisePoxy;
  launch: typeof launch;
  testCancel: () => Promise<void>;
  EventChop: typeof EventChop;
  Ramp: typeof Ramp;
  sinN: (phase: number) => number;
};
export declare const chanExpandString: string;
export {};

`

/*
chatGPT explanation for why export needs to be removed:

question: in the monaco editor, when using a d.ts file to add typings via the 
  method monaco.languages.typescript.typescriptDefaults.addExtraLib(), having 
  the export statement before the declare doesn't work. why would this be?

Answer:

The behavior you're experiencing in the Monaco Editor, where using an `export` statement before `declare` in a `.d.ts` file added via `monaco.languages.typescript.typescriptDefaults.addExtraLib()` doesn't work as expected, is likely due to the way Monaco Editor handles modules and global declarations.

In TypeScript, there is a distinction between module and global scope:

1. **Module Scope**: If a file contains top-level `import` or `export` statements, TypeScript treats it as a module. Everything in a module is scoped to that module unless explicitly exported.

2. **Global Scope**: If a file does not have top-level `import` or `export` statements, TypeScript treats it as a global script file. Declarations in this file are in the global scope.

When you use `monaco.languages.typescript.typescriptDefaults.addExtraLib()` to add a `.d.ts` file, it's generally intended to declare global types, interfaces, or functions that should be available across the entire scope of the Monaco Editor instance. This means they are expected to be in the global scope.

By adding an `export` statement:

- You shift the context of the file to a module scope.
- Consequently, the types or interfaces declared in this file are no longer injected into the global namespace, but rather, they are scoped to the module represented by this file.
- This behavior results in the declarations not being globally accessible as you might expect when used in Monaco Editor.

If you need to use module-scoped declarations (with `export`), you would typically import them explicitly in the parts of your code where they are required. However, this might not align well with how Monaco Editor is used, especially if it's meant to provide a global set of types for a broader range of scripts.

For global declarations in Monaco Editor, you would typically omit the `export` keyword, ensuring the declarations are in the global scope and accessible across all scripts in the editor without needing an import statement.

*/