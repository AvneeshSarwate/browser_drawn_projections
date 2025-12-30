https://chatgpt.com/c/6954287f-36f4-8333-b0df-b84b9073f1ec

Below is a more narrative design doc that motivates the problem, explains the “Flux-like” data flow, and then explains how the isomorphic interface + dual-backend codegen + state→diff→reconciler pipeline fits together.

I also saved it as a markdown file you can keep: [Download the design doc](sandbox:/mnt/data/power2d_isomorphic_livecoding_design.md)

---

# Power2D Isomorphic Livecoding + Rendering Architecture (Deno Notebook ↔ Browser)

## Why this exists

You have two places you want to write creative coding loops:

* A **Deno-backed VS Code notebook**, where you want the “livecoding flow” (rerun cells, tweak numbers, iterate quickly).
* A **browser project**, where the real renderer lives (Babylon via your Power2D abstraction: `StyledShape` / `BatchedStyledShape` driven by typed material wrappers generated from WGSL). 

The friction is that these two contexts don’t share the same runtime. In the browser, you can instantiate and mutate render objects directly; in Deno you can’t—yet you still want to express the same intent: “create a shape, animate its uniforms, update its points, set textures.”

The usual solution is to invent a separate “state update API” for the notebook and then re-express things in the browser. But that breaks the whole “mostly copy/paste” dream.

So we invert it: instead of asking “how do I sync state between two different render APIs?”, we ask:

> **Can the notebook and browser share the *same sketch API*—with different backends underneath—so the loop code itself is portable?**

That’s the design.

---

## The core idea (one API, two backends)

We define a **portable Power2D API** that sketch code uses everywhere. It is:

* **small and stable**: the handful of operations that matter in sketches
* **typed**: material uniforms and texture name unions are still strongly typed (from WGSL codegen)
* **Babylon-free at the type level**: no `BABYLON.Scene`, no `BABYLON.Mesh`, no `BABYLON.Vector3`, no DOM canvas types

Then we implement that same API twice:

1. **Babylon backend (browser runtime)**
   The portable calls (e.g. `shape.body.setUniforms`, `shape.setPoints`, `shape.alphaIndex = …`) directly mutate real Babylon objects via your Power2D abstraction. This is basically what your current usage examples show. 

2. **State backend (notebook runtime)**
   The portable calls do not render. They write “desired render state” into a registry and set granular dirty flags. A flush loop turns those changes into a diff stream.

During livecoding, you run the state backend in the notebook and send diffs to the browser. When the sketch is ready, you copy/paste the loop code into the browser project and just swap the backend wiring—same code, different runtime.

---

## High-level data flow: “Flux-like, with loops in the middle”

Your intuition here is right: it *is* “Flux-like,” but instead of reducers being the only place transformation happens, you have **systems/loops** in the middle.

The conceptual pipeline is:

1. **UI / input** produces *metadata or intent*
   e.g. “brush size,” “selected tool,” “toggle X,” “dragged control point index,” etc.

2. **Systems/loops** consume that metadata and produce **authoritative render state**
   The loop decides “what should be true this frame,” and expresses it by calling the portable shape API (set uniforms, set points, etc.).

3. **Rendering consumes render state**
   In the browser backend, the rendering is immediate. In the notebook backend, state is recorded → diffed → applied.

The key property is: **render data flows one way**. UI doesn’t directly mutate Babylon; it influences metadata, and the loop is responsible for reflecting that into the core render state.

---

## What “portable API” means in practice

Your current spec already leans toward this style: explicit “setter” style operations like `setUniforms`, `setTexture`, `setPoints`, and `alphaIndex` for ordering.  

To make it genuinely portable, we tighten the rule:

### The core surface area must not expose Babylon/DOM types

The spec itself already calls out that vectors should be arrays, not Babylon types. 
So the isomorphic interface uses things like:

* `Vec2 = [number, number]`
* `Vec3 = [number, number, number]`
* `TextureId = string` (or a branded string later)

### No “naked” mutability from getters

A big reason is simple dirty tracking: if you return a mutable object (like a Babylon `Vector3`), user code can mutate it without the wrapper knowing. That makes state-backend dirty tracking hard without proxies.

So for portable code, transforms are set through explicit setters (or assignment of array values) rather than `shape.position.x += …`. (Debug-only escape hatches are still allowed, but intentionally separated so sketches don’t accidentally depend on them.)

### Debug is opt-in

You can keep the “sloppy but convenient” exposed properties (meshes, Babylon vectors) for debugging *behind a different import path*, so they can’t creep into the copy/pasteable core.

---

## Materials and codegen: keep the typing, add dual backends

Your Power2D design is built around: write `.material.wgsl` → Vite plugin generates a TS wrapper with typed uniforms/textures and a `createMaterial(scene, name)` factory.  

To make that isomorphic, the generator output needs to be split conceptually:

1. **Types-only output (portable)**
   Uniform types, texture name union, defaults/meta. No Babylon imports.

2. **Babylon binding output**
   Actually constructs Babylon `ShaderMaterial` and implements the `MaterialInstance` interface (`setUniforms`, `setTexture`, `setCanvasSize`, `dispose`). Your current generated example already looks like this, just Babylon-specific. 

3. **State binding output**
   Implements the *same* interface but only records values (uniforms, texture IDs, canvas size). No GPU work.

This keeps the “pass-through typing” you want: `StyledShape<SpecificUniforms, SpecificTextureNames, …>` still works, and the only difference is which binding module you used to create the material instance.

Also note: your system injects canvas size uniforms and expects them updated every frame in the current spec/addendum.  That becomes a first-class portable operation (`setCanvasSize`) that both backends can handle.

---

## Textures: replace “texture sources” with `TextureId` + registry

Right now the Power2D spec supports multiple “texture source” forms (BaseTexture, RenderTargetTexture, canvas, ShaderEffect-like output) , and the implementation even contains internal resolution logic that converts those sources into a Babylon texture (including dynamic texture updates for canvases). 

That’s great for browser ergonomics, but it’s exactly the kind of thing that destroys isomorphism.

So the portable core becomes:

* `setTexture(name, textureId)` where `textureId` is just an identifier.

Then each backend interprets that ID via a `TextureRegistry`:

* **Browser registry**: `textureId → BABYLON.BaseTexture`. It can also encapsulate your current “resolve from canvas / ShaderEffect output / etc.” logic internally (but the portable API never sees those raw types).
* **State registry**: doesn’t resolve; it records the ID so diffs can forward it.

This gets you portability without losing your rich browser texture convenience—those conveniences just move behind the browser registry.

---

## State backend: registry + granular dirty flags

In the notebook backend, the “shape objects” you hand to the sketch code are handles that write to a registry:

* On creation, the wrapper assigns a stable `ShapeId` (this is also where you ensure consistent identity for reconciler lifecycle).
* Each call updates stored desired state and sets dirty flags for just that category.

This is intentionally simple: the sketch code still “feels” like it’s manipulating shapes, but under the hood you’re just building a state tree plus a set of dirty IDs.

Granularity matters because some operations are fundamentally expensive in your abstraction:

* `setPoints` triggers re-triangulation and, in the current implementation, disposes and rebuilds the body mesh (and rebuilds stroke if present). 
* stroke thickness changes rebuild the stroke mesh when the value changes. 

Dirty categories let you avoid “any change causes expensive rebuilds” without making the reconciler clever.

---

## Diff emission: one-way state → browser (for now)

A simple 60fps loop (or an explicit `flush()` call) produces a diff message containing:

* **creates**: new shapes + initial state
* **updates**: only dirty categories
* **deletes**: removed shape IDs

This is the seam where network sync will eventually plug in, but the reconciler design doesn’t depend on the transport. For now it’s one-way.

---

## Browser StateListener/Reconciler: apply diffs to Power2D/Babylon

In the browser you run a `StateListener` that:

* Maintains `Map<ShapeId, StyledShapeInstance>`
* On **create**: instantiates a Babylon backend `StyledShape` using the generated Babylon material bindings (the same style shown in your usage example). 
* On **update**: routes changes to the right methods: `body.setUniforms`, `stroke.setUniforms`, `setPoints`, `setAttributes`, `alphaIndex`, `setCanvasSize`, etc. 
* On **delete**: disposes the shape and its resources

Importantly: this reconciler does **not** try to mirror Babylon’s full API; it only mirrors your abstraction. That’s why it can stay small.

---

## The copy/paste story (how it feels day to day)

The “livecoding → production” workflow becomes:

### Livecoding

* Notebook constructs a `Power2DContext({ backend: "state", … })`.
* Sketch code uses that context to create and update shapes (portable API only).
* State backend emits diffs.
* Browser runs a `StateListener` that applies diffs onto a real Babylon scene.

### Production/browser sketch

* Browser constructs `Power2DContext({ backend: "babylon", engine, scene, textureRegistry, … })`.
* Paste the same loop code. It runs directly against the Babylon backend.

The only thing you change is the **context construction**, not the sketch logic.

---

## Implementation outline (concrete but not “agent-level”)

1. **Extract a portable core interface package**

   * Define portable types (`Vec2`, `Vec3`, `TextureId`, `ShapeId`)
   * Define interfaces for `StyledShape`, material instances, texture registry, and the context/factory that creates shapes

2. **Refactor the Babylon backend to conform to the portable surface**

   * Remove Babylon/DOM types from the public core interface (vectors become arrays)
   * Move debug-only exposure (meshes, Babylon vectors) behind a separate import path

3. **Introduce `TextureRegistry` and make textures ID-based**

   * Portable `setTexture(name, textureId)`
   * Browser registry resolves IDs to Babylon textures (and can contain the existing multi-source resolution logic)

4. **Update WGSL codegen to support dual backends**

   * Types-only output
   * Babylon binding output
   * State binding output (records values, no Babylon dependency)

5. **Implement the state backend**

   * Registry + per-shape desired state
   * Shape handles that update state and set dirty flags
   * `flush()` that returns `{create/update/delete}` diffs

6. **Implement the browser StateListener/Reconciler**

   * Create/update/delete mapping to Babylon backend shapes
   * Apply diff categories via your wrapper methods

7. **Prove the copy/paste goal**

   * Write one sketch file that runs in notebook-mode and browser-mode by only swapping context construction.

(Then later: extend the same approach to `BatchedStyledShape` and two-way sync once the “core loop portability” feels solid.)
