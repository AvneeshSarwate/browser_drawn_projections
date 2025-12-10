// deno-lint-ignore-file no-explicit-any no-unused-vars no-this-alias require-await

/**
 * https://chatgpt.com/c/69343bfc-5394-832f-a246-c0be525623fd
 * 
 * Timing engine v2:
 * - Single scheduler per root context (min-heap) to prevent drift + preserve logical ordering.
 * - waitSec() schedules absolute logical deadlines (seconds).
 * - wait(beats) schedules absolute beat deadlines using a TempoMap (supports interactive BPM changes).
 * - DateTimeContext: setTimeout-only (works everywhere), NO waitFrame().
 * - BrowserTimeContext: adds waitFrame() via a single internal RAF driver (browser only).
 * - OfflineTimeContext + OfflineRunner: ergonomic offline stepping + frame simulation at 60fps.
 *
 * NOTE: You said you already have PriorityQueue; import it here.
 */


/**
 * Timing Engine Architecture (v2)
 * ===============================
 *
 * Goals
 * -----
 * - Drift-free waits: `await ctx.waitSec(x)` and `await ctx.wait(beats)` should schedule against a
 *   logical timeline (not accumulate setTimeout jitter).
 * - Structured concurrency: spawn tasks (branches), cancel whole subtrees, and optionally join
 *   branches while preserving logical time ordering.
 * - Musical time: `wait(beats)` must remain correct under interactive tempo changes (slider/MIDI/LFO),
 *   without rescheduling every pending waiter.
 * - Offline rendering: deterministic, faster-than-realtime simulation with an ergonomic “step frames”
 *   API (e.g. 60Hz) and correct ordering semantics.
 *
 * Core Concepts
 * -------------
 * - Logical time (seconds): every TimeContext has `ctx.time` representing the logical timeline.
 * - Root context: the root of a context tree stores the scheduler and shared state used to keep
 *   concurrency “consistent”.
 * - mostRecentDescendentTime: the root tracks the maximum logical time reached by any descendant.
 *   Wait scheduling uses this to prevent drift and keep branches aligned.
 *
 * Wait Semantics (Seconds)
 * ------------------------
 * - `waitSec(sec)` schedules a logical deadline, not "sleep for sec".
 *   Base time = max(root.mostRecentDescendentTime, ctx.time)
 *   Target time = base time + sec
 * - When the wait resolves, ctx.time is set to the target time (exactly), regardless of how late
 *   the underlying timer fired. The “lateness” only affects wall-clock, not logical time.
 * - This is the mechanism that prevents drift: if the wall clock runs late, the next wait’s wall delay
 *   shrinks because targetTime - scheduler.now() is smaller.
 *
 * Scheduler
 * ---------
 * - One scheduler per root context.
 * - Uses a min-heap (priority queue) of absolute deadlines.
 * - Realtime mode: at most one setTimeout is armed for the earliest deadline. When it fires (or when
 *   deadlines are already due), the scheduler processes exactly one logical timeslice at the earliest
 *   deadline, resolves all waiters at that time, then yields to microtasks before advancing further.
 * - Offline mode: no setTimeout. The test/renderer advances `scheduler.now()` explicitly; the scheduler
 *   repeatedly processes due timeslices up to the requested time, yielding to microtasks between slices.
 *
 * IMPORTANT INVARIANT:
 * - After resolving any batch at time T, the scheduler MUST yield (microtask) before processing a later
 *   time. This allows coroutines resumed at T to enqueue new waits at intermediate times (T < t < next).
 *   Without this, offline simulation can “skip” events until the next advance call.
 *
 * Beat / Tempo Semantics
 * ----------------------
 * - `wait(beats)` does NOT convert beats->seconds once at call time.
 * - Instead, each context has a TempoMap. `wait(beats)` schedules on an absolute target beat:
 *     baseTime = max(root.mostRecentDescendentTime, ctx.time)
 *     baseBeats = tempo.beatsAtTime(baseTime)
 *     targetBeat = baseBeats + beats
 * - The scheduler converts the head beat waiter to a time via tempo.timeAtBeats(targetBeat).
 * - Tempo changes (interactive slider/MIDI/LFO) can retime pending beat waits automatically.
 *
 * PERFORMANCE DESIGN DECISION:
 * - Beat waiters are grouped by TempoMap. When a TempoMap changes, only that TempoMap’s “head” beat waiter
 *   needs its time recomputed (the earliest targetBeat for that map). This avoids rescheduling all waiters
 *   when doing frequent tempo automation.
 *
 * Tempo API Safety
 * ---------------
 * - `ctx.bpm` is read-only; tempo changes go through `ctx.setBpm(...)`.
 * - Tempo writes are stamped at “now” from the root scheduler (never in the past, never in the future).
 *   This avoids retroactive tempo edits which can invalidate already-scheduled waits.
 *
 * Structured Concurrency
 * ----------------------
 * - `ctx.branch(...)`: fire-and-forget child context. Does NOT update parent ctx.time on completion.
 * - `ctx.branchWait(...)`: spawn and return a promise-like handle, and on completion updates parent ctx.time
 *   to max(parent.time, child.time). (Joining is typically done via awaiting the handle or Promise.all.)
 * - Cancellation:
 *   - Each context owns an AbortController; `ctx.cancel()` aborts the context and recursively cancels all
 *     children in its subtree.
 *   - Wait primitives attach abort listeners and remove them on resolve/cancel to avoid leaks.
 *
 * Barriers (Cross-Task Sync)
 * --------------------------
 * - Barriers allow coroutines to wait for “a moment” in another coroutine (e.g. melody A waits for melody B’s loop end).
 * - Barrier waits must adopt the barrier’s resolve logical time, and update root.mostRecentDescendentTime.
 * - Barriers are only valid within a single root context tree (cross-root use is undefined; warn/error).
 * - Barrier implementation must avoid the “resolve + immediate restart” race by tracking lastResolvedTime.
 *
 * Frame Waiting
 * -------------
 * - DateTimeContext: works everywhere (setTimeout only), no waitFrame().
 * - BrowserTimeContext: extends DateTimeContext with waitFrame(), implemented as a scheduler-managed RAF barrier
 *   (all frame waiters resolve once per RAF tick).
 * - Offline: waitFrame is simulated at a fixed fps (default 60Hz) by the OfflineRunner.
 *
 * User Guidance / Footguns
 * ------------------------
 * - Only await engine-controlled waits/barriers for timing. Awaiting arbitrary promises (fetch/IO/etc) can
 *   resume “out of logical time”.
 * - wait(0) / waitSec(0) is allowed as a sync/yield point, but it is user error to call it in a tight loop.
 * - Don’t attempt interactive input in offline mode (unless you provide an input-event injection mechanism).
 */


import { PriorityQueue } from "@/stores/priorityQueue";

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
  ctx: TimeContext;
  targetTime: number;
  resolve: () => void;
  reject: (e?: any) => void;
  abortListener: () => void;
};

type BeatWaitMeta = {
  kind: "beat";
  ctx: TimeContext;
  tempo: TempoMap;
  targetBeat: number;
  resolve: () => void;
  reject: (e?: any) => void;
  abortListener: () => void;
};

type TempoHeadMeta = { tempoId: string };
type FrameWaitMeta = {
  ctx: TimeContext;
  resolve: () => void;
  reject: (e?: any) => void;
  abortListener: () => void;
};

type SchedulerMode = "realtime" | "offline";

export class TimeScheduler {
  public readonly id = crypto.randomUUID();
  public readonly mode: SchedulerMode;

  // While pumping a specific logical time-slice, this is set.
  // Used for safe tempo writes from coroutines (so offline doesn't "write into the future").
  public currentSliceTime: number | null = null;

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

  /** Safe stamping time for tempo edits: inside pump => slice time; otherwise => now(). */
  public tempoWriteTime(): number {
    return this.currentSliceTime ?? this.now();
  }

  /* ------------------------------- wait primitives ------------------------------- */

  public sleepUntilTime(ctx: TimeContext, targetTime: number): Promise<void> {
    const root = ctx.rootContext!;
    const t = Math.max(targetTime, 0);

    if (ctx.isCanceled) return Promise.reject(new Error("context canceled"));

    return new Promise<void>((resolve, reject) => {
      const id = crypto.randomUUID();

      const abortListener = () => {
        this.timePQ.remove(id);
        ctx.abortController.signal.removeEventListener("abort", abortListener);
        reject(new Error("aborted"));
        this.scheduleNext();
      };

      ctx.abortController.signal.addEventListener("abort", abortListener);

      this.timePQ.add(id, t, {
        kind: "time",
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
      const id = crypto.randomUUID();
      const tempoId = tempo.id;

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
        const id = crypto.randomUUID();

        const abortListener = () => {
          this.frameWaiters.delete(id);
          ctx.abortController.signal.removeEventListener("abort", abortListener);
          reject(new Error("aborted"));
        };

        ctx.abortController.signal.addEventListener("abort", abortListener);
        this.frameWaiters.set(id, { ctx, resolve, reject, abortListener });
      });
    }

    // realtime (browser only)
    if (typeof (globalThis as any).requestAnimationFrame !== "function") {
      return Promise.reject(new Error("waitFrame requires requestAnimationFrame (use DateTimeContext outside browsers)"));
    }

    this.ensureRafLoop();

    return new Promise<void>((resolve, reject) => {
      const id = crypto.randomUUID();

      const abortListener = () => {
        this.frameWaiters.delete(id);
        ctx.abortController.signal.removeEventListener("abort", abortListener);
        reject(new Error("aborted"));
      };

      ctx.abortController.signal.addEventListener("abort", abortListener);
      this.frameWaiters.set(id, { ctx, resolve, reject, abortListener });
    });
  }

  /* ------------------------------- offline driving ------------------------------- */

  /** Offline: advance "now" and process all due waits (time + beat). */
  public async advanceTo(t: number): Promise<void> {
    if (this.mode !== "offline") throw new Error("advanceTo() is offline-only");
    this.offlineNow = Math.max(0, t);

    // Process due events, yielding microtasks between time-slices.
    while (true) {
      const next = this.peekNextEventTime();
      if (next == null || next > this.offlineNow) break;

      this.processOneTimeslice(next);

      // let resumed coroutines enqueue intermediate waits before we continue
      await Promise.resolve();
    }
  }

  /** Offline: resolve all waitFrame() calls once per frame tick at the current offline time. */
  public async resolveFrameTick(): Promise<void> {
    if (this.mode !== "offline") throw new Error("resolveFrameTick() is offline-only");
    const t = this.offlineNow;

    this.resolveAllFrameWaitersAt(t);
    await Promise.resolve();

    // process anything those frame continuations scheduled at the same time
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
      queueMicrotask(() => this.pumpDue());
    } else {
      this.scheduleNext();
    }
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
    this.currentSliceTime = sliceTime;

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

    this.currentSliceTime = null;
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

function getBarrier(key: string, rootId: number): BarrierState {
  const existing = barrierMap.get(key);
  if (existing) return existing;
  const b: BarrierState = {
    key,
    rootId,
    lastResolvedTime: -Infinity,
    inProgress: false,
    startTime: -Infinity,
    waiters: new Set(),
  };
  barrierMap.set(key, b);
  return b;
}

export function startBarrier(key: string, ctx: TimeContext) {
  const rootId = ctx.rootContext!.id;
  const b = getBarrier(key, rootId);

  if (b.rootId !== rootId) {
    console.warn(`Barrier "${key}" used across roots (not supported).`);
    return;
  }

  // Resolve any stale in-progress cycle to avoid deadlocks.
  if (b.inProgress) {
    resolveBarrier(key, ctx);
  }

  b.inProgress = true;
  b.startTime = ctx.time;
}

export function resolveBarrier(key: string, ctx: TimeContext) {
  const rootId = ctx.rootContext!.id;
  const b = barrierMap.get(key);
  if (!b) {
    console.warn(`No barrier found for key: ${key}`);
    return;
  }
  if (b.rootId !== rootId) {
    console.warn(`Barrier "${key}" used across roots (not supported).`);
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
  const b = barrierMap.get(key);
  if (!b) {
    console.warn(`No barrier found for key: ${key}`);
    return Promise.resolve();
  }
  if (b.rootId !== rootId) {
    console.warn(`Barrier "${key}" used across roots (not supported).`);
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

  /** Read-only BPM at the context's current logical time. */
  public get bpm(): number {
    return this.tempo.bpmAtTime(this.time);
  }

  /** Safe BPM write: stamped at scheduler "tempoWriteTime" (slice time if inside pump; otherwise now). */
  public setBpm(bpm: number) {
    const t = this.rootContext!.scheduler.tempoWriteTime();
    this.tempo._setBpmAtTime(bpm, t);
    this.rootContext!.scheduler.onTempoChanged(this.tempo);
  }

  /** Optional: small ramp helper */
  public rampBpmTo(bpm: number, durSec: number) {
    const t = this.rootContext!.scheduler.tempoWriteTime();
    this.tempo._rampToBpmAtTime(bpm, durSec, t);
    this.rootContext!.scheduler.onTempoChanged(this.tempo);
  }

  public connectChildContext(childContext: TimeContext, opts?: BranchOptions) {
    childContext.rootContext = this.rootContext;
    childContext.scheduler = this.rootContext!.scheduler;

    const mode = opts?.tempo ?? "shared";
    childContext.tempo = mode === "shared" ? this.tempo : this.tempo.clone();

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
      // still do a safe "sync to root time" and yield a microtask
      const baseTime = Math.max(this.rootContext!.mostRecentDescendentTime, this.time);
      this.time = Math.max(this.time, baseTime);
      this.rootContext!.mostRecentDescendentTime = Math.max(this.rootContext!.mostRecentDescendentTime, this.time);
      return Promise.resolve();
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
  public async waitSec(sec: number): Promise<void> {
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
  public async waitFrame(): Promise<void> {
    return this.rootContext!.scheduler.awaitNextFrame(this);
  }
}

/** Offline context: same semantics as BrowserTimeContext, but driven by OfflineRunner (60fps frame ticks). */
export class OfflineTimeContext extends DateTimeContext {
  public async waitFrame(): Promise<void> {
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
  opts?: { bpm?: number; rate?: number; debugName?: string },
): CancelablePromiseProxy<T> {
  const scheduler = new TimeScheduler("realtime", { rate: opts?.rate ?? 1 });
  const tempo = new TempoMap(opts?.bpm ?? 60);

  const t0 = scheduler.now();
  return createAndLaunchContext(block as any, t0, DateTimeContext as any, false, undefined, opts?.debugName ?? "", undefined, scheduler, tempo);
}

/** Browser launch: BrowserTimeContext with waitFrame(). */
export function launchBrowser<T>(
  block: (ctx: BrowserTimeContext) => Promise<T>,
  opts?: { bpm?: number; rate?: number; debugName?: string },
): CancelablePromiseProxy<T> {
  const scheduler = new TimeScheduler("realtime", { rate: opts?.rate ?? 1 });
  const tempo = new TempoMap(opts?.bpm ?? 60);

  const t0 = scheduler.now();
  return createAndLaunchContext(block as any, t0, BrowserTimeContext as any, false, undefined, opts?.debugName ?? "", undefined, scheduler, tempo);
}

/* ---------------------------------------------------------------------------------------------- */
/* Offline runner (ergonomic offline rendering)                                                    */
/* ---------------------------------------------------------------------------------------------- */

export class OfflineRunner<T> {
  public readonly scheduler: TimeScheduler;
  public readonly ctx: OfflineTimeContext;
  public readonly promise: CancelablePromiseProxy<T>;

  private fps: number;

  constructor(block: (ctx: OfflineTimeContext) => Promise<T>, opts?: { bpm?: number; fps?: number; debugName?: string }) {
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
