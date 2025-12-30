https://chatgpt.com/c/6954287f-36f4-8333-b0df-b84b9073f1ec

# Power2D Isomorphic Runtime + State Backend + Reconciler (Livecoding-first)

**Purpose:** Enable a “mostly copy/paste” workflow where the *same* sketch/loop code can run:

* in a Deno/VSCode notebook (state-backend, no Babylon/DOM dependencies), and
* in the browser (Babylon backend, real rendering)

…by enforcing a **Babylon-free isomorphic interface**, backed by **two implementations** and supported by **codegen** for material wrappers.

---

## Goals

### Primary goals

* **Copy/pasteable core sketch code**: shape creation + updates + loop logic should compile and behave the same in both environments.
* **Simple mental model**: retained-mode “shape handles” with explicit methods / setters (no deep engine API exposure).
* **Flux-like unidirectional data flow**: UI/inputs → metadata/intents → loop/systems → core render state → rendering output.
* **Typed materials** from WGSL with generated TS wrappers (uniform + texture typing), usable in both backends.

### Non-goals (for now)

* Two-way sync and conflict resolution (can be added later).
* Compute-shader instancing flow (BatchedStyledShape can follow the same patterns later).
* “Perfect performance” or large payload optimization (we’ll keep the architecture compatible with future batching/binary).

---

## Architecture Overview

### Key idea: One interface, two backends

Define a **portable core interface** (Babylon-free) for:

* `StyledShape` / `BatchedStyledShape` handles
* generated `MaterialInstance` wrappers
* texture addressing via `TextureId` + `TextureRegistry`

Then implement the same interfaces twice:

1. **Babylon backend**: shapes are real Babylon scene objects.
2. **State backend**: shapes are “recorders” that write into a registry + dirty flags (no rendering).

A third piece applies state to runtime:
3. **Browser StateListener/Reconciler**: consumes diffs from the state backend (over network or in-process) and mutates the Babylon backend accordingly.

---

## Flux-like Data Flow (Sketch Logic)

The sketch authoring model is intentionally unidirectional:

1. **Inputs/UI** (browser-side) emit *metadata/intents* (e.g., “selected tool”, “current brush”, “slider value”), not direct render mutations.
2. **Loop/system code** consumes that metadata and produces authoritative *render state updates* via the portable shape API.
3. **Rendering layer** (Babylon backend) reflects the state via reconciliation (direct calls or diff application).

This keeps “render data” flowing one way (authoritative loop → render), while still allowing UI influence through metadata.

---

## Portable Core API (Babylon-free)

### Core rules

* **No Babylon/DOM types** in the shared interface.
  Use arrays/tuples for vectors and opaque IDs/handles for resources.
* Avoid returning mutable objects that can be modified “behind your back” (e.g., `shape.position.x += 1`).
  Prefer **explicit setters** to keep dirty tracking simple and consistent.

### Common types

* `Vec2 = [number, number]`
* `Vec3 = [number, number, number]`
* `TextureId = string` (optionally branded later)

### StyledShape interface (portable)

A “shape handle” is the unit of sketch code. The core surface area is intentionally small and stable:

* **Body handle**

  * `body.setUniforms(partialUniforms)`
  * `body.setTexture(textureName, textureId)`
* **Stroke handle (optional)**

  * `stroke.setUniforms(partialUniforms)`
  * `stroke.setTexture(textureName, textureId)`
  * `stroke.thickness = number`
* **Geometry and attributes**

  * `setPoints(points: Vec2[], closed?: boolean)`
  * `setAttributes(name: string, data: Float32Array | number[])`
* **Global shape properties**

  * `setCanvasSize(width, height)`
  * `alphaIndex = number`
  * transform via explicit methods (e.g., `setPosition(Vec3)`, `setRotation(Vec3)`, `setScaling(Vec3)`)

> Debug-only escape hatches (meshes, Babylon vectors, etc.) are allowed **only** behind an explicit “debug import path” so sketches don’t accidentally depend on them.

---

## Enforcing Isomorphism During Development

### Shared interface package

Create a shared module (e.g., `power2d-core`) containing:

* the portable interfaces (`IStyledShape`, `IBatchedStyledShape`, `IMaterialInstance`, etc.)
* portable type aliases (`Vec2`, `Vec3`, `TextureId`, uniform/texture typing utilities)

### Two concrete implementations

* `power2d-babylon`: implements the interfaces using Babylon engine/scene and real materials/meshes.
* `power2d-state`: implements the interfaces by writing desired state into a registry + dirty flags.

TypeScript should ensure both satisfy the shared interface. This is the primary guardrail that keeps “copy/pasteability” real.

### Debug imports

Expose Babylon-only properties via a separate import path, e.g.:

* `import { BabylonDebug } from "power2d-babylon/debug"`
  …so it’s opt-in and doesn’t leak into the portable sketch surface.

---

## Material Wrapper Codegen with Dual Backends

### Problem

Generated material modules currently tend to mix:

* portable type info (uniform struct typing, texture name union)
* backend binding (Babylon `ShaderMaterial`, `createMaterial(scene, ...)`, `BaseTexture`, etc.)

That prevents isomorphic usage.

### Solution: generate three outputs per shader

For each `*.material.wgsl` (and stroke equivalents), generate:

1. **Types-only module (portable)**

   * `Uniforms` type
   * `TextureNames` union
   * defaults / metadata
   * NO Babylon imports

2. **Babylon binding module**

   * creates the real Babylon material instance
   * implements the shared `IMaterialInstance<U, T>` interface
   * resolves `TextureId → Babylon texture` via a provided `TextureRegistry`

3. **State binding module**

   * creates a “material instance” that only records:

     * last uniforms
     * last texture IDs
     * canvas size
   * implements the same `IMaterialInstance<U, T>` interface

### Pass-through typing to shapes

The goal is that `StyledShape<GradientUniforms, GradientTextureName, ...>`-style typing stays intact in both backends because the **portable types are shared** and only the binding differs.

---

## Texture System via Texture Registry

### Why

Directly passing `Canvas`, `BaseTexture`, etc. breaks portability. The portable core should only deal with **texture IDs**.

### Portable design

* Sketch code calls: `shape.body.setTexture("noiseTex", "noiseTexId")`

### Registries per backend

* **Babylon backend registry**

  * Provides a `get(textureId)` that returns (or lazily resolves) a Babylon texture.
  * Can keep the “convenience” of resolving from canvases/effects internally, but that convenience is **not exposed to portable code**.

* **State backend registry**

  * Doesn’t resolve anything; it just forwards / records the texture ID assignment for diff emission.

This keeps the sketch surface stable while preserving powerful texture handling in the real runtime.

---

## State Backend: Registry + Dirty Tracking

### Why

To keep core loop code identical, the “state backend” must look like the Babylon backend from the sketch’s point of view, while internally it’s just building an authoritative state tree.

### Data model

* `ShapeId` is assigned/owned by the state wrapper (authoritative creator).
* A global registry maps `ShapeId → ShapeState` (typed per shape/material).
* Shapes are created through a portable factory/context that returns shape handles.

### Dirty tracking strategy

* **No magic/proxies in user-facing data.**
* Dirty is tracked at the API boundary: each method call marks dirty flags for that shape.
* Registry maintains:

  * `createdIds`, `deletedIds`
  * `dirtyIds` (or a per-shape dirty bitmask)
  * per-category payloads (uniforms updates, points updates, attribute updates, transform updates, etc.)

This avoids full-map scans and keeps the implementation straightforward.

---

## Diff Emission (One-way for now)

At 60fps (or on-demand), the state backend produces a **diff message** representing:

* creates (new shape descriptors + initial state)
* updates (only dirty categories + payloads)
* deletes (ids to remove)

This diff can be:

* sent over a transport (WebSocket, etc.), or
* passed in-process (during early development)

---

## Browser StateListener/Reconciler

### Responsibilities

* Own a `Map<ShapeId, BabylonStyledShapeHandle>`
* On **create**:

  * instantiate Babylon backend `StyledShape` with proper material defs and injected Babylon `TextureRegistry`
* On **update**:

  * apply only the changed categories:

    * uniforms → `setUniforms`
    * texture IDs → `setTexture`
    * points → `setPoints`
    * attributes → `setAttributes`
    * transforms/alphaIndex/canvas size → setters
* On **delete**:

  * dispose/remove the Babylon shape and its resources as appropriate

### Where “expensive vs cheap” logic lives

To keep the reconciler simple, expensive operations should be guarded by:

* **granular dirty categories** (so you only call `setPoints` when points changed), and/or
* **idempotent shape internals** (shape implementation can early-out when no meaningful change)

The reconciler itself stays mostly “route changes to the right method calls.”

---

## Development Workflow

### Livecoding

* In Deno notebook:

  * create shapes via the portable API (state backend)
  * run loops that call `setUniforms`, `setPoints`, `setAttributes`, etc.
  * registry emits diffs per frame

* In browser:

  * StateListener consumes diffs and updates Babylon shapes

### Promotion to production browser code

Because sketch code only uses the portable API:

* the same loop code can be copied into the browser project
* you swap the backend wiring:

  * from `{ backend: "state" }` to `{ backend: "babylon", scene, engine, textureRegistry }`
* everything else remains the same (same shape/material types, same calls)

---

## High-Level Implementation Plan (Concrete Outline)

1. **Extract portable core types + interfaces**

   * Define `Vec2/Vec3`, `TextureId`, `IMaterialInstance`, `IStyledShape`, etc.
   * Remove Babylon/DOM types from shared signatures.

2. **Refactor Babylon implementation to conform**

   * Ensure all public/core entrypoints use portable types (arrays, IDs).
   * Move/contain any Babylon-specific getters/props behind a debug import path.

3. **Introduce TextureRegistry**

   * Define portable `TextureRegistry` interface keyed by `TextureId`.
   * Implement Babylon registry that resolves IDs to Babylon textures.
   * Implement state registry that records IDs only.

4. **Split material codegen outputs**

   * Generate:

     * types-only module
     * Babylon binding module (uses Babylon registry to resolve textures)
     * state binding module (records texture IDs + uniforms)
   * Ensure both binding modules satisfy `IMaterialInstance`.

5. **Implement state backend shapes**

   * `StateStyledShape` / (later) `StateBatchedStyledShape`
   * Each method call updates registry + sets dirty flags.

6. **Implement diff format + emission**

   * Create/update/delete message schema (minimal categories at first).
   * Add `flush()` on registry to produce a diff.

7. **Implement browser StateListener/Reconciler**

   * Map IDs to Babylon shapes.
   * Apply diff categories to Babylon shapes.
   * Verify create/update/delete lifecycle and disposal paths.

8. **End-to-end demo**

   * Simple sketch: create a few shapes, animate uniforms, update points/attributes.
   * Confirm “copy/paste loop code” works with only backend wiring changes.

9. **(Later) Expand surface**

   * Add BatchedStyledShape parity (instancing) under the same core rules.
   * Add two-way sync if needed (actions/intents back to the notebook).

---

If you want, I can also format this into a single `power2d_isomorphic_design.md` file in your repo style (same headings/TOC vibe as your existing spec), but the content above is the full settled design as discussed.
