// timing_engine_determinism_test_suite.ts
// Runner-agnostic: exports async functions that throw on failure.
//
// This suite assumes the engine now provides these guarantees when user code “follows the rules”:
// 1) Deterministic logical-time ordering across realtime vs offline
//    - same initial state
//    - no shared-state mutation outside scheduler-driven continuations
//    - avoid awaiting arbitrary (non-engine) Promises for timing/control flow
// 2) Deterministic tie-breaking for events at the same logical timestamp
//    - ordering is arbitrary but stable (defined by scheduler sequence numbers)
// 3) Seeded randomness:
//    - `launch/launchBrowser` and `OfflineRunner` accept a `seed`
//    - branches should use `ctx.random()` (not Math.random)
//    - RNG is forked per context by default (unless explicitly shared)
//
// Therefore, unlike the old test suite, we can compare event ORDER strictly
// (no windowed order tolerance). We still keep a small time epsilon for safety.

/* ------------------------------------------------------------------------------------------------
 * Imports (change path as needed)
 * ------------------------------------------------------------------------------------------------ */

import {
  OfflineRunner,
  launch,
  startBarrier,
  resolveBarrier,
  awaitBarrier,
  type TimeContext,
  // If you exported RandomSeed, you can import it; otherwise keep local typing.
  // type RandomSeed,
} from "./offline_time_context";

/* ------------------------------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------------------------------ */

export type LoggedEvent = {
  id: string;     // stable unique label (deterministic)
  t: number;      // ctx.time (logical seconds)
  rootT: number;  // ctx.rootContext!.mostRecentDescendentTime at log time
  ctxId: number;  // ctx.id (debug)
  wall: number;   // wall time (debug only; not compared)
  note?: string;  // optional metadata
  value?: number; // optional numeric payload (e.g., rng draw)
};

export type TestTolerances = {
  timeEpsSec?: number;   // abs time diff allowed per event (offline vs realtime)
  valueEps?: number;     // abs numeric payload diff allowed per event
};

export type TimingTestCase = {
  name: string;
  bpm?: number;
  seed?: string | number; // same seed used for offline and realtime
  logicalDurationSec: number;

  // Optional: run each mode multiple times and ensure repeatability (same events each run).
  // Default: 1
  repeatRuns?: number;

  // Max realtime wall time for a single run. Must be <= 10s per your requirements.
  realtimeTimeoutMs?: number;

  tolerances?: TestTolerances;

  // Scenarios must not rely on waitFrame() for this suite.
  run: (
    ctx: TimeContext,
    log: (ctx: TimeContext, id: string, opts?: { note?: string; value?: number }) => void,
  ) => Promise<void>;
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
  return (ctx: TimeContext, id: string, opts?: { note?: string; value?: number }) => {
    const root = ctx.rootContext!;
    events.push({
      id,
      t: ctx.time,
      rootT: root.mostRecentDescendentTime,
      ctxId: ctx.id,
      wall: performance.now() / 1000,
      note: opts?.note,
      value: opts?.value,
    });
  };
}

function ensureUniqueIds(events: LoggedEvent[], mode: string, testName: string) {
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) fail(`[${testName}] duplicate event id in ${mode}: ${e.id}`);
    seen.add(e.id);
  }
}

function formatEvent(e: LoggedEvent) {
  const v = e.value !== undefined ? ` value=${e.value}` : "";
  const n = e.note ? ` note="${e.note}"` : "";
  return `${e.id}@t=${e.t.toFixed(6)} ctx=${e.ctxId} rootT=${e.rootT.toFixed(6)}${v}${n}`;
}

function diffSnippet(a: LoggedEvent[], b: LoggedEvent[], idx: number, radius = 5) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(a.length, idx + radius + 1);

  const lines: string[] = [];
  lines.push(`First mismatch at index ${idx}:`);
  for (let i = start; i < end; i++) {
    const ae = a[i];
    const be = b[i];
    lines.push(
      `  [${i}] offline:  ${ae ? formatEvent(ae) : "<missing>"}\n` +
      `      realtime: ${be ? formatEvent(be) : "<missing>"}`
    );
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------------------------------------
 * Deterministic comparison logic
 * ------------------------------------------------------------------------------------------------ */

export function compareDeterministicRuns(
  label: string,
  offlineEvents: LoggedEvent[],
  realtimeEvents: LoggedEvent[],
  tolerances?: TestTolerances,
) {
  const timeEps = tolerances?.timeEpsSec ?? 1e-6; // 1 microsecond default
  const valueEps = tolerances?.valueEps ?? 1e-12;

  ensureUniqueIds(offlineEvents, "offline", label);
  ensureUniqueIds(realtimeEvents, "realtime", label);

  if (offlineEvents.length !== realtimeEvents.length) {
    fail(
      `[${label}] event count mismatch: offline=${offlineEvents.length}, realtime=${realtimeEvents.length}`,
    );
  }

  // Strict sequence equality (IDs AND ordering)
  for (let i = 0; i < offlineEvents.length; i++) {
    const o = offlineEvents[i];
    const r = realtimeEvents[i];

    if (o.id !== r.id) {
      fail(`[${label}] event order mismatch.\n` + diffSnippet(offlineEvents, realtimeEvents, i));
    }

    if (!almostEq(o.t, r.t, timeEps)) {
      fail(
        `[${label}] time mismatch for "${o.id}": offline=${o.t.toFixed(6)} realtime=${r.t.toFixed(6)} eps=${timeEps}`,
      );
    }

    // Root invariant: rootT should be >= ctx time at logging instant (it’s a max).
    assert(o.rootT + 1e-12 >= o.t, `[${label}] offline rootT < t at "${o.id}" (rootT=${o.rootT}, t=${o.t})`);
    assert(r.rootT + 1e-12 >= r.t, `[${label}] realtime rootT < t at "${o.id}" (rootT=${r.rootT}, t=${r.t})`);

    // Optional payload comparisons
    const ov = o.value;
    const rv = r.value;
    if (ov !== undefined || rv !== undefined) {
      assert(ov !== undefined && rv !== undefined, `[${label}] value presence mismatch at "${o.id}"`);
      if (!almostEq(ov!, rv!, valueEps)) {
        fail(
          `[${label}] value mismatch for "${o.id}": offline=${ov} realtime=${rv} eps=${valueEps}`,
        );
      }
    }

    const on = o.note;
    const rn = r.note;
    if (on !== undefined || rn !== undefined) {
      assert(on === rn, `[${label}] note mismatch for "${o.id}": offline="${on}" realtime="${rn}"`);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Mode runners
 * ------------------------------------------------------------------------------------------------ */

async function runOfflineOnce(tc: TimingTestCase): Promise<LoggedEvent[]> {
  const events: LoggedEvent[] = [];
  const log = makeLogger(events);

  const runner = new OfflineRunner(async (ctx) => {
    await tc.run(ctx, log);
  }, {
    bpm: tc.bpm ?? 60,
    fps: 60,
    seed: tc.seed ?? tc.name, // <-- deterministic default
  });

  // Single step should be sufficient under the new offline macrotask-yield semantics.
  await runner.stepSec(tc.logicalDurationSec + 0.2);
  await runner.promise;

  return events;
}

async function runRealtimeOnce(tc: TimingTestCase): Promise<LoggedEvent[]> {
  const events: LoggedEvent[] = [];
  const log = makeLogger(events);

  const timeoutMs = tc.realtimeTimeoutMs ??
    Math.min(9000, Math.ceil((tc.logicalDurationSec + 1.0) * 1000));

  const p = launch(async (ctx) => {
    await tc.run(ctx, log);
  }, {
    bpm: tc.bpm ?? 60,
    rate: 1,
    seed: tc.seed ?? tc.name, // <-- deterministic default
  });

  await withTimeout(p, timeoutMs, tc.name);

  return events;
}

async function runRepeated(
  modeLabel: string,
  runs: number,
  runOnce: () => Promise<LoggedEvent[]>,
  tolerances?: TestTolerances,
) {
  const first = await runOnce();
  for (let i = 1; i < runs; i++) {
    const next = await runOnce();
    compareDeterministicRuns(`${modeLabel} repeat ${i}`, first, next, tolerances);
  }
  return first;
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
        await ctx.wait(0);
        log(ctx, "joined");
      },
    },

    {
      // NEW: Explicitly tests deterministic tie-breaking for same-deadline waits.
      // With deterministic scheduler sequence ordering:
      // - A is spawned before B
      // - A schedules its wait before B
      // => A_end must occur before B_end (both at t=0.10).
      name: "deterministic_tie_break_same_deadline_is_stable",
      logicalDurationSec: 0.25,
      run: async (root, log) => {
        log(root, "start");

        const shared: string[] = [];

        const a = root.branchWait(async (c) => {
          log(c, "A_start");
          await c.waitSec(0.10);
          shared.push("A");
          log(c, "A_end");
        }, "A");

        const b = root.branchWait(async (c) => {
          log(c, "B_start");
          await c.waitSec(0.10);
          shared.push("B");
          log(c, "B_end");
        }, "B");

        await Promise.all([a, b]);
        await root.wait(0);
        log(root, "joined", { note: shared.join("") });

        // Explicit guarantee check (not just offline vs realtime equality):
        if (shared.join("") !== "AB") {
          throw new Error(`Expected shared order "AB" but got "${shared.join("")}"`);
        }
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

        await root.waitSec(0.25);
        log(root, "after_cancel_wait");
      },
    },

    {
      name: "barrier_loop_sync_melodyA_waits_for_melodyB",
      logicalDurationSec: 1.2,
      run: async (root, log) => {
        const key = "barrier_loop_sync_melodyA_waits_for_melodyB";

        root.branch(async (b) => {
          for (let cycle = 0; cycle < 3; cycle++) {
            startBarrier(key, b);
            log(b, `B_start_${cycle}`);
            await b.waitSec(0.30);
            log(b, `B_end_${cycle}`);
            resolveBarrier(key, b);
          }
        }, "melodyB");

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

        root.branch(async (b) => {
          startBarrier(key, b);
          await b.waitSec(0.10);
          resolveBarrier(key, b);
          log(b, "B_resolved_0.10");

          startBarrier(key, b);
          log(b, "B_restarted_0.10");

          await b.waitSec(0.10);
          resolveBarrier(key, b);
          log(b, "B_resolved_0.20");
        }, "producer");

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
      bpm: 240,
      logicalDurationSec: 1.5,
      run: async (root, log) => {
        root.branch(async (ctl) => {
          await ctl.waitSec(0.50);
          root.setBpm(480);
          log(ctl, "root_tempo_set_480@0.50");
        }, "tempoCtl");

        await root.branchWait(async (child) => {
          log(child, "child_start");
          await child.wait(4);
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

        for (let i = 0; i < 30; i++) {
          await root.waitSec(dt);
          log(root, `frame_${i}`);
        }
        log(root, "done");
      },
    },

    {
      name: "noteoff_finally_guaranteed_on_cancel",
      logicalDurationSec: 1.2,
      run: async (root, log) => {
        log(root, "note1_on");
        const note1 = root.branch(async (c) => {
          await c.waitSec(0.30);
          log(c, "note1_off_in_branch");
        }, "note1");
        note1.finally(() => log(root, "note1_off_finally"));

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

        await root.waitSec(0.25);
        log(root, "done");
      },
    },

    {
      name: "waitSec_negative_and_NaN_are_safe",
      logicalDurationSec: 0.4,
      run: async (root, log) => {
        log(root, "start");

        await root.waitSec(-0.10);
        log(root, "after_neg_wait");

        // @ts-ignore
        await root.waitSec(NaN);
        log(root, "after_nan_wait");

        await root.waitSec(0.10);
        log(root, "after_0.10");
      },
    },

    /* ----------------------------- NEW: RNG determinism tests ----------------------------- */

    {
      name: "seeded_rng_forked_branches_repeatable",
      seed: "rng_forked_demo_seed",
      repeatRuns: 2, // explicitly test repeatability (within each mode + across modes)
      logicalDurationSec: 0.4,
      tolerances: { valueEps: 1e-15 },
      run: async (root, log) => {
        log(root, "start");

        const a = root.branchWait(async (c) => {
          await c.waitSec(0.05);
          log(c, "A_r0", { value: (c as any).random?.() ?? (c as any).rng?.() }); // prefer ctx.random()
          await c.waitSec(0.05);
          log(c, "A_r1", { value: (c as any).random?.() ?? (c as any).rng?.() });
          await c.waitSec(0.05);
          log(c, "A_r2", { value: (c as any).random?.() ?? (c as any).rng?.() });
        }, "A");

        const b = root.branchWait(async (c) => {
          await c.waitSec(0.10);
          log(c, "B_r0", { value: (c as any).random?.() ?? (c as any).rng?.() });
          await c.waitSec(0.05);
          log(c, "B_r1", { value: (c as any).random?.() ?? (c as any).rng?.() });
        }, "B");

        await Promise.all([a, b]);
        await root.wait(0);
        log(root, "joined");
      },
    },

    {
      name: "seeded_rng_shared_stream_deterministic_under_tie_break",
      seed: "rng_shared_demo_seed",
      repeatRuns: 2,
      logicalDurationSec: 0.3,
      tolerances: { valueEps: 1e-15 },
      run: async (root, log) => {
        log(root, "start");

        // If your engine supports BranchOptions.rng, this test forces shared RNG.
        const a = root.branchWait(async (c) => {
          await c.waitSec(0.05);
          log(c, "A_draw", { value: (c as any).random?.() ?? (c as any).rng?.() });
        }, "A", { rng: "shared" } as any);

        const b = root.branchWait(async (c) => {
          await c.waitSec(0.05);
          log(c, "B_draw", { value: (c as any).random?.() ?? (c as any).rng?.() });
        }, "B", { rng: "shared" } as any);

        await Promise.all([a, b]);
        await root.wait(0);
        log(root, "joined");

        // Deterministic ordering expectation: A_draw then B_draw (same t=0.05) because A is spawned first.
        // The strict event-order comparator enforces this across offline+realtime.
      },
    },
  ];
}

/* ------------------------------------------------------------------------------------------------
 * Public test runner functions
 * ------------------------------------------------------------------------------------------------ */

export async function runTimingTestCaseBothModes(tc: TimingTestCase): Promise<TestResult> {
  const repeats = Math.max(1, Math.floor(tc.repeatRuns ?? 1));

  const realtimeEvents = await runRepeated(
    `[TimingTests][realtime] ${tc.name}`,
    repeats,
    () => runRealtimeOnce(tc),
    tc.tolerances,
  );

  const offlineEvents = await runRepeated(
    `[TimingTests][offline] ${tc.name}`,
    repeats,
    () => runOfflineOnce(tc),
    tc.tolerances,
  );

  compareDeterministicRuns(tc.name, offlineEvents, realtimeEvents, tc.tolerances);
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
      console.log(`[TimingTests] PASS: ${tc.name}`);
    } catch (err) {
      failures.push({ name: tc.name, err });
      console.error(`[TimingTests] FAIL: ${tc.name}`, err);
    }
  }

  if (failures.length) {
    const msg =
      `Timing engine tests failed (${failures.length}/${cases.length}):\n` +
      failures.map((f) => `- ${f.name}: ${String(f.err?.message ?? f.err)}`).join("\n");
    throw new Error(msg);
  }

  return results;
}
