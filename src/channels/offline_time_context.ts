/* eslint-disable no-constant-condition */
// deno-lint-ignore-file no-explicit-any no-unused-vars no-this-alias require-await


// chat for implementing/fixing offline mode - https://chatgpt.com/c/69343bfc-5394-832f-a246-c0be525623fd

/**
 * Timing Engine v2 — Architecture, Semantics, and Invariants
 * =========================================================
 *
 * Overview
 * --------
 * This module implements a deterministic “logical-time” timing engine with:
 * - drift-free waits (time & beats)
 * - structured concurrency (branch / branchWait, cancellation cascades)
 * - interactive tempo changes (wait(beats) retimes automatically)
 * - dual execution modes:
 *     (1) realtime: driven by wall clock using setTimeout / RAF
 *     (2) offline: driven by an explicit stepping API (OfflineRunner), enabling faster-than-realtime rendering
 *
 * The key idea: user code never sleeps “for N ms”. Instead it sleeps until an *absolute logical deadline*.
 * Logical time is advanced in discrete *timeslices* determined by the earliest pending deadline(s).
 *
 *
 * Goals
 * -----
 * 1) Drift-free timing:
 *    - setTimeout jitter should not accumulate across repeated waits.
 *    - Logical time should advance exactly to the intended target times.
 *
 * 2) Consistent concurrency:
 *    - If two coroutines schedule waits at T=0.1 and T=0.2, the 0.1 wait must resolve first.
 *    - Parallel branches can run independently without forcing parent context time forward unless joined.
 *
 * 3) Tempo-aware beat timing:
 *    - wait(beats) should be stable under bpm changes.
 *    - bpm changes should not require rescheduling every pending beat waiter (head-only retiming).
 *
 * 4) Unified scheduler across modes:
 *    - The same scheduling algorithm resolves logical timeslices in both realtime and offline.
 *    - The difference is only “how do we wake up to process the next due timeslice?”
 *
 * 5) Ergonomic offline rendering:
 *    - OfflineRunner can step time or frames and run the same timed code without wall-clock delays.
 *
 *
 * Capabilities / Public API Summary
 * --------------------------------
 * - launch(fn): create a root DateTimeContext in realtime (setTimeout-only, works everywhere).
 * - launchBrowser(fn): create a root BrowserTimeContext in realtime with waitFrame() (browser only).
 * - OfflineRunner(fn): create an OfflineTimeContext plus stepping methods:
 *     - stepSec(dt): advance offline logical time by dt seconds (processes all due waits)
 *     - stepFrame(): advance by 1/fps and resolve waitFrame() waiters
 *
 * Context API:
 * - ctx.waitSec(seconds): drift-free wait in seconds
 * - ctx.wait(beats): wait in beats under a variable TempoMap (retimes under bpm changes)
 * - ctx.branch(fn): spawn a child task that does NOT advance parent ctx.time on completion
 * - ctx.branchWait(fn): spawn a child task that DOES update parent ctx.time on completion
 * - ctx.cancel(): cancel this context and its entire subtree
 * - ctx.setBpm(bpm): interactive tempo change (stamped at “root current time”)
 * - ctx.rampBpmTo(bpm, durSec): optional tempo ramp helper
 *
 *
 * Key Concepts
 * ------------
 * Logical time:
 * - Each TimeContext has `ctx.time` (logical seconds).
 * - Logical time progresses only when waits resolve; it is NOT wallNow().
 *
 * Root context:
 * - Each context tree has one root context.
 * - The root stores global scheduling state needed to keep parallel coroutines consistent.
 *
 * root.mostRecentDescendentTime:
 * - The root tracks the maximum logical time reached by any descendant.
 * - This enforces the “no drift / constant alignment” property:
 *     BaseTime = max(root.mostRecentDescendentTime, ctx.time)
 *     TargetTime = BaseTime + delta
 *   so if wall-clock is late, subsequent waits get shorter wall delays.
 *
 * Scheduler:
 * - One TimeScheduler per root context.
 * - It owns:
 *   - timePQ: min-heap for time-based waits by absolute targetTime
 *   - beatPQs: map tempoId -> min-heap for beat waits by absolute targetBeat
 *   - tempoHeadPQ: min-heap of “head waiter due-time per tempo” (derived from beatPQs)
 *   - frameWaiters: set of waitFrame waiters (resolved at RAF ticks or offline frame ticks)
 *
 *
 * Wait Semantics
 * -------------
 * waitSec(sec):
 * - Computes absolute logical deadline:
 *     baseTime = max(root.mostRecentDescendentTime, ctx.time)
 *     targetTime = baseTime + clamp(sec, >= 0)
 * - Schedules a waiter in timePQ at deadline = targetTime.
 * - When the scheduler processes that deadline, it sets:
 *     ctx.time = max(ctx.time, targetTime)
 *     root.mostRecentDescendentTime = max(root.mostRecentDescendentTime, ctx.time)
 *
 * wait(beats):
 * - Schedules in beat-space, not “beats converted to seconds once”.
 * - Computes:
 *     baseTime  = max(root.mostRecentDescendentTime, ctx.time)
 *     baseBeats = tempo.beatsAtTime(baseTime)
 *     targetBeat = baseBeats + beats
 * - Inserts into beatPQs[tempoId] by targetBeat.
 * - The scheduler keeps exactly one entry per tempo in tempoHeadPQ:
 *     dueTime = tempo.timeAtBeats(beatPQs[tempoId].peek().targetBeat)
 *     tempoHeadPQ stores (tempoId, dueTime)
 *
 * Tempo changes:
 * - setBpm writes to the TempoMap at:
 *     t = root.mostRecentDescendentTime
 *   This “root current time” definition is critical:
 *   - robust in offline mode even when offline stepping jumps forward
 *   - insensitive to microtask ordering differences
 * - After a tempo change, only that tempoId’s head dueTime is recomputed (refreshTempoHead()).
 *
 *
 * Structured Concurrency Semantics
 * -------------------------------
 * branch(fn):
 * - Creates a new child context whose initial time is root.mostRecentDescendentTime (align to global).
 * - Runs fn(childCtx) concurrently.
 * - Does NOT update parentCtx.time when the branch finishes.
 * - Returns a handle with cancel() and finally().
 *
 * branchWait(fn):
 * - Creates a new child context whose initial time is parentCtx.time.
 * - Runs fn(childCtx) concurrently.
 * - On completion, parentCtx.time is updated to:
 *     parentCtx.time = max(parentCtx.time, childCtx.time)
 *   (this is applied in a finally, and is designed for structured “join” semantics).
 *
 * Cancellation:
 * - Each context has an AbortController.
 * - ctx.cancel() aborts itself and recursively cancels all child contexts.
 * - wait primitives attach abort listeners and remove them on resolve/cancel.
 *
 *
 * Offline vs Realtime — Why the Same Scheduler Works
 * --------------------------------------------------
 * The scheduler core is the same in both modes:
 * - It repeatedly chooses the next logical deadline (min(timePQ.head, tempoHeadPQ.head)).
 * - It processes *one logical timeslice at that deadline*:
 *     - resolve all time waiters whose targetTime == deadline
 *     - OR resolve all beat waiters at the earliest targetBeat for the earliest tempoHead
 * - It updates ctx.time and root.mostRecentDescendentTime.
 *
 * The *only* difference between modes is “how do we wake up to process the next slice?”
 *
 * Realtime wakeup:
 * - scheduleNext() arms one setTimeout to the earliest next logical due time.
 * - When setTimeout fires, we process exactly one timeslice.
 * - If more due timeslices exist immediately, we do NOT recurse via microtasks.
 *   Instead we queue the next pump on a macrotask, ensuring promise continuations (microtasks)
 *   complete before advancing logical time again.
 *
 * Offline wakeup:
 * - advanceTo(targetTime) is called by OfflineRunner.
 * - It processes all timeslices with deadlines <= targetTime.
 * - Crucially, offline must emulate realtime event loop semantics:
 *   after each timeslice, it yields to a macrotask so the runtime drains microtasks
 *   (Promise continuations / .finally / Promise.all chains / barrier logic).
 * - Without macrotask yields, offline can advance to later timeslices before user continuations
 *   from earlier slices have scheduled their next waits, breaking semantics.
 *
 *
 * Core Algorithm (Pseudo / Dataflow)
 * ---------------------------------
 *
 * Data structures:
 *   timePQ:        min-heap keyed by absolute targetTime (sec)
 *   beatPQs:       map tempoId -> min-heap keyed by absolute targetBeat
 *   tempoHeadPQ:   min-heap keyed by derived dueTime (sec), metadata {tempoId}
 *   frameWaiters:  set of pending waitFrame waiters
 *
 * Common operation: schedule a wait
 *
 *   waitSec(ctx, sec):
 *     base = max(root.mostRecentDescendentTime, ctx.time)
 *     target = base + max(0, sec)
 *     timePQ.add(waitId, deadline=target, meta={ctx, target, resolve, reject, abortListener})
 *     requestPumpOrWake()
 *
 *   waitBeats(ctx, beats):
 *     baseT = max(root.mostRecentDescendentTime, ctx.time)
 *     baseB = tempo.beatsAtTime(baseT)
 *     targetB = baseB + beats
 *     beatPQs[tempoId].add(waitId, deadline=targetB, meta={ctx, tempo, targetB, ...})
 *     refreshTempoHead(tempoId) // compute dueTime from head targetBeat
 *     requestPumpOrWake()
 *
 * Common operation: processing one timeslice (the heart of the engine)
 *
 *   processOneTimeslice():
 *     tTime = timePQ.peek()?.deadline ?? +Inf
 *     tBeat = tempoHeadPQ.peek()?.deadline ?? +Inf
 *     t = min(tTime, tBeat)
 *
 *     if t == tTime:
 *        batch = pop all from timePQ with deadline == t
 *        for each waiter:
 *          if canceled -> reject
 *          else:
 *            waiter.ctx.time = max(waiter.ctx.time, waiter.targetTime)
 *            root.mostRecentDescendentTime = max(root.mostRecentDescendentTime, waiter.ctx.time)
 *            resolve waiter
 *
 *     else: // t == tBeat
 *        tempoId = tempoHeadPQ.peek().tempoId
 *        headBeatWait = beatPQs[tempoId].peek()
 *        dueTime = headBeatWait.tempo.timeAtBeats(headBeatWait.targetBeat)
 *        batch = pop all beat waiters with same targetBeat
 *        pop tempoHeadPQ entry (will refresh)
 *        for each waiter:
 *          if canceled -> reject
 *          else:
 *            waiter.ctx.time = max(waiter.ctx.time, dueTime)
 *            root.mostRecentDescendentTime = max(root.mostRecentDescendentTime, waiter.ctx.time)
 *            resolve waiter
 *        refreshTempoHead(tempoId)
 *
 * Realtime driver:
 *   - after processOneTimeslice, if next slice is already due, schedule the next pump on a macrotask.
 *   - otherwise arm setTimeout to next due time.
 *
 * Offline driver:
 *   advanceTo(target):
 *     while peekNextEventTime() <= target:
 *       offlineNow = nextEventTime
 *       processOneTimeslice()
 *       await nextMacrotask() // emulate realtime microtask checkpoint boundary
 *     offlineNow = target
 *     await nextMacrotask() // flush any remaining .finally / Promise.all microtasks
 *
 *
 * Invariants / Assumptions (Important)
 * ------------------------------------
 * 1) Timeslice ordering:
 *    The scheduler must not process timeslice T2 > T1 until all promise continuations spawned
 *    by resolving timeslice T1 have run and had the chance to schedule new waits <= T2.
 *
 *    Implementation requirement:
 *    - Realtime: schedule subsequent pumps in a macrotask (not a microtask).
 *    - Offline: yield to a macrotask between timeslices.
 *
 * 2) No drift:
 *    - waitSec uses baseTime=max(root.mostRecentDescendentTime, ctx.time)
 *    - ctx.time and root.mostRecentDescendentTime only ever move forward (monotonic)
 *
 * 3) Tempo edits are applied at “root current time”:
 *    - setBpm stamps at root.mostRecentDescendentTime (not scheduler.now()).
 *    - This avoids offline stamping at “advance target” and avoids realtime stamping at “wall jitter now”.
 *
 * 4) Equality handling:
 *    - Waiters are batched by exact equality of deadlines (time) or targetBeat (beats).
 *    - Ordering among events with the same deadline is deterministic but arbitrary.
 *      Avoid relying on any specific order beyond stability.
 *
 * 5) External awaits:
 *    - Awaiting arbitrary promises (fetch, random timers, etc.) can resume a coroutine outside
 *      the scheduler’s control and break logical-time semantics.
 *    - Guideline: only await engine waits/barriers for logical scheduling.
 *
 *
 * Gotchas / Practical Notes
 * -------------------------
 * - wait(0) / waitSec(0):
 *   - Allowed as a sync/yield point, but should not be used in tight loops.
 *   - In a timing engine, “yield points” that are invisible to the scheduler can cause offline stepping
 *     to return early. If you want a reliable yield, prefer making it scheduler-visible.
 *
 * - OfflineRunner.stepSec(dt) vs stepFrame():
 *   - stepSec() resolves time/beat waits only.
 *   - waitFrame() is resolved only by stepFrame() (or resolveFrameTick()).
 *
 * - Cancellation:
 *   - Cancel cascades to children via ctx.cancel() recursion.
 *   - Ensure abort listeners are removed on resolve/cancel to prevent leaks.
 *
 * - Barriers:
 *   - Barriers must be scoped per root context (keyed by rootId + user key) to avoid bleed
 *     between multiple roots (e.g. offline + realtime test runs in one process).
 *
 * - Determinism:
 *   - Offline mode can be deterministic given deterministic user code.
 *   - Realtime mode is inherently nondeterministic at micro-resolution due to setTimeout jitter,
 *     but logical times (ctx.time) remain exact.
 *
 * - Performance:
 *   - Beat waiters retime efficiently (head-only). Many tempo changes per second are possible,
 *     but extremely high-rate tempo modulation may still be heavy; use user guidance or coarser updates.
 */



import { PriorityQueue } from "@/stores/priorityQueue";
import seedrandom from "seedrandom";

export type RandomSeed = string | number;

function normalizeSeed(seed?: RandomSeed): string {
  if (seed === undefined || seed === null) return crypto.randomUUID();
  return typeof seed === "string" ? seed : String(seed);
}

// Deterministic child seed derivation (no wall-clock or random UUIDs).
function deriveSeed(parentSeed: string, forkIndex: number): string {
  return `${parentSeed}::fork:${forkIndex}`;
}

// A "macrotask yield" primitive.
// This is the rigorous way to ensure the JS runtime drains the microtask queue to empty,
// matching realtime behavior (microtask checkpoint after each timer callback).
const yieldToMacrotask: () => Promise<void> = (() => {
  const g: any = globalThis as any;

  if (typeof g.setImmediate === "function") {
    return () => new Promise<void>((res) => g.setImmediate(res));
  }

  if (typeof MessageChannel !== "undefined") {
    const mc = new MessageChannel();
    const q: Array<() => void> = [];

    mc.port1.onmessage = () => {
      const fn = q.shift();
      if (fn) fn();
    };
    // Some runtimes require explicit start() on MessagePort.
    (mc.port1 as any).start?.();

    return () =>
      new Promise<void>((res) => {
        q.push(res);
        mc.port2.postMessage(0);
      });
  }

  // Last resort. May be clamped (e.g. to 1ms) in some environments.
  return () => new Promise<void>((res) => setTimeout(res, 0));
})();

// Schedule a callback in the next macrotask (no real-time delay intended).
// This gives the runtime a microtask checkpoint boundary (drains Promise reactions),
// which is essential for deterministic ordering between logical timeslices.
const scheduleMacrotask: (cb: () => void) => void = (() => {
  const g: any = globalThis as any;

  // Node.js / some runtimes
  if (typeof g.setImmediate === "function") {
    return (cb) => g.setImmediate(cb);
  }

  // Browsers / modern runtimes (fast, not clamped like setTimeout(0) often is)
  if (typeof MessageChannel !== "undefined") {
    const mc = new MessageChannel();
    const q: Array<() => void> = [];
    mc.port1.onmessage = () => {
      const fn = q.shift();
      if (fn) fn();
    };
    (mc.port1 as any).start?.();
    return (cb) => {
      q.push(cb);
      mc.port2.postMessage(0);
    };
  }

  // Fallback
  return (cb) => setTimeout(cb, 0);
})();

/* ---------------------------------------------------------------------------------------------- */
/* Wall clock utility                                                                              */
/* ---------------------------------------------------------------------------------------------- */

const wallStart = performance.now() / 1000;
export const wallNow = () => performance.now() / 1000 - wallStart;

/* ---------------------------------------------------------------------------------------------- */
/* Cancelable promise proxy                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export class CancelablePromiseProxy<T> implements Promise<T> {
  public promise?: Promise<T>;
  public abortController: AbortController;
  public timeContext?: TimeContext;

  constructor(ab: AbortController) {
    this.abortController = ab;
  }

  public cancel() {
    this.abortController.abort();
    this.timeContext?.cancel();
  }

  [Symbol.toStringTag] = "[object CancelablePromiseProxy]";

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise!.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<T | TResult> {
    return this.promise!.catch(onrejected);
  }

  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.promise!.finally(onfinally);
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Tempo map (piecewise-linear BPM over time)                                                      */
/* ---------------------------------------------------------------------------------------------- */

type TempoSegment = {
  t0: number; // start time (sec)
  t1: number; // end time (sec) (Infinity allowed)
  bpm0: number; // bpm at t0
  bpm1: number; // bpm at t1
  beats0: number; // beats at t0
  beats1: number; // beats at t1 (Infinity allowed)
};

function clampPos(x: number) {
  return Number.isFinite(x) && x > 0 ? x : 1;
}

export class TempoMap {
  public readonly id: string;
  public version = 0;

  private segs: TempoSegment[];

  constructor(initialBpm = 60) {
    const bpm = clampPos(initialBpm);
    // Anchor at time 0 to mimic your original "time since module start" model.
    this.id = crypto.randomUUID();
    this.segs = [{
      t0: 0,
      t1: Infinity,
      bpm0: bpm,
      bpm1: bpm,
      beats0: 0,
      beats1: Infinity,
    }];
  }

  public clone(): TempoMap {
    const t = new TempoMap(60);
    // preserve id uniqueness for the clone
    (t as any).id = crypto.randomUUID();
    (t as any).segs = this.segs.map((s) => ({ ...s }));
    t.version = this.version;
    return t;
  }

  public bpmAtTime(t: number): number {
    const s = this.segmentAtTime(t);
    if (!s) return this.segs[this.segs.length - 1].bpm1;
    if (!Number.isFinite(s.t1) || s.t1 === s.t0) return s.bpm0;
    const a = (t - s.t0) / (s.t1 - s.t0);
    return s.bpm0 + (s.bpm1 - s.bpm0) * a;
  }

  public beatsAtTime(t: number): number {
    const s = this.segmentAtTime(t);
    if (!s) {
      // before first segment start (shouldn't happen with t0=0)
      return 0;
    }
    const dt = Math.max(0, t - s.t0);
    const L = s.t1 - s.t0;
    const k = (Number.isFinite(L) && L > 0) ? (s.bpm1 - s.bpm0) / L : 0;
    // beats added over dt: (bpm0*dt + 0.5*k*dt^2)/60
    return s.beats0 + (s.bpm0 * dt + 0.5 * k * dt * dt) / 60;
  }

  public timeAtBeats(targetBeats: number): number {
    if (!Number.isFinite(targetBeats)) return Infinity;
    if (targetBeats <= 0) return 0;

    // Find the first segment whose beats1 >= targetBeats
    let lo = 0;
    let hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const b1 = this.segs[mid].beats1;
      if (b1 >= targetBeats) hi = mid;
      else lo = mid + 1;
    }

    const s = this.segs[lo];
    const beatsDelta = targetBeats - s.beats0;
    if (beatsDelta <= 0) return s.t0;

    const L = s.t1 - s.t0;
    const k = (Number.isFinite(L) && L > 0) ? (s.bpm1 - s.bpm0) / L : 0;

    if (Math.abs(k) < 1e-12) {
      // constant bpm
      const bpm = clampPos(s.bpm0);
      return s.t0 + (beatsDelta * 60) / bpm;
    }

    // Solve: 0.5*k*dt^2 + bpm0*dt - beatsDelta*60 = 0
    const bpm0 = s.bpm0;
    const C = beatsDelta * 60;
    const disc = bpm0 * bpm0 + 2 * k * C;
    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    const dt = (-bpm0 + sqrtDisc) / k; // correct root for monotonic positive bpm segments
    return s.t0 + Math.max(0, dt);
  }

  /** Public API: set BPM "now" (time argument intentionally not exposed). */
  public _setBpmAtTime(bpm: number, t: number) {
    const newBpm = clampPos(bpm);
    const time = Math.max(0, t);

    const { bpmAtT, beatsAtT, segIndex } = this.splitAt(time);

    // Truncate everything after time, and end the current segment at time.
    this.segs = this.segs.slice(0, segIndex + 1);
    const s = this.segs[this.segs.length - 1];
    s.t1 = time;
    s.bpm1 = bpmAtT;
    s.beats1 = beatsAtT;

    // Add new constant segment starting at time.
    this.segs.push({
      t0: time,
      t1: Infinity,
      bpm0: newBpm,
      bpm1: newBpm,
      beats0: beatsAtT,
      beats1: Infinity,
    });

    this.version++;
  }

  /** Optional: smooth-ish ramp. (Not required by your current constraints, but useful.) */
  public _rampToBpmAtTime(targetBpm: number, durSec: number, t: number) {
    const endBpm = clampPos(targetBpm);
    const time = Math.max(0, t);
    const dur = Math.max(0, durSec);

    if (dur <= 0) {
      this._setBpmAtTime(endBpm, time);
      return;
    }

    const { bpmAtT, beatsAtT, segIndex } = this.splitAt(time);

    // Truncate, end current seg at time
    this.segs = this.segs.slice(0, segIndex + 1);
    const s = this.segs[this.segs.length - 1];
    s.t1 = time;
    s.bpm1 = bpmAtT;
    s.beats1 = beatsAtT;

    // Ramp segment [time, time+dur]
    const t1 = time + dur;
    const k = (endBpm - bpmAtT) / dur;
    const beats1 = beatsAtT + (bpmAtT * dur + 0.5 * k * dur * dur) / 60;

    this.segs.push({
      t0: time,
      t1,
      bpm0: bpmAtT,
      bpm1: endBpm,
      beats0: beatsAtT,
      beats1,
    });

    // Constant after ramp
    this.segs.push({
      t0: t1,
      t1: Infinity,
      bpm0: endBpm,
      bpm1: endBpm,
      beats0: beats1,
      beats1: Infinity,
    });

    this.version++;
  }

  private segmentAtTime(t: number): TempoSegment | null {
    if (t <= 0) return this.segs[0];
    // segments are ordered by t0; find last segment with t0 <= t
    let lo = 0;
    let hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = ((lo + hi + 1) >> 1);
      if (this.segs[mid].t0 <= t) lo = mid;
      else hi = mid - 1;
    }
    return this.segs[lo] ?? null;
  }

  /** Split the active segment at time t (conceptually), returning bpm/beats at t and segment index. */
  private splitAt(t: number): { bpmAtT: number; beatsAtT: number; segIndex: number } {
    const time = Math.max(0, t);
    const s = this.segmentAtTime(time)!;
    const segIndex = this.segs.indexOf(s);

    const beatsAtT = this.beatsAtTime(time);
    const bpmAtT = this.bpmAtTime(time);

    return { bpmAtT, beatsAtT, segIndex };
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Scheduler                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

type TimeWaitMeta = {
  kind: "time";
  seq: number;
  ctx: TimeContext;
  targetTime: number;
  resolve: () => void;
  reject: (e?: any) => void;
  abortListener: () => void;
};

type BeatWaitMeta = {
  kind: "beat";
  seq: number;
  ctx: TimeContext;
  tempo: TempoMap;
  targetBeat: number;
  resolve: () => void;
  reject: (e?: any) => void;
  abortListener: () => void;
};

type TempoHeadMeta = { tempoId: string };
type FrameWaitMeta = {
  seq: number;
  ctx: TimeContext;
  resolve: () => void;
  reject: (e?: any) => void;
  abortListener: () => void;
};

type SchedulerMode = "realtime" | "offline";

export class TimeScheduler {
  public readonly id = crypto.randomUUID();
  public readonly mode: SchedulerMode;

  // Most recent logical time-slice processed by the scheduler.
  // Used to deterministically stamp tempo writes that occur as immediate continuations of waits.
  private lastProcessedTime: number = 0;

  // True during the microtask phase immediately after processing a slice.
  // Cleared via queueMicrotask() after promise continuations for that slice run.
  private inTimesliceMicrotaskPhase: boolean = false;

  // Deterministic tie-break sequence for events scheduled in this root.
  private seqCounter = 0;


  private timePQ = new PriorityQueue<TimeWaitMeta>();
  private beatPQs = new Map<string, PriorityQueue<BeatWaitMeta>>();
  private tempoHeadPQ = new PriorityQueue<TempoHeadMeta>();

  private frameWaiters = new Map<string, FrameWaitMeta>();

  // realtime wake
  private timeoutId: number | null = null;
  private pumpQueued = false;

  // time dilation (realtime only)
  private rate = 1;
  private wallAnchor = wallNow();
  private logicalAnchor = 0;

  // offline clock
  private offlineNow = 0;

  // raf loop (browser only; used only if waitFrame is used)
  private rafRunning = false;
  private rafHandle: number | null = null;

  private pumpMacroQueued = false;


  constructor(mode: SchedulerMode, opts?: { rate?: number }) {
    this.mode = mode;
    if (mode === "realtime") {
      this.setRate(opts?.rate ?? 1);
      // initialize anchors so now() is stable from construction
      this.logicalAnchor = 0;
      this.wallAnchor = wallNow();
    } else {
      this.offlineNow = 0;
      this.rate = 1;
    }
  }

  /** Allocates a deterministic increasing sequence number. */
  public allocSeq(): number {
    return this.seqCounter++;
  }

  public now(): number {
    if (this.mode === "offline") return this.offlineNow;
    return this.logicalAnchor + (wallNow() - this.wallAnchor) * this.rate;
  }

  public setRate(rate: number) {
    if (this.mode === "offline") return;
    const r = clampPos(rate);
    const w = wallNow();
    const l = this.now();
    this.wallAnchor = w;
    this.logicalAnchor = l;
    this.rate = r;
    this.scheduleNext();
  }

  public tempoWriteTime(): number {
    // If setBpm() is called by a coroutine continuation resumed at logical time T,
    // stamp the tempo change at exactly T. This avoids:
    // - realtime stamping slightly after T due to setTimeout jitter
    // - offline stamping at the advanceTo() target time
    if (this.inTimesliceMicrotaskPhase) return this.lastProcessedTime;
    return this.now();
  }


  /* ------------------------------- wait primitives ------------------------------- */

  public sleepUntilTime(ctx: TimeContext, targetTime: number): Promise<void> {
    const root = ctx.rootContext!;
    const t = Math.max(targetTime, 0);

    if (ctx.isCanceled) return Promise.reject(new Error("context canceled"));

    return new Promise<void>((resolve, reject) => {
      const seq = this.allocSeq();
      const id = `time:${seq}`;

      const abortListener = () => {
        this.timePQ.remove(id);
        ctx.abortController.signal.removeEventListener("abort", abortListener);
        reject(new Error("aborted"));
        this.scheduleNext();
      };

      ctx.abortController.signal.addEventListener("abort", abortListener);

      this.timePQ.add(id, t, {
        kind: "time",
        seq,
        ctx,
        targetTime: t,
        resolve,
        reject,
        abortListener,
      });

      this.requestPumpOrWake();
    });
  }

  public sleepUntilBeats(ctx: TimeContext, tempo: TempoMap, targetBeat: number): Promise<void> {
    const b = Math.max(targetBeat, 0);

    if (ctx.isCanceled) return Promise.reject(new Error("context canceled"));

    return new Promise<void>((resolve, reject) => {
      const tempoId = tempo.id;
      const seq = this.allocSeq();
      const id = `beat:${tempoId}:${seq}`;

      const abortListener = () => {
        const pq = this.beatPQs.get(tempoId);
        pq?.remove(id);
        ctx.abortController.signal.removeEventListener("abort", abortListener);
        reject(new Error("aborted"));
        this.refreshTempoHead(tempoId);
        this.requestPumpOrWake();
      };

      ctx.abortController.signal.addEventListener("abort", abortListener);

      let pq = this.beatPQs.get(tempoId);
      if (!pq) {
        pq = new PriorityQueue<BeatWaitMeta>();
        this.beatPQs.set(tempoId, pq);
      }

      pq.add(id, b, {
        kind: "beat",
        seq,
        ctx,
        tempo,
        targetBeat: b,
        resolve,
        reject,
        abortListener,
      });

      this.refreshTempoHead(tempoId);
      this.requestPumpOrWake();
    });
  }

  public awaitNextFrame(ctx: TimeContext): Promise<void> {
    if (ctx.isCanceled) return Promise.reject(new Error("context canceled"));
    if (this.mode === "offline") {
      // offline will be driven by OfflineRunner.stepFrame()
      return new Promise<void>((resolve, reject) => {
        const seq = this.allocSeq();
        const id = `frame:${seq}`;

        const abortListener = () => {
          this.frameWaiters.delete(id);
          ctx.abortController.signal.removeEventListener("abort", abortListener);
          reject(new Error("aborted"));
        };

        ctx.abortController.signal.addEventListener("abort", abortListener);
        this.frameWaiters.set(id, { seq, ctx, resolve, reject, abortListener });
      });
    }

    // realtime (browser only)
    if (typeof (globalThis as any).requestAnimationFrame !== "function") {
      return Promise.reject(new Error("waitFrame requires requestAnimationFrame (use DateTimeContext outside browsers)"));
    }

    this.ensureRafLoop();

    return new Promise<void>((resolve, reject) => {
      const seq = this.allocSeq();
      const id = `frame:${seq}`;

      const abortListener = () => {
        this.frameWaiters.delete(id);
        ctx.abortController.signal.removeEventListener("abort", abortListener);
        reject(new Error("aborted"));
      };

      ctx.abortController.signal.addEventListener("abort", abortListener);
      this.frameWaiters.set(id, { seq, ctx, resolve, reject, abortListener });
    });
  }

  /* ------------------------------- offline driving ------------------------------- */

  /** Offline: advance "now" and process all due waits (time + beat). */
  public async advanceTo(t: number): Promise<void> {
    if (this.mode !== "offline") throw new Error("advanceTo() is offline-only");

    const target = Math.max(0, t);

    // Safety bound: offline simulation can run infinite programs.
    const MAX_TIMESLICES = 200_000;
    let processed = 0;

    while (true) {
      const next = this.peekNextEventTime();
      if (next == null || next > target) break;

      // During processing, now() should reflect the slice time.
      this.offlineNow = next;
      this.processOneTimeslice(next);

      processed++;
      if (processed > MAX_TIMESLICES) {
        throw new Error(
          `advanceTo(${target}) exceeded MAX_TIMESLICES. Possible infinite scheduling at/before target.`,
        );
      }

      // Rigorous part:
      // Yield to a macrotask so the runtime drains microtasks to completion,
      // matching realtime semantics (timer callback -> microtask checkpoint).
      await yieldToMacrotask();
    }

    // After all due slices are processed, move the clock to the requested target time.
    this.offlineNow = target;

    // Optional but recommended: one final macrotask yield so any .finally / Promise.all
    // triggered by the last processed slice definitely runs before advanceTo resolves.
    await yieldToMacrotask();
  }




  /** Offline: resolve all waitFrame() calls once per frame tick at the current offline time. */
  public async resolveFrameTick(): Promise<void> {
    if (this.mode !== "offline") throw new Error("resolveFrameTick() is offline-only");
    const t = this.offlineNow;

    this.resolveAllFrameWaitersAt(t);

    // Ensure microtasks from frame waiters run before we process any resulting waits.
    await yieldToMacrotask();

    await this.advanceTo(this.offlineNow);
  }


  /* ------------------------------- internal scheduling ------------------------------- */

  private requestPumpOrWake() {
    if (this.mode === "offline") return;

    const next = this.peekNextEventTime();
    if (next == null) {
      this.clearTimeoutWake();
      return;
    }

    const now = this.now();
    if (next <= now) {
      this.queuePump();
    } else {
      this.scheduleNext();
    }
  }

  private queuePump() {
    if (this.mode === "offline") return;
    if (this.pumpQueued) return;
    this.pumpQueued = true;

    queueMicrotask(() => {
      this.pumpQueued = false;
      this.pumpDue();
    });
  }

  private pumpDue() {
    if (this.mode === "offline") return;

    const now = this.now();
    const next = this.peekNextEventTime();
    if (next == null) {
      this.clearTimeoutWake();
      return;
    }

    if (next > now) {
      this.scheduleNext();
      return;
    }

    // Process exactly one time-slice, then yield to microtasks before continuing.
    this.processOneTimeslice(next);

    // After resolving, allow user continuations to run before the next slice.
    const stillDue = () => {
      const n = this.peekNextEventTime();
      return n != null && n <= this.now();
    };

    if (stillDue()) {
    // CRITICAL: continue in a MACROTASK, not a microtask.
    // This guarantees that all promise continuations spawned by resolving the
    // current timeslice have run (microtask checkpoint) before we advance
    // to the next logical timeslice.
    this.queuePumpMacrotask();
  } else {
    this.scheduleNext();
  }

  }

  private queuePumpMacrotask() {
    if (this.mode === "offline") return;

    if (this.pumpMacroQueued) return;
    this.pumpMacroQueued = true;

    scheduleMacrotask(() => {
      this.pumpMacroQueued = false;
      this.pumpDue();
    });
  }


  private scheduleNext() {
    if (this.mode === "offline") return;

    const next = this.peekNextEventTime();
    if (next == null) {
      this.clearTimeoutWake();
      return;
    }

    const now = this.now();
    const dtLogical = next - now;

    if (dtLogical <= 0) {
      this.queuePump();
      return;
    }

    const dtWallMs = Math.max(0, (dtLogical / this.rate) * 1000);

    this.clearTimeoutWake();
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.pumpDue();
    }, dtWallMs) as unknown as number;
  }

  private clearTimeoutWake() {
    if (this.timeoutId != null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private peekNextEventTime(): number | null {
    const timeHead = this.timePQ.peek();
    const beatHead = this.tempoHeadPQ.peek();

    const t1 = timeHead?.deadline ?? Infinity;
    const t2 = beatHead?.deadline ?? Infinity;

    const next = Math.min(t1, t2);
    return Number.isFinite(next) ? next : null;
  }

  private refreshTempoHead(tempoId: string) {
    const pq = this.beatPQs.get(tempoId);
    const head = pq?.peek();
    const tempoHeadId = `tempohead:${tempoId}`;

    if (!head) {
      this.tempoHeadPQ.remove(tempoHeadId);
      return;
    }

    const meta = head.metadata;
    const t = meta.tempo.timeAtBeats(meta.targetBeat);
    if (!Number.isFinite(t)) return;

    // Update or add this tempo's head time.
    if (!this.tempoHeadPQ.adjustDeadline(tempoHeadId, t)) {
      this.tempoHeadPQ.add(tempoHeadId, t, { tempoId });
    }
  }

  /** Call after tempo changes to retime beat waits efficiently. */
  public onTempoChanged(tempo: TempoMap) {
    // Only the head of this tempo needs its due-time recomputed.
    this.refreshTempoHead(tempo.id);
    this.requestPumpOrWake();
  }

  private processOneTimeslice(tSlice: number) {
    const sliceTime = tSlice;
    // Mark the current logical time slice as the authoritative "root current time"
    // for immediate continuation work (microtasks) spawned by resolving waits at this slice.
    this.lastProcessedTime = sliceTime;
    this.inTimesliceMicrotaskPhase = true;

    // Decide whether the next slice is from timePQ or tempoHeadPQ (re-check peeks).
    const timeHead = this.timePQ.peek();
    const beatHead = this.tempoHeadPQ.peek();

    const tTime = timeHead?.deadline ?? Infinity;
    const tBeat = beatHead?.deadline ?? Infinity;

    if (tTime <= tBeat) {
      this.processTimeWaitersAt(tTime);
    } else {
      this.processBeatWaitersForTempoHead();
    }

    // IMPORTANT: do NOT clear immediately. Clear after the promise continuations
    // for this slice have had a chance to run.
    queueMicrotask(() => {
      // Only clear if nothing advanced lastProcessedTime in the meantime.
      if (this.lastProcessedTime === sliceTime) {
        this.inTimesliceMicrotaskPhase = false;
      }
    });
  }

  private processTimeWaitersAt(t: number) {
    // Pop all time waiters with deadline == t (exact match)
    const batch: TimeWaitMeta[] = [];
    while (true) {
      const head = this.timePQ.peek();
      if (!head || head.deadline !== t) break;
      const item = this.timePQ.pop()!;
      batch.push(item.metadata);
    }

    batch.sort((a, b) => a.seq - b.seq);

    for (const w of batch) {
      const ctx = w.ctx;
      ctx.abortController.signal.removeEventListener("abort", w.abortListener);

      if (ctx.isCanceled) {
        w.reject(new Error("aborted"));
        continue;
      }

      ctx.time = Math.max(ctx.time, w.targetTime);
      ctx.rootContext!.mostRecentDescendentTime = Math.max(ctx.rootContext!.mostRecentDescendentTime, ctx.time);

      w.resolve();
    }
  }

  private processBeatWaitersForTempoHead() {
    const head = this.tempoHeadPQ.peek();
    if (!head) return;

    const tempoId = head.metadata.tempoId;
    const beatPQ = this.beatPQs.get(tempoId);
    const beatHead = beatPQ?.peek();
    if (!beatHead) {
      this.tempoHeadPQ.pop(); // stale
      return;
    }

    const meta0 = beatHead.metadata;
    // Recompute due-time at processing time (tempo might have changed since head computation)
    const dueTime = meta0.tempo.timeAtBeats(meta0.targetBeat);

    // If our tempoHeadPQ deadline is stale, fix it and return (scheduling will re-run).
    if (!Number.isFinite(dueTime)) {
      beatPQ?.pop();
      this.refreshTempoHead(tempoId);
      return;
    }

    // Pop all beat waiters at this exact targetBeat
    const targetBeat = meta0.targetBeat;
    const batch: BeatWaitMeta[] = [];

    while (true) {
      const h = beatPQ!.peek();
      if (!h || h.deadline !== targetBeat) break;
      batch.push(beatPQ!.pop()!.metadata);
    }

    batch.sort((a, b) => a.seq - b.seq);

    // If this tempo head was the earliest, remove it now; we'll refresh after processing.
    this.tempoHeadPQ.pop();

    for (const w of batch) {
      const ctx = w.ctx;
      ctx.abortController.signal.removeEventListener("abort", w.abortListener);

      if (ctx.isCanceled) {
        w.reject(new Error("aborted"));
        continue;
      }

      ctx.time = Math.max(ctx.time, dueTime);
      ctx.rootContext!.mostRecentDescendentTime = Math.max(ctx.rootContext!.mostRecentDescendentTime, ctx.time);

      w.resolve();
    }

    // Refresh tempo head for remaining beat waiters
    this.refreshTempoHead(tempoId);
  }

  /* ------------------------------- frames ------------------------------- */

  private ensureRafLoop() {
    if (this.rafRunning) return;
    this.rafRunning = true;

    const raf = (globalThis as any).requestAnimationFrame as (cb: (ts: number) => void) => number;

    const tick = () => {
      if (!this.rafRunning) return;

      const t = this.now();
      this.resolveAllFrameWaitersAt(t);

      // If timers were delayed, frame ticks can help “catch up” quickly.
      this.queuePump();

      this.rafHandle = raf(() => tick());
    };

    this.rafHandle = raf(() => tick());
  }

  private resolveAllFrameWaitersAt(t: number) {
    if (this.frameWaiters.size === 0) return;

    const entries = Array.from(this.frameWaiters.entries());
    this.frameWaiters.clear();

    entries.sort((a, b) => a[1].seq - b[1].seq);

    for (const [id, w] of entries) {
      const ctx = w.ctx;
      ctx.abortController.signal.removeEventListener("abort", w.abortListener);

      if (ctx.isCanceled) {
        w.reject(new Error("aborted"));
        continue;
      }

      // Frame waits "sync" you up to the frame time.
      ctx.time = Math.max(ctx.time, t, ctx.rootContext!.mostRecentDescendentTime);
      ctx.rootContext!.mostRecentDescendentTime = Math.max(ctx.rootContext!.mostRecentDescendentTime, ctx.time);

      w.resolve();
    }
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Barriers (sync points across coroutines within the same root tree)                              */
/* ---------------------------------------------------------------------------------------------- */

type BarrierWaiter = {
  ctx: TimeContext;
  resolve: () => void;
  reject: (e?: any) => void;
  abortListener: () => void;
};

type BarrierState = {
  key: string;
  rootId: number;
  lastResolvedTime: number;
  inProgress: boolean;
  startTime: number;
  waiters: Set<BarrierWaiter>;
};

const barrierMap = new Map<string, BarrierState>();

// Root-scoped storage key to prevent bleed between independent root trees
// (e.g. offline + realtime test runs that reuse the same barrier name).
function barrierStoreKey(rootId: number, key: string): string {
  // Use a delimiter that is extremely unlikely to appear in user keys.
  return `${rootId}\u0000${key}`;
}

function getBarrier(key: string, rootId: number): BarrierState {
  const storeKey = barrierStoreKey(rootId, key);
  const existing = barrierMap.get(storeKey);
  if (existing) return existing;

  const b: BarrierState = {
    key,
    rootId,
    lastResolvedTime: -Infinity,
    inProgress: false,
    startTime: -Infinity,
    waiters: new Set(),
  };

  barrierMap.set(storeKey, b);
  return b;
}


export function startBarrier(key: string, ctx: TimeContext) {
  const rootId = ctx.rootContext!.id;
  const b = getBarrier(key, rootId);

  // Resolve any stale in-progress cycle to avoid deadlocks.
  if (b.inProgress) {
    resolveBarrier(key, ctx);
  }

  b.inProgress = true;
  b.startTime = ctx.time;
}


export function resolveBarrier(key: string, ctx: TimeContext) {
  const rootId = ctx.rootContext!.id;
  const storeKey = barrierStoreKey(rootId, key);

  const b = barrierMap.get(storeKey);
  if (!b) {
    console.warn(`No barrier found for key: ${key}`);
    return;
  }

  b.inProgress = false;
  b.lastResolvedTime = ctx.time;

  const t = b.lastResolvedTime;
  for (const w of b.waiters) {
    w.ctx.abortController.signal.removeEventListener("abort", w.abortListener);

    if (w.ctx.isCanceled) {
      w.reject(new Error("aborted"));
      continue;
    }

    w.ctx.time = Math.max(w.ctx.time, t);
    w.ctx.rootContext!.mostRecentDescendentTime = Math.max(w.ctx.rootContext!.mostRecentDescendentTime, w.ctx.time);
    w.resolve();
  }
  b.waiters.clear();
}


export function awaitBarrier(key: string, ctx: TimeContext): Promise<void> {
  const rootId = ctx.rootContext!.id;
  const storeKey = barrierStoreKey(rootId, key);

  const b = barrierMap.get(storeKey);
  if (!b) {
    console.warn(`No barrier found for key: ${key}`);
    return Promise.resolve();
  }

  // If a resolve happened at/after our logical time, don't accidentally wait for the next cycle.
  if (b.lastResolvedTime >= ctx.time) {
    ctx.time = Math.max(ctx.time, b.lastResolvedTime);
    ctx.rootContext!.mostRecentDescendentTime = Math.max(ctx.rootContext!.mostRecentDescendentTime, ctx.time);
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const w: BarrierWaiter = {
      ctx,
      resolve,
      reject,
      abortListener: () => {
        b.waiters.delete(w);
        reject(new Error("aborted"));
      },
    };
    ctx.abortController.signal.addEventListener("abort", w.abortListener);
    b.waiters.add(w);
  });
}


/* ---------------------------------------------------------------------------------------------- */
/* Context tree + API                                                                              */
/* ---------------------------------------------------------------------------------------------- */

let contextId = 0;

export type BranchOptions = {
  tempo?: "shared" | "cloned"; // default shared
  rng?: "forked" | "shared"; // default forked
};

type Constructor<T> = new (time: number, ab: AbortController, id: number, cancelPromise: CancelablePromiseProxy<any>) => T;

export abstract class TimeContext {
  public rootContext: TimeContext | undefined;
  public mostRecentDescendentTime = 0;

  public debugName = "";
  public abortController: AbortController;

  public time: number;
  public startTime: number;
  public isCanceled = false;

  public id: number;

  public cancelPromise: CancelablePromiseProxy<any>;
  public childContexts: Set<TimeContext> = new Set();

  // Scheduler + tempo are wired during launch/branch creation
  public scheduler!: TimeScheduler;
  public tempo!: TempoMap;
  public rng!: seedrandom.PRNG;
  public rngSeed!: string;
  private rngForkCounter = 0;

  constructor(time: number, ab: AbortController, id: number, cancelPromise: CancelablePromiseProxy<any>) {
    this.time = time;
    this.startTime = time;
    this.abortController = ab;
    this.id = id;
    this.cancelPromise = cancelPromise;

    this.abortController.signal.addEventListener("abort", () => {
      this.isCanceled = true;
      // console.log("aborted timecontext", this.debugName);
    });
  }

  public get progTime(): number {
    return this.time - this.startTime;
  }

  /** Beat position under variable tempo. */
  public get beats(): number {
    return this.tempo.beatsAtTime(this.time);
  }

  public get progBeats(): number {
    return this.tempo.beatsAtTime(this.time) - this.tempo.beatsAtTime(this.startTime);
  }

  /** Deterministic random in [0,1). Use this instead of Math.random(). */
  public random(): number {
    return this.rng();
  }

  /** Read-only BPM at the context's current logical time. */
  public get bpm(): number {
    return this.tempo.bpmAtTime(this.time);
  }

  /** Tempo write: always stamped at the latest processed logical time of this root tree. */
  public setBpm(bpm: number) {
    // This is the engine’s “root current time” (processed logical time), stable across:
    // - offline advanceTo(target) (where scheduler.now() may equal target)
    // - microtask ordering differences (queueMicrotask vs Promise reactions)
    const t = this.rootContext!.mostRecentDescendentTime;

    this.tempo._setBpmAtTime(bpm, t);
    this.rootContext!.scheduler.onTempoChanged(this.tempo);
  }

  /** Optional: small ramp helper (also stamped at latest processed logical time). */
  public rampBpmTo(bpm: number, durSec: number) {
    const t = this.rootContext!.mostRecentDescendentTime;

    this.tempo._rampToBpmAtTime(bpm, durSec, t);
    this.rootContext!.scheduler.onTempoChanged(this.tempo);
  }


  public connectChildContext(childContext: TimeContext, opts?: BranchOptions) {
    childContext.rootContext = this.rootContext;
    childContext.scheduler = this.rootContext!.scheduler;

    const tempoMode = opts?.tempo ?? "shared";
    childContext.tempo = tempoMode === "shared" ? this.tempo : this.tempo.clone();

    const rngMode = opts?.rng ?? "forked";
    if (rngMode === "shared") {
      childContext.rngSeed = this.rngSeed;
      childContext.rng = this.rng;
    } else {
      const childSeed = deriveSeed(this.rngSeed, this.rngForkCounter++);
      childContext.rngSeed = childSeed;
      childContext.rng = seedrandom(childSeed);
      childContext.rngForkCounter = 0;
    }

    this.childContexts.add(childContext);
  }

  public cancel() {
    this.abortController.abort();
    this.childContexts.forEach((ctx) => ctx.cancel());
  }

  public branch<T>(block: (ctx: TimeContext) => Promise<T>, debugName = "", opts?: BranchOptions): { cancel: () => void; finally: (f: () => void) => void } {
    const promise = createAndLaunchContext(
      block,
      this.rootContext!.mostRecentDescendentTime,
      Object.getPrototypeOf(this).constructor,
      false,
      this,
      debugName,
      opts,
    );
    return {
      finally: (finalFunc: () => void) => promise.finally(finalFunc),
      cancel: () => promise.cancel(),
    };
  }

  public branchWait<T>(block: (ctx: TimeContext) => Promise<T>, debugName = "", opts?: BranchOptions): CancelablePromiseProxy<T> {
    return createAndLaunchContext(
      block,
      this.time,
      Object.getPrototypeOf(this).constructor,
      true,
      this,
      debugName,
      opts,
    );
  }

  public abstract waitSec(sec: number): Promise<void>;

  public wait(beats: number): Promise<void> {
    if (this.isCanceled) return Promise.reject(new Error("context canceled"));

    // allow wait(0) as a yield/sync point
    const delta = Number.isFinite(beats) ? beats : 0;
    if (delta <= 0) {
      // Treat wait(0) as an engine-controlled yield/sync point.
      // Important for offline: Promise.resolve() is invisible to the scheduler and can cause advanceTo()
      // to return before follow-up waits are enqueued (requires multiple microtask hops).
      const baseTime = Math.max(this.rootContext!.mostRecentDescendentTime, this.time);

      // Schedule a time-wait at baseTime. This yields without advancing logical time
      // (unless we were behind the root, in which case it syncs us forward).
      return this.rootContext!.scheduler.sleepUntilTime(this, baseTime);
    }


    // Align to global time, then wait in beats.
    const baseTime = Math.max(this.rootContext!.mostRecentDescendentTime, this.time);
    const baseBeats = this.tempo.beatsAtTime(baseTime);
    const targetBeat = baseBeats + delta;

    return this.rootContext!.scheduler.sleepUntilBeats(this, this.tempo, targetBeat);
  }
}

/** Works everywhere: schedules via setTimeout through the scheduler. No waitFrame(). */
export class DateTimeContext extends TimeContext {
  public waitSec(sec: number): Promise<void> {
    if (this.isCanceled) return Promise.reject(new Error("context canceled"));

    let s = Number.isFinite(sec) ? sec : 0;
    if (s < 0) s = 0;

    const baseTime = Math.max(this.rootContext!.mostRecentDescendentTime, this.time);
    const targetTime = baseTime + s;

    return this.rootContext!.scheduler.sleepUntilTime(this, targetTime);
  }
}

/** Browser-only: adds waitFrame() using a single RAF-driven frame barrier. */
export class BrowserTimeContext extends DateTimeContext {
  public waitFrame(): Promise<void> {
    return this.rootContext!.scheduler.awaitNextFrame(this);
  }
}

/** Offline context: same semantics as BrowserTimeContext, but driven by OfflineRunner (60fps frame ticks). */
export class OfflineTimeContext extends DateTimeContext {
  public waitFrame(): Promise<void> {
    return this.rootContext!.scheduler.awaitNextFrame(this);
  }
}

export function createAndLaunchContext<T, C extends TimeContext>(
  block: (ctx: C) => Promise<T>,
  rootTime: number,
  ctor: Constructor<C>,
  updateParent: boolean,
  parentContext?: C,
  debugName = "",
  opts?: BranchOptions,
  // only for root creation:
  rootScheduler?: TimeScheduler,
  rootTempo?: TempoMap,
  rootSeed?: RandomSeed,
): CancelablePromiseProxy<T> {
  const abortController = new AbortController();
  const promiseProxy = new CancelablePromiseProxy<T>(abortController);

  const newContext = new ctor(rootTime, abortController, contextId++, promiseProxy);
  newContext.debugName = debugName;
  promiseProxy.timeContext = newContext;

  if (parentContext) {
    parentContext.connectChildContext(newContext, opts);
  } else {
    // Root setup
    newContext.rootContext = newContext;
    newContext.mostRecentDescendentTime = rootTime;

    if (!rootScheduler) throw new Error("Root context requires a scheduler");
    if (!rootTempo) throw new Error("Root context requires a tempo map");

    newContext.scheduler = rootScheduler;
    newContext.tempo = rootTempo;
    const seedStr = normalizeSeed(rootSeed);
    newContext.rngSeed = seedStr;
    newContext.rng = seedrandom(seedStr);
  }

  const blockPromise = block(newContext);

  promiseProxy.promise = blockPromise;

  const bp = blockPromise.catch((e) => {
    const err = e as Error;
    console.log("promise catch error", err, err?.message, err?.stack);
  });

  if (parentContext) {
    bp.finally(() => {
      if (updateParent) parentContext.time = Math.max(newContext.time, parentContext.time);
      parentContext.childContexts.delete(newContext);
    });
  }

  return promiseProxy;
}

/* ---------------------------------------------------------------------------------------------- */
/* Launch helpers                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

/** Default launch: setTimeout-only DateTimeContext (works everywhere). */
export function launch<T>(
  block: (ctx: DateTimeContext) => Promise<T>,
  opts?: { bpm?: number; rate?: number; debugName?: string; seed?: RandomSeed },
): CancelablePromiseProxy<T> {
  const scheduler = new TimeScheduler("realtime", { rate: opts?.rate ?? 1 });
  const tempo = new TempoMap(opts?.bpm ?? 60);

  const t0 = 0;
  return createAndLaunchContext(
    block as any,
    t0,
    DateTimeContext as any,
    false,
    undefined,
    opts?.debugName ?? "",
    undefined,
    scheduler,
    tempo,
    opts?.seed,
  );
}

/** Browser launch: BrowserTimeContext with waitFrame(). */
export function launchBrowser<T>(
  block: (ctx: BrowserTimeContext) => Promise<T>,
  opts?: { bpm?: number; rate?: number; debugName?: string; seed?: RandomSeed },
): CancelablePromiseProxy<T> {
  const scheduler = new TimeScheduler("realtime", { rate: opts?.rate ?? 1 });
  const tempo = new TempoMap(opts?.bpm ?? 60);

  const t0 = 0;
  return createAndLaunchContext(
    block as any,
    t0,
    BrowserTimeContext as any,
    false,
    undefined,
    opts?.debugName ?? "",
    undefined,
    scheduler,
    tempo,
    opts?.seed,
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Offline runner (ergonomic offline rendering)                                                    */
/* ---------------------------------------------------------------------------------------------- */

export class OfflineRunner<T> {
  public readonly scheduler: TimeScheduler;
  public readonly ctx: OfflineTimeContext;
  public readonly promise: CancelablePromiseProxy<T>;

  private fps: number;

  constructor(block: (ctx: OfflineTimeContext) => Promise<T>, opts?: { bpm?: number; fps?: number; debugName?: string; seed?: RandomSeed }) {
    this.scheduler = new TimeScheduler("offline");
    const tempo = new TempoMap(opts?.bpm ?? 60);
    this.fps = opts?.fps ?? 60;

    const t0 = 0;
    this.promise = createAndLaunchContext(
      block as any,
      t0,
      OfflineTimeContext as any,
      false,
      undefined,
      opts?.debugName ?? "",
      undefined,
      this.scheduler,
      tempo,
      opts?.seed,
    );

    this.ctx = this.promise.timeContext as OfflineTimeContext;
  }

  /** Advance simulation by dt seconds (processes all time+beat waits due). */
  public async stepSec(dt: number) {
    const s = Math.max(0, Number.isFinite(dt) ? dt : 0);
    await this.scheduler.advanceTo(this.scheduler.now() + s);
  }

  /** Advance simulation by 1 frame (default 60fps): pumps due waits, resolves waitFrame(), pumps again. */
  public async stepFrame() {
    const dt = 1 / this.fps;
    await this.stepSec(dt);
    await this.scheduler.resolveFrameTick();
  }

  /** Convenience: render N frames. */
  public async stepFrames(n: number) {
    const N = Math.max(0, Math.floor(n));
    for (let i = 0; i < N; i++) {
      await this.stepFrame();
    }
  }
}
