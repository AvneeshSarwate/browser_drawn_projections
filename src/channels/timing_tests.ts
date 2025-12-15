// timing_engine_test_suite.ts
// Runner-agnostic: exports async functions that throw on failure.
// Each test runs the same scenario in offline and realtime mode,
// logs timestamped events, then compares results with tolerances.

import {
  OfflineRunner,
  launch,
  startBarrier,
  resolveBarrier,
  awaitBarrier,
  type TimeContext,
} from "./offline_time_context"; // <-- change path as needed

/* ------------------------------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------------------------------ */

export type LoggedEvent = {
  id: string;          // stable unique label (must be deterministic across offline + realtime)
  t: number;           // ctx.time (logical seconds)
  rootT: number;       // ctx.rootContext!.mostRecentDescendentTime at log time
  ctxId: number;       // ctx.id (debug)
  wall: number;        // performance/wall time (debug only; NOT used for comparisons)
  note?: string;       // optional
};

export type TestTolerances = {
  timeEpsSec?: number;       // allowed absolute time diff per event (offline vs realtime)
  orderWindowSec?: number;   // if offline times are within this window, order differences are tolerated
};

export type TimingTestCase = {
  name: string;
  bpm?: number;
  // Known maximum logical time needed for the scenario to complete.
  // Offline runner will advance past this.
  logicalDurationSec: number;

  // Max realtime wall time for the test. Must be <= 10s per your requirements.
  // (We default to min(9s, logicalDuration+1s) to be safe.)
  realtimeTimeoutMs?: number;

  tolerances?: TestTolerances;

  // The scenario must:
  // - be deterministic
  // - not rely on waitFrame() (these tests are for DateTimeContext + OfflineTimeContext)
  // - ensure any background branches complete or are canceled before returning
  run: (ctx: TimeContext, log: (ctx: TimeContext, id: string, note?: string) => void) => Promise<void>;
};

export type TestResult = {
  name: string;
  offlineEvents: LoggedEvent[];
  realtimeEvents: LoggedEvent[];
};

/* ------------------------------------------------------------------------------------------------
 * Minimal asserts
 * ------------------------------------------------------------------------------------------------ */

function fail(msg: string): never {
  throw new Error(msg);
}

function assert(cond: unknown, msg: string) {
  if (!cond) fail(msg);
}

function almostEq(a: number, b: number, eps: number) {
  return Math.abs(a - b) <= eps;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: any = null;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Logging helpers
 * ------------------------------------------------------------------------------------------------ */

function makeLogger(events: LoggedEvent[]) {
  return (ctx: TimeContext, id: string, note?: string) => {
    const root = ctx.rootContext!;
    events.push({
      id,
      t: ctx.time,
      rootT: root.mostRecentDescendentTime,
      ctxId: ctx.id,
      wall: performance.now() / 1000,
      note,
    });
  };
}

function ensureUniqueIds(events: LoggedEvent[], mode: string, testName: string) {
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) {
      fail(`[${testName}] duplicate event id in ${mode}: ${e.id}`);
    }
    seen.add(e.id);
  }
}

function mapById(events: LoggedEvent[]) {
  const m = new Map<string, LoggedEvent>();
  for (const e of events) m.set(e.id, e);
  return m;
}

/* ------------------------------------------------------------------------------------------------
 * Comparison logic (robust to small jitter + same-time order nondeterminism)
 * ------------------------------------------------------------------------------------------------ */

export function compareOfflineVsRealtime(
  testName: string,
  offlineEvents: LoggedEvent[],
  realtimeEvents: LoggedEvent[],
  tolerances?: TestTolerances,
) {
  const timeEps = tolerances?.timeEpsSec ?? 1e-4;       // 0.1ms default
  const orderWin = tolerances?.orderWindowSec ?? 0.005; // 5ms default

  ensureUniqueIds(offlineEvents, "offline", testName);
  ensureUniqueIds(realtimeEvents, "realtime", testName);

  const offMap = mapById(offlineEvents);
  const rtMap = mapById(realtimeEvents);

  // Same ID sets
  const offIds = Array.from(offMap.keys()).sort();
  const rtIds = Array.from(rtMap.keys()).sort();

  if (offIds.length !== rtIds.length) {
    fail(
      `[${testName}] event count mismatch: offline=${offIds.length}, realtime=${rtIds.length}`,
    );
  }
  for (let i = 0; i < offIds.length; i++) {
    if (offIds[i] !== rtIds[i]) {
      const missing = offIds.filter((x) => !rtMap.has(x)).slice(0, 20);
      const extra = rtIds.filter((x) => !offMap.has(x)).slice(0, 20);
      fail(
        `[${testName}] event id set mismatch.\n` +
          `Missing in realtime (first 20): ${missing.join(", ")}\n` +
          `Extra in realtime (first 20): ${extra.join(", ")}`,
      );
    }
  }

  // Per-event time check + rootT sanity check
  for (const id of offIds) {
    const o = offMap.get(id)!;
    const r = rtMap.get(id)!;

    if (!almostEq(o.t, r.t, timeEps)) {
      fail(
        `[${testName}] time mismatch for "${id}": offline=${o.t.toFixed(6)} realtime=${r.t.toFixed(6)} eps=${timeEps}`,
      );
    }

    // Root invariant: rootT should be >= ctx time at logging instant (it’s a max).
    assert(o.rootT + 1e-12 >= o.t, `[${testName}] offline rootT < t at "${id}" (rootT=${o.rootT}, t=${o.t})`);
    assert(r.rootT + 1e-12 >= r.t, `[${testName}] realtime rootT < t at "${id}" (rootT=${r.rootT}, t=${r.t})`);
  }

  // Ordering robustness:
  // - We tolerate arbitrary ordering among events whose OFFLINE times are within orderWin.
  // - For groups separated by >orderWin, realtime ordering should be consistent.
  const offlineSorted = [...offlineEvents].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));

  const groups: { ids: string[]; tMin: number; tMax: number }[] = [];
  for (const e of offlineSorted) {
    const g = groups[groups.length - 1];
    if (!g) {
      groups.push({ ids: [e.id], tMin: e.t, tMax: e.t });
      continue;
    }
    if (e.t - g.tMax <= orderWin) {
      g.ids.push(e.id);
      g.tMax = e.t;
    } else {
      groups.push({ ids: [e.id], tMin: e.t, tMax: e.t });
    }
  }

  let prevGroupMaxRt = -Infinity;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const rtTimes = g.ids.map((id) => rtMap.get(id)!.t);
    const gMinRt = Math.min(...rtTimes);
    const gMaxRt = Math.max(...rtTimes);

    if (gi > 0) {
      // If offline groups are separated, realtime groups should not invert beyond orderWin.
      if (gMinRt + orderWin < prevGroupMaxRt) {
        fail(
          `[${testName}] ordering inversion between offline groups around t≈${g.tMin.toFixed(3)}.\n` +
            `prevGroupMaxRt=${prevGroupMaxRt.toFixed(6)} currentGroupMinRt=${gMinRt.toFixed(6)} orderWin=${orderWin}`,
        );
      }
    }
    prevGroupMaxRt = Math.max(prevGroupMaxRt, gMaxRt);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Mode runners
 * ------------------------------------------------------------------------------------------------ */

async function runOffline(tc: TimingTestCase): Promise<LoggedEvent[]> {
  const events: LoggedEvent[] = [];
  const log = makeLogger(events);

  const runner = new OfflineRunner(async (ctx) => {
    await tc.run(ctx, log);
  }, { bpm: tc.bpm ?? 60, fps: 60 });

  // // Advance beyond max logical time so everything resolves.
  // // Add a small margin in case a scenario logs slightly after its last wait.
  // await runner.stepSec(tc.logicalDurationSec + 0.2);
  // await runner.promise; // should settle now

  const delta = 1 / 60
  let runTime = 0
  while (runTime < tc.logicalDurationSec) {
    await runner.stepSec(delta);
    runTime += delta;
  }

  return events;
}

async function runRealtime(tc: TimingTestCase): Promise<LoggedEvent[]> {
  const events: LoggedEvent[] = [];
  const log = makeLogger(events);

  const timeoutMs = tc.realtimeTimeoutMs ??
    Math.min(9000, Math.ceil((tc.logicalDurationSec + 1.0) * 1000));

  const p = launch(async (ctx) => {
    await tc.run(ctx, log);
  }, { bpm: tc.bpm ?? 60, rate: 1 });

  await withTimeout(p, timeoutMs, tc.name);

  return events;
}

/* ------------------------------------------------------------------------------------------------
 * Test cases
 * ------------------------------------------------------------------------------------------------ */

export function makeTimingTestCases(): TimingTestCase[] {
  return [
    {
      name: "sequential_waitSec_basic",
      logicalDurationSec: 0.5,
      run: async (ctx, log) => {
        log(ctx, "start");
        await ctx.waitSec(0.05); log(ctx, "t=0.05");
        await ctx.waitSec(0.10); log(ctx, "t=0.15");
        await ctx.waitSec(0.20); log(ctx, "t=0.35");
      },
    },

    {
      name: "parallel_branchWait_ordering",
      logicalDurationSec: 0.4,
      run: async (ctx, log) => {
        log(ctx, "start");

        const a = ctx.branchWait(async (c) => {
          log(c, "A_start");
          await c.waitSec(0.20);
          log(c, "A_end");
        }, "A");

        const b = ctx.branchWait(async (c) => {
          log(c, "B_start");
          await c.waitSec(0.10);
          log(c, "B_end");
        }, "B");

        await Promise.all([a, b]);
        // Sync point (lets any parent-time updates finalize in microtasks if needed)
        await ctx.wait(0);
        log(ctx, "joined");
      },
    },

    {
      name: "many_branchWaits_stress_join",
      logicalDurationSec: 1.0,
      run: async (ctx, log) => {
        const durations = Array.from({ length: 20 }, (_, i) => 0.02 * (i + 1)); // 0.02..0.40
        log(ctx, "start");

        const ps = durations.map((d, i) =>
          ctx.branchWait(async (c) => {
            log(c, `task${i}_start`);
            await c.waitSec(d);
            log(c, `task${i}_end`);
          }, `task${i}`)
        );

        await Promise.all(ps);
        await ctx.wait(0);
        log(ctx, "joined");
      },
    },

    {
      name: "microtask_yield_intermediate_scheduling",
      logicalDurationSec: 0.4,
      run: async (ctx, log) => {
        const a = ctx.branchWait(async (c) => {
          await c.waitSec(0.10);
          log(c, "A@0.10");

          // This wait is scheduled only after A resumes at 0.10.
          await c.waitSec(0.05);
          log(c, "A@0.15");
        }, "A");

        const b = ctx.branchWait(async (c) => {
          await c.waitSec(0.12);
          log(c, "B@0.12");
        }, "B");

        await Promise.all([a, b]);
        await ctx.wait(0);
        log(ctx, "done");
      },
    },

    {
      name: "cancel_cascades_to_children_and_stops_ticks",
      logicalDurationSec: 0.8,
      run: async (root, log) => {
        log(root, "start");

        let childTicks = 0;
        let grandTicks = 0;

        const handle = root.branch(async (child) => {
          child.branch(async (grand) => {
            for (let i = 0; i < 10_000; i++) {
              log(grand, `grand_tick_${grandTicks++}`);
              await grand.waitSec(0.05);
            }
          }, "grand");

          for (let i = 0; i < 10_000; i++) {
            log(child, `child_tick_${childTicks++}`);
            await child.waitSec(0.05);
          }
        }, "child");

        await root.waitSec(0.23);
        log(root, "cancel");
        handle.cancel();

        // Wait longer than a tick interval and ensure no more tick ids appear.
        await root.waitSec(0.25);
        log(root, "after_cancel_wait");
      },
      tolerances: { orderWindowSec: 0.02 }, // allow order variance across tick logs close together
    },

    {
      name: "barrier_loop_sync_melodyA_waits_for_melodyB",
      logicalDurationSec: 1.2,
      run: async (root, log) => {
        const key = "barrier_loop_sync_melodyA_waits_for_melodyB";

        // Melody B: 0.30 loop
        root.branch(async (b) => {
          for (let cycle = 0; cycle < 3; cycle++) {
            startBarrier(key, b);
            log(b, `B_start_${cycle}`);
            await b.waitSec(0.30);
            log(b, `B_end_${cycle}`);
            resolveBarrier(key, b);
          }
        }, "melodyB");

        // Melody A: 0.20 loop, then await barrier
        await root.branchWait(async (a) => {
          for (let cycle = 0; cycle < 3; cycle++) {
            log(a, `A_start_${cycle}`);
            await a.waitSec(0.20);
            log(a, `A_end_${cycle}`);
            await awaitBarrier(key, a);
            log(a, `A_synced_${cycle}`);
          }
        }, "melodyA");
      },
    },

    {
      name: "barrier_race_resolve_then_immediate_restart",
      logicalDurationSec: 0.6,
      run: async (root, log) => {
        const key = "barrier_race_resolve_then_immediate_restart";

        // Producer: resolve then immediately start again at same logical time.
        root.branch(async (b) => {
          startBarrier(key, b);
          await b.waitSec(0.10);
          resolveBarrier(key, b);
          log(b, "B_resolved_0.10");

          // immediate restart
          startBarrier(key, b);
          log(b, "B_restarted_0.10");

          await b.waitSec(0.10);
          resolveBarrier(key, b);
          log(b, "B_resolved_0.20");
        }, "producer");

        // Consumer: arrives exactly at 0.10 and should NOT deadlock waiting on the restarted barrier.
        await root.branchWait(async (a) => {
          await a.waitSec(0.10);
          log(a, "A_before_await_0.10");
          await awaitBarrier(key, a);
          log(a, "A_after_await_0.10");

          await a.waitSec(0.10);
          log(a, "A_before_await_0.20");
          await awaitBarrier(key, a);
          log(a, "A_after_await_0.20");
        }, "consumer");
      },
    },

    {
      name: "tempo_change_shared_retimes_beat_wait",
      bpm: 240, // 4 beats/sec
      logicalDurationSec: 1.2,
      run: async (root, log) => {
        // Wait 4 beats: normally 1.0s at 240 bpm.
        // Change bpm at t=0.5 to 480 (8 beats/sec).
        // At t=0.5, beats progressed = 2; remaining 2 beats at 8 beats/sec = 0.25s => end at 0.75s.
        root.branch(async (ctl) => {
          await ctl.waitSec(0.50);
          root.setBpm(480);
          log(ctl, "tempo_set_480@0.50");
        }, "tempoCtl");

        await root.wait(4);
        log(root, "wait4beats_done"); // expect t≈0.75
      },
    },

    {
      name: "tempo_clone_child_isolated_from_root_changes",
      bpm: 240, // 4 beats/sec
      logicalDurationSec: 1.5,
      run: async (root, log) => {
        // Root changes BPM at 0.5, but child has cloned tempo, so 4 beats remains 1.0s.
        root.branch(async (ctl) => {
          await ctl.waitSec(0.50);
          root.setBpm(480);
          log(ctl, "root_tempo_set_480@0.50");
        }, "tempoCtl");

        await root.branchWait(async (child) => {
          log(child, "child_start");
          await child.wait(4); // with cloned tempo: expect 1.0s
          log(child, "child_done");
        }, "child", { tempo: "cloned" });
      },
    },

    {
      name: "wait0_is_valid_sync_point",
      logicalDurationSec: 0.6,
      run: async (root, log) => {
        const p1 = root.branchWait(async (c) => {
          await c.waitSec(0.10);
          log(c, "p1_done");
        }, "p1");

        const p2 = root.branchWait(async (c) => {
          await c.waitSec(0.20);
          log(c, "p2_done");
        }, "p2");

        await Promise.all([p1, p2]);
        log(root, "after_all_immediate");
        await root.wait(0);
        log(root, "after_all_after_wait0");
      },
    },

    {
      name: "frame_like_loop_waitSec_60fpsish",
      logicalDurationSec: 1.0,
      run: async (root, log) => {
        log(root, "start");
        const dt = 1 / 60;

        // simulate ~30 frames
        for (let i = 0; i < 30; i++) {
          await root.waitSec(dt);
          log(root, `frame_${i}`);
        }
        log(root, "done");
      },
      tolerances: { orderWindowSec: 0.02 },
    },

    {
      name: "noteoff_finally_guaranteed_on_cancel",
      logicalDurationSec: 1.2,
      run: async (root, log) => {
        // Note1: completes naturally
        log(root, "note1_on");
        const note1 = root.branch(async (c) => {
          await c.waitSec(0.30);
          log(c, "note1_off_in_branch");
        }, "note1");
        note1.finally(() => log(root, "note1_off_finally"));

        // Note2: canceled before it reaches off-in-branch
        await root.waitSec(0.05);
        log(root, "note2_on");
        const note2 = root.branch(async (c) => {
          await c.waitSec(0.30);
          log(c, "note2_off_in_branch");
        }, "note2");
        note2.finally(() => log(root, "note2_off_finally"));

        await root.waitSec(0.15);
        log(root, "cancel_note2");
        note2.cancel();

        // allow note1 to finish and finally hooks to run
        await root.waitSec(0.25);
        log(root, "done");
      },
      tolerances: { orderWindowSec: 0.02 },
    },

    {
      name: "waitSec_negative_and_NaN_are_safe",
      logicalDurationSec: 0.4,
      run: async (root, log) => {
        log(root, "start");

        await root.waitSec(-0.10); // should clamp to 0
        log(root, "after_neg_wait");

        // @ts-ignore - intentionally pass NaN
        await root.waitSec(NaN);
        log(root, "after_nan_wait");

        await root.waitSec(0.10);
        log(root, "after_0.10");
      },
    },
  ];
}

/* ------------------------------------------------------------------------------------------------
 * Public test runner functions
 * ------------------------------------------------------------------------------------------------ */

export async function runTimingTestCaseBothModes(tc: TimingTestCase): Promise<TestResult> {
  const realtimeEvents = await runRealtime(tc);
  console.log(`[TimingTests] finish realtime ${tc.name}`);
  const offlineEvents = await runOffline(tc);
  console.log(`[TimingTests] finish offline ${tc.name}`);

  compareOfflineVsRealtime(tc.name, offlineEvents, realtimeEvents, tc.tolerances);

  return { name: tc.name, offlineEvents, realtimeEvents };
}

/**
 * Runs all default test cases. Throws aggregated error on any failure.
 * Returns results for optional debugging/inspection.
 */
export async function runAllTimingTests(
  cases: TimingTestCase[] = makeTimingTestCases(),
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const failures: { name: string; err: any }[] = [];

  for (const tc of cases) {
    try {
      console.log(`[TimingTests] Running test case: ${tc.name}`);
      results.push(await runTimingTestCaseBothModes(tc));
    } catch (err) {
      failures.push({ name: tc.name, err });
    }
  }

  if (failures.length) {
    const msg =
      `Timing engine tests failed (${failures.length}/${cases.length}):\n` +
      failures.map((f) => `- ${f.name}: ${String(f.err?.message ?? f.err)}`).join("\n");
    // Throw one aggregated error (works with any test runner)
    throw new Error(msg);
  }

  return results;
}
