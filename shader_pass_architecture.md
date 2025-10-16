# Post-Processing Shader Pass Architecture

This document describes how multi-pass post-processing shaders are authored in WGSL and how the tooling in this repository generates and executes the corresponding Babylon.js runtime helpers. Follow these conventions whenever you add or modify a post-processing effect so that the generator (`node_src/wgsl/generateFragmentShader.ts`) can create the correct TypeScript bindings.

## Source File Layout

Each post effect is described by a single `*.fragFunc.wgsl` file under `src/rendering/postFX`. The generator scans these files and produces a matching `*.frag.generated.ts` helper that encapsulates vertex/fragment WGSL sources, texture bindings, uniform setters, and the `CustomShaderEffect` wrapper used at runtime.

Author the WGSL file using the following structure:

1. **Uniform struct (optional).** Declare a WGSL `struct` that contains the uniform fields for the effect. Inline comments of the form `// <defaultValue>` can be attached to each field to seed default uniforms in the generated class.
2. **Helper functions (optional).** Any pure WGSL helpers that are shared between passes.
3. **Pass functions.** One or more functions named `pass0`, `pass1`, … `passN`, each returning a `vec4f`. These are the entry points that the generator emits as fragment shader variants.

## Pass Function Signature Rules

Every pass function must follow strict argument naming and ordering conventions so the generator can infer texture bindings and pass dependencies:

1. **UV coordinate.** The first argument must be named `uv` and typed `vec2f`.
2. **Uniform struct (optional).** If the effect uses uniforms, the second argument must be the struct type declared above and is typically named `uniforms`. All subsequent passes must repeat this parameter with the same name and type.
3. **Input textures.** After the optional uniforms, list the effect's external texture inputs as *texture/sampler pairs*. Each texture argument must be typed `texture_2d<f32>` and its paired sampler must be typed `sampler` with the name `<textureName>Sampler`. These base input pairs establish the texture bindings that the runtime exposes to callers. Every pass must include the same pairs in the same order.
4. **Pass dependencies (pass1 and later only).** Pass functions beyond `pass0` can append additional texture/sampler pairs that request the output of earlier passes. Use the naming pattern `pass<N>Texture` and `pass<N>Sampler`, where `<N>` is the index of the dependency (e.g. `pass0Texture`, `pass0Sampler`). A pass may list multiple dependencies but only on strictly earlier passes; duplicate or forward references are rejected by the generator.

The generator enforces all of these rules and will throw if a pass violates them (for example, if `pass1` omits the base texture inputs, renames a sampler, or references `pass3Texture` before `pass3` exists).

## Generated Bindings

For each WGSL file, the generator emits:

- The vertex shader source shared by all passes.
- A fragment shader source array, one entry per pass (`pass0`, `pass1`, …).
- A `PassTextureSources` metadata array describing, for every pass, how each `var <textureName>` binding is fulfilled. Base inputs are tagged as `{ kind: 'input', key: '<textureName>' }` while inter-pass dependencies are tagged with `{ kind: 'pass', passIndex: <N> }`.
- TypeScript types and helper functions for uniforms (`set<MyUniforms>`), texture names, and material handles.
- A `CustomShaderEffect` subclass that wires the metadata into the runtime.

## Runtime Execution Model

`CustomShaderEffect` (defined in `src/rendering/shaderFXBabylon.ts`) consumes the generated metadata to:

- Instantiate one Babylon.js `ShaderMaterial` per pass via the generated factory.
- Maintain dedicated render targets for every non-final pass so that complex dependency graphs (beyond simple ping-pong) function correctly.
- Bind each pass's declared inputs by following the `PassTextureSources` metadata, ensuring that `passNTexture` arguments receive the actual texture produced by `passN`.
- Expose a consistent API for setting textures (`setSrcs`) and uniforms (`setUniforms`) using the generated type information.

Because each pass renders into its own target, the system supports arbitrary directed acyclic graphs of dependencies described in a single WGSL file, with the generator preventing circular references at build time.

## Authoring Checklist

When creating or updating a post-processing effect:

- Ensure every pass function signature adheres to the rules above.
- Keep texture names descriptive and consistent across passes; the generator uses them verbatim as binding keys.
- Add default uniform values via inline comments if you want the generated effect to seed them automatically.
- Run the fragment generator (typically via `npm run build` or the relevant script) so that the `*.frag.generated.ts` file stays in sync.

Following these conventions guarantees that the runtime can stitch together multi-pass effects reliably without manual texture management or ad-hoc binding code.
