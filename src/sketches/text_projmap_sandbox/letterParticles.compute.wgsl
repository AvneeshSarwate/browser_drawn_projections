// Letter Particles - Compaction Compute Shader
// Scans input texture and stream-compacts visible pixels into particle buffer

struct Particle {
    uv: vec2<f32>,
    pad: vec2<f32>,
    color: vec4<f32>,
};

struct Counter {
    value: atomic<u32>,
};

struct CompactionSettings {
    alphaThreshold: f32,
    maxParticles: u32,
    texWidth: u32,
    texHeight: u32,
};

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> counter: Counter;
@group(0) @binding(3) var<uniform> settings: CompactionSettings;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    // Bounds check
    if (gid.x >= settings.texWidth || gid.y >= settings.texHeight) {
        return;
    }

    // Sample pixel color using textureLoad (no sampler needed)
    let col = textureLoad(inputTex, vec2<i32>(gid.xy), 0);

    // Skip transparent pixels
    if (col.a <= settings.alphaThreshold) {
        return;
    }

    // Stream compaction: atomically grab an index
    let idx = atomicAdd(&counter.value, 1u);

    // Guard against buffer overflow
    if (idx >= settings.maxParticles) {
        return;
    }

    // Compute UV in [0,1] range with half-texel offset for center sampling
    let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5, 0.5)) / vec2<f32>(f32(settings.texWidth), f32(settings.texHeight));

    // Write compacted particle data
    particles[idx].uv = uv;
    particles[idx].pad = vec2<f32>(0.0, 0.0);
    particles[idx].color = col;
}
