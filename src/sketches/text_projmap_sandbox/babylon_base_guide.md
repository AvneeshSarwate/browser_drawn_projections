You can totally do this in Babylon with WebGPU + WGSL – the whole “stream compacted point cloud from an image” is a great fit for a ComputeShader + StorageBuffers + a WGSL vertex shader.

Below I’ll break it into:

1. Data flow / architecture
2. Compute shader for **image → compact particle buffer** (with atomics)
3. JS/TS glue code using Babylon’s **ComputeShader** and **StorageBuffer**
4. Hooking the result into rendering (ShaderMaterial + StorageBuffer)
5. Where to put the lerp / warp logic

I’ll focus on the compaction + atomics in detail, since that’s what you asked for.

---

## 1. High-level data flow

You only really need three GPU buffers and one texture:

* **Input texture**: the image with alpha
* **Particle storage buffer**: an array of structs `{ uv, color }`
* **Atomic counter buffer**: a single `u32` incremented for each “active” pixel
* **Uniform buffer**: alpha threshold, max particle count, etc.

Pipeline:

1. Load image as `Texture` in Babylon.
2. Dispatch a WebGPU `ComputeShader` that:

   * walks the texture pixels in parallel
   * for pixels with `alpha > threshold`:

     * uses `atomicAdd` to grab an index
     * writes `(uv, color)` into `particles[index]`
3. Optionally read back the atomic counter once to know the **actual particle count**.
4. Use the `particles` StorageBuffer in a **WGSL vertex shader** for a custom ShaderMaterial that renders instanced circles and does the warp (`lerp`) between “image layout” and “target layout”.

Babylon has first-class support for **WGSL compute shaders**, textures, storage buffers and uniform buffers via the `ComputeShader` and `StorageBuffer` classes. ([doc.babylonjs.com][1])

---

## 2. WGSL compute shader – stream compaction with atomics

### Particle + counter layout

To keep layout rules simple, define each particle as 2 × `vec4<f32>` (8 floats = 32 bytes):

```wgsl
// In compute shader WGSL
struct Particle {
    // xy = uv in [0,1], zw unused (padding/alignment)
    uvAndPad : vec4<f32>;
    color    : vec4<f32>;
};

struct Particles {
    data : array<Particle>;
};

struct Counter {
    value : atomic<u32>;
};

struct Settings {
    alphaThreshold : f32;
    maxParticles   : u32;
    // padding to 16 bytes for uniform layout rules
    pad            : vec2<f32>;
};

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> outParticles : Particles;
@group(0) @binding(2) var<storage, read_write> counter : Counter;
@group(0) @binding(3) var<uniform> settings : Settings;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let dims = textureDimensions(inputTex);
    if (gid.x >= dims.x || gid.y >= dims.y) {
        return;
    }

    let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5, 0.5)) / vec2<f32>(dims);

    // Using textureLoad avoids needing a sampler binding
    let col = textureLoad(inputTex, vec2<i32>(gid.xy), 0);

    if (col.a <= settings.alphaThreshold) {
        return;
    }

    // Stream compaction with an atomic counter
    let idx = atomicAdd(&counter.value, 1u);

    if (idx >= settings.maxParticles) {
        // Avoid writing past the end if someone undersized the buffer
        return;
    }

    outParticles.data[idx].uvAndPad = vec4<f32>(uv, 0.0, 0.0);
    outParticles.data[idx].color    = col;
}
```

Key bits:

* `textureDimensions` + `textureLoad` lets you index the 2D texture with integer pixel coords; no sampler needed.
* `atomicAdd` on `counter.value` gives each alive pixel a unique index into the compacted array.
* We guard against overflow with `maxParticles`.

---

## 3. Babylon.js side – WebGPU compute with StorageBuffer + atomics

Assuming you’re using modules (TS/ESM) and WebGPU only:

```ts
import {
  WebGPUEngine,
  Scene,
  Texture,
  ComputeShader,
  StorageBuffer,
  UniformBuffer,
  Constants,
} from "@babylonjs/core";
```

### 3.1. WebGPU engine + scene

```ts
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

const engine = new WebGPUEngine(canvas, {
  // optional: enableAllFeatures: true, setMaximumLimits: true
});
await engine.initAsync(); // required for WebGPU backend 

const scene = new Scene(engine);
```

### 3.2. Load the source image as a texture

```ts
const sourceTex = new Texture("assets/myImage.png", scene, undefined, false);
await sourceTex.whenReadyAsync();

const { width, height } = sourceTex.getSize();
const maxParticles = width * height;  // worst case: every pixel is opaque
```

### 3.3. Create storage buffers (particles + atomic counter)

Each `Particle` is 8 floats → 32 bytes:

```ts
const FLOATS_PER_PARTICLE = 8;
const BYTES_PER_PARTICLE  = FLOATS_PER_PARTICLE * 4;

// Storage buffer for compacted particles
const particlesBuffer = new StorageBuffer(
  engine,
  BYTES_PER_PARTICLE * maxParticles,
  // read/write, plus STORAGE is added automatically by Babylon :contentReference[oaicite:2]{index=2}
  Constants.BUFFER_CREATIONFLAG_READWRITE
);

// Atomic counter buffer (single u32)
const counterBuffer = new StorageBuffer(
  engine,
  4,
  Constants.BUFFER_CREATIONFLAG_READWRITE
);
```

> Note: if you later also want to use this buffer as a vertex buffer (via `new VertexBuffer(engine, particlesBuffer.getBuffer(), ...)`) you’d add the `BUFFER_CREATIONFLAG_VERTEX` flag as well. ([Babylon.js][2])

### 3.4. Uniform buffer for settings

```ts
const settingsUBO = new UniformBuffer(engine);

settingsUBO.addUniform("alphaThreshold", 1);
settingsUBO.addUniform("maxParticles", 1);
settingsUBO.addUniform("pad", 2); // vec2 padding, not strictly used

settingsUBO.updateFloat("alphaThreshold", 0.01);      // tweak to taste
settingsUBO.updateUInt("maxParticles", maxParticles); // matches WGSL struct
settingsUBO.update();
```

### 3.5. Create the ComputeShader

Babylon’s `ComputeShader` takes WGSL source plus a `bindingsMapping` that maps WGSL variable names to (group, binding) indices. ([doc.babylonjs.com][1])

```ts
const computeSource = /* WGSL string from section 2 */;

const cs = new ComputeShader(
  "imageToParticles",
  engine,
  { computeSource },
  {
    bindingsMapping: {
      inputTex:     { group: 0, binding: 0 },
      outParticles: { group: 0, binding: 1 },
      counter:      { group: 0, binding: 2 },
      settings:     { group: 0, binding: 3 },
    },
  }
);
```

Bind the resources:

```ts
cs.setTexture("inputTex", sourceTex);              // texture_2d<f32> :contentReference[oaicite:5]{index=5}
cs.setStorageBuffer("outParticles", particlesBuffer);
cs.setStorageBuffer("counter", counterBuffer);     // storage buffer binding :contentReference[oaicite:6]{index=6}
cs.setUniformBuffer("settings", settingsUBO);
```

### 3.6. Dispatch and read the compacted count

Before each dispatch, zero the counter:

```ts
function resetCounter() {
  counterBuffer.update(new Uint32Array([0]));
}
```

Then dispatch:

```ts
resetCounter();

const workgroupSize = 8;
const xGroups = Math.ceil(width  / workgroupSize);
const yGroups = Math.ceil(height / workgroupSize);

// dispatchWhenReady is handy to avoid worrying about shader readiness 
await cs.dispatchWhenReady(xGroups, yGroups, 1);
```

Read the final count:

```ts
const counterData = await counterBuffer.read();
const particleCount = new Uint32Array(counterData.buffer)[0];
console.log("Compacted particles:", particleCount);
```

Note: reading back a buffer stalls the GPU/CPU a bit; for a single `u32` done once when you change the texture it’s usually fine. If you try to do this every frame you’ll hit latency issues, as others have observed when reading data from compute shaders. ([Babylon.js][3])

At this point you have a GPU-resident, **stream-compacted** array of `(uv, color)` data representing the visible pixels of your image.

---

## 4. Rendering the particles from the StorageBuffer

There are two main ways to hook this into Babylon’s rendering:

1. **Use StorageBuffer directly in a WGSL vertex shader** (my recommendation)
2. Convert the StorageBuffer to a `VertexBuffer` and attach it to a mesh

### 4.1. Using StorageBuffer in a ShaderMaterial (WGSL)

Babylon’s `ShaderMaterial` lets you feed a `StorageBuffer` into your vertex/fragment WGSL via `setStorageBuffer`, similar to compute shaders. ([doc.babylonjs.com][4])

Conceptual pieces:

* A **unit quad or disc mesh** that will be instanced many times.
* A WGSL vertex shader that:

  * uses `@builtin(instance_index)` to fetch its `Particle` from the storage buffer
  * computes a position between “image uv projected into world” and “procedural layout” using a lerp parameter `t`.
* A fragment shader that just outputs `particle.color` (maybe with soft edges for circles).

Very stripped-down WGSL vertex idea (you’ll need to fit this into Babylon’s WGSL conventions from their `webGPUWGSL` doc, but the logic is what matters): ([doc.babylonjs.com][5])

```wgsl
struct Particle {
    uvAndPad : vec4<f32>;
    color    : vec4<f32>;
};
struct Particles {
    data : array<Particle>;
};

struct VSIn {
    @location(0) position      : vec3<f32>;       // quad/disc vertex
    @builtin(instance_index) instanceIndex : u32;
};

struct VSOut {
    @builtin(position) position : vec4<f32>;
    @location(0) vColor         : vec4<f32>;
};

@group(0) @binding(0) var<storage, read> particles : Particles;

// uniforms you'd wire up from Babylon:
// - world, viewProjection, time, particleCount, etc.

@vertex
fn main(input : VSIn) -> VSOut {
    let idx = input.instanceIndex;
    let p   = particles.data[idx];

    let uv = p.uvAndPad.xy;

    // Image layout (e.g. map UV into [-1,1] plane)
    let srcPos = vec3<f32>(uv * 2.0 - vec2<f32>(1.0, 1.0), 0.0);

    // Target layout: put points on a circle
    // (particleCount passed as uniform)
    let angle = 6.2831853 * f32(idx) / max(1.0, f32(particleCount));
    let radius = 0.8;
    let dstPos = vec3<f32>(cos(angle) * radius, sin(angle) * radius, 0.0);

    // `t` is lerp parameter in [0,1] driven from CPU over time
    let pos = mix(srcPos, dstPos, lerpT) + input.position; // offset quad verts

    var out : VSOut;
    out.position = viewProjection * world * vec4<f32>(pos, 1.0);
    out.vColor   = p.color;
    return out;
}
```

On the JS/TS side (very schematic):

```ts
import {
  ShaderLanguage,
  ShaderMaterial,
  MeshBuilder,
  Color4,
  Vector3,
  ShaderStore,
} from "@babylonjs/core";

// Register WGSL strings into ShaderStore.ShadersStoreWGSL if you want to load by name. :contentReference[oaicite:11]{index=11}
ShaderStore.ShadersStoreWGSL["imageParticlesVertexShader"]   = imageParticlesVertexWGSL;
ShaderStore.ShadersStoreWGSL["imageParticlesFragmentShader"] = imageParticlesFragmentWGSL;

const material = new ShaderMaterial(
  "imageParticles",
  scene,
  {
    vertex: "imageParticles",
    fragment: "imageParticles",
  },
  {
    attributes: ["position"],
    uniforms: ["world", "viewProjection", "lerpT", "particleCount"],
    shaderLanguage: ShaderLanguage.WGSL,
  }
);

// Bind the storage buffer produced by the compute shader:
material.setStorageBuffer("particles", particlesBuffer);

// Example: a simple disc mesh, rendered as instanced circles:
const disc = MeshBuilder.CreateDisc(
  "particleDisc",
  { radius: 0.01, tessellation: 16 },
  scene
);
disc.material = material;

// We'll draw `particleCount` instances, one per compacted particle
disc.forcedInstanceCount = particleCount;  // mesh has this property now :contentReference[oaicite:12]{index=12}
```

Here the key is that Babylon’s draw call uses instancing, and your WGSL vertex shader uses `instance_index` to choose the right `Particle` from the storage buffer. You don’t have to build a vertex buffer manually for the per-instance data; the StorageBuffer is the source of truth.

If you don’t like `forcedInstanceCount` or want completely GPU-driven draws, you can go lower-level and build your own WebGPU render pipeline that uses `drawIndirect` with a count written by a second compute shader – but that’s outside Babylon’s high-level API and you’d essentially be doing “raw WebGPU + Babylon” as the docs/forum warn is more manual. ([Babylon.js][2])

---

## 5. Where to put the warp / lerp logic

You’ve basically got three options:

1. **In the vertex shader (recommended)**

   * Store only image-space `uv` + `color` in the compacted buffer.
   * Compute destination layout procedurally from `instance_index` and a small set of uniforms (radius, seed, etc).
   * Lerp between them using a time-varying uniform `t` like in the WGSL snippet above.

2. **In a second compute shader**

   * After compaction, run another compute step that:

     * reads `(uv, color)`
     * precomputes a 3D `startPos` and `targetPos` and writes them into another storage buffer
   * Vertex shader simply reads `mix(startPos, targetPos, t)`.

3. **CPU-side precomputation for the “target” layout**

   * Only if you really want to, you can generate target positions on CPU, upload them once into a second StorageBuffer, and still do the lerp in the vertex shader.

For what you described (“warp your image as if it were a point cloud”), the **procedural target position inside the vertex shader** is usually the nicest: you never touch the CPU again except to bump a `time` uniform and maybe tweak parameters.

---

## 6. TL;DR

* Use **Babylon’s WebGPUEngine + ComputeShader + StorageBuffer** to do the image scan and compaction entirely on the GPU in WGSL. ([doc.babylonjs.com][1])
* Implement stream compaction with an **atomic `<u32>` counter** and a struct-of-arrays storage buffer sized for `width * height`.
* Read back the final count once if you want to set `forcedInstanceCount` to match the number of live particles.
* For rendering, either:

  * consume the `StorageBuffer` directly in a WGSL vertex shader using `@builtin(instance_index)`, or
  * turn it into a `VertexBuffer` via `new VertexBuffer(engine, storageBuffer.getBuffer(), ...)` if you prefer that pattern. ([Babylon.js][2])
* Put your **warp / lerp** math in the vertex shader so you can freely animate between “image layout” and any procedural configuration (circle, spiral, noise field) without more compute passes.

If you want, next step I can sketch a concrete pair of WGSL vertex/fragment shaders tailored to however you’d like to render the circles (billboarded quads, soft-edged discs, etc.), using the exact same `Particle` layout as the compute stage.

[1]: https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader?utm_source=chatgpt.com "Compute Shaders | Babylon.js Documentation"
[2]: https://forum.babylonjs.com/t/data-transfer-from-compute-shader-to-renderer/45576?utm_source=chatgpt.com "Data transfer from compute shader to renderer - Questions"
[3]: https://forum.babylonjs.com/t/sroragebuffer-read-works-in-playgound-but-not-in-web-app/55531?utm_source=chatgpt.com "SrorageBuffer.Read() works in Playgound but not in web app"
[4]: https://doc.babylonjs.com/typedoc/classes/BABYLON.ShaderMaterial?utm_source=chatgpt.com "ShaderMaterial"
[5]: https://doc.babylonjs.com/setup/support/webGPU/webGPUWGSL/?utm_source=chatgpt.com "Writing shaders for WebGPU in WGSL"
