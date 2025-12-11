// Letter Particles - Placement/Lerp Compute Shader
// Reads compacted particles and generates instance matrices with lerp between source and target layouts

struct Particle {
    uv: vec2<f32>,
    pad: vec2<f32>,
    color: vec4<f32>,
};

struct Counter {
    value: atomic<u32>,
};

struct PlacementSettings {
    lerpT: f32,
    bboxOriginX: f32,
    bboxOriginY: f32,
    bboxWidth: f32,
    bboxHeight: f32,
    canvasWidth: f32,
    canvasHeight: f32,
    targetRadius: f32,
    circleRadius: f32,
    maxParticles: u32,
    liveCount: u32,
    targetLayout: u32,
    seed: f32,
    bboxCenterNdcX: f32,
    bboxCenterNdcY: f32,
    padding: f32,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> settings: PlacementSettings;
@group(0) @binding(2) var<storage, read_write> instanceMatrices: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> instanceColors: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> counter: Counter;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;

    // Bounds check
    if (idx >= settings.maxParticles) {
        return;
    }

    let base = idx * 4u;

    // Load live particle count from compaction pass and clamp to buffer capacity
    let liveCountRaw = atomicLoad(&counter.value);
    let liveCount = min(liveCountRaw, settings.maxParticles);

    // Handle inactive instances (beyond liveCount)
    if (idx >= liveCount) {
        // Move offscreen and zero out
        instanceMatrices[base + 0u] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        instanceMatrices[base + 1u] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        instanceMatrices[base + 2u] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        instanceMatrices[base + 3u] = vec4<f32>(-10000.0, 0.0, 0.0, 1.0);
        instanceColors[idx] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        return;
    }

    let p = particles[idx];

    // Source position: uv -> bbox pixel coords -> NDC
    let canvasPosX = settings.bboxOriginX + p.uv.x * settings.bboxWidth;
    let canvasPosY = settings.bboxOriginY + p.uv.y * settings.bboxHeight;
    let srcNdcX = (canvasPosX / settings.canvasWidth) * 2.0 - 1.0;
    let srcNdcY = 1.0 - (canvasPosY / settings.canvasHeight) * 2.0;
    let srcPos = vec2<f32>(srcNdcX, srcNdcY);

    // Target position based on layout, centered at bbox center in NDC
    var dstPos: vec2<f32>;
    var normalizedIdx: f32 = 0.0;
    if (liveCount > 1u) {
        normalizedIdx = f32(idx) / f32(liveCount - 1u);
    }
    let bboxCenter = vec2<f32>(settings.bboxCenterNdcX, settings.bboxCenterNdcY);

    if (settings.targetLayout == 0u) {
        // Ring layout
        let angle = normalizedIdx * 6.28318530718;
        dstPos = bboxCenter + vec2<f32>(cos(angle), sin(angle)) * settings.targetRadius;
    } else if (settings.targetLayout == 1u) {
        // Spiral layout
        let angle = normalizedIdx * 6.28318530718 * 4.0;
        let r = settings.targetRadius * normalizedIdx;
        dstPos = bboxCenter + vec2<f32>(cos(angle), sin(angle)) * r;
    } else if (settings.targetLayout == 2u) {
        // Noise/random layout using simple hash
        let h1 = fract(sin(f32(idx) * 12.9898 + settings.seed) * 43758.5453);
        let h2 = fract(sin(f32(idx) * 78.233 + settings.seed * 2.0) * 43758.5453);
        dstPos = bboxCenter + (vec2<f32>(h1, h2) * 2.0 - 1.0) * settings.targetRadius;
    } else {
        // Grid layout
        let gridSize = max(1u, u32(ceil(sqrt(f32(liveCount)))));
        let row = idx / gridSize;
        let col = idx % gridSize;
        let cellSize = settings.targetRadius * 2.0 / f32(gridSize);
        dstPos = bboxCenter + vec2<f32>(
            f32(col) * cellSize - settings.targetRadius + cellSize * 0.5,
            f32(row) * cellSize - settings.targetRadius + cellSize * 0.5
        );
    }

    // Lerp between source and target positions
    let pos = mix(srcPos, dstPos, settings.lerpT);

    // Build 2D transformation matrix (scale + translate)
    let scale = settings.circleRadius;
    instanceMatrices[base + 0u] = vec4<f32>(scale, 0.0, 0.0, 0.0);
    instanceMatrices[base + 1u] = vec4<f32>(0.0, scale, 0.0, 0.0);
    instanceMatrices[base + 2u] = vec4<f32>(0.0, 0.0, 1.0, 0.0);
    instanceMatrices[base + 3u] = vec4<f32>(pos.x, pos.y, 0.0, 1.0);

    // Copy particle color
    instanceColors[idx] = p.color;
}
