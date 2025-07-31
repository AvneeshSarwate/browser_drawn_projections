struct LaunchConfig {
    strokeAIndex: f32,
    strokeBIndex: f32,
    interpolationT: f32,
    totalDuration: f32,
    
    elapsedTime: f32,
    startPointX: f32,
    startPointY: f32,
    scale: f32,
    
    isActive: f32,
    phase: f32,
    reserved1: f32,
    reserved2: f32,
};

struct GlobalParams {
    time: f32,
    canvasWidth: f32,
    canvasHeight: f32,
    maxAnimations: f32,
    deltaTime: f32,
    textureHeight: f32,
    padding1: f32,
    padding2: f32,
};

// Bindings
@group(0) @binding(0) var<storage, read_write> instanceMatrices: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> launchConfigs: array<LaunchConfig>;
@group(0) @binding(2) var<uniform> globalParams: GlobalParams;
@group(0) @binding(3) var strokeTexture: texture_2d<f32>;
@group(0) @binding(4) var strokeSampler: sampler;

// Optimized compute shader with flexible workgroup sizing
const POINTS_PER_STROKE: u32 = 1024u;

@compute @workgroup_size(64, 1, 1)  // Optimal workgroup size for most GPUs
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let globalIndex = globalId.x;
    
    // Calculate stroke and point indices from global index
    let strokeIndex = globalIndex / POINTS_PER_STROKE;
    let pointIndex = globalIndex % POINTS_PER_STROKE;
    
    // Early exit for out-of-bounds threads
    if (strokeIndex >= u32(globalParams.maxAnimations)) {
        return;
    }
    
    // Debug: Force first instance to always be visible
    // if (globalIndex == 0u) {
    //     buildTransformMatrix(0u, vec2<f32>(0.0, 0.0), 0.2);
    //     return;
    // }
    
    let config = launchConfigs[strokeIndex];
    if (config.isActive < 0.5) {
        setInactiveInstance(globalIndex);
        return;
    }
    
    // Calculate this point's position along the stroke (0.0-1.0)
    let pointProgress = f32(pointIndex) / f32(POINTS_PER_STROKE - 1u);
    
    let phaseVal = clamp(phaser(config.phase, pointProgress, 1.0), 0.0, 0.9999);
    
    // If this point hasn't been "revealed" yet, hide it
    if (phaseVal <= 0.001) {
        setInactiveInstance(globalIndex);
        return;
    }
    
    // Sample stroke positions with interpolation at this point along the path
    let strokePointA = sampleStroke(u32(config.strokeAIndex), phaseVal);
    let strokePointB = sampleStroke(u32(config.strokeBIndex), phaseVal);
    let interpolatedPoint = mix(strokePointA, strokePointB, config.interpolationT);
    
    // Transform to canvas coordinates
    let canvasPos = transformToCanvas(interpolatedPoint, config);
    let ndc = canvasToNDC(canvasPos, globalParams.canvasWidth, globalParams.canvasHeight);
    
    // Use global index directly for instance indexing
    let instanceIndex = globalIndex;
    
    // Scale point size based on reveal phase for smooth appearance
    // Make points much larger to ensure visibility
    let pointScale = 0.1; // * phaseVal;  // Large visible circles that fade in
    buildTransformMatrix(instanceIndex, ndc, pointScale);
}

fn phaser(pct: f32, phase: f32, e: f32) -> f32 {
    return clamp((phase - 1.0 + pct * (1.0 + e)) / e, 0.0, 1.0);
}

fn sampleStroke(strokeIndex: u32, phase: f32) -> vec2<f32> {
    // Add half-texel offset for proper center sampling on both axes
    let texWidth = f32(POINTS_PER_STROKE);
    let u = clamp(phase, 0.0, 1.0);
    let v = (f32(strokeIndex) + 0.5) / globalParams.textureHeight;
    let textureCoord = vec2<f32>(u, v);
    return textureSampleLevel(strokeTexture, strokeSampler, textureCoord, 0.0).rg;
}

fn transformToCanvas(strokePoint: vec2<f32>, config: LaunchConfig) -> vec2<f32> {
    return vec2<f32>(
        config.startPointX + strokePoint.x * config.scale,
        config.startPointY + strokePoint.y * config.scale
    );
}

fn canvasToNDC(canvasPos: vec2<f32>, canvasWidth: f32, canvasHeight: f32) -> vec2<f32> {
    let aspectRatio = canvasWidth / canvasHeight;
    let ndcX = ((canvasPos.x / canvasWidth) * 2.0 - 1.0) * aspectRatio;
    let ndcY = -((canvasPos.y / canvasHeight) * 2.0 - 1.0);
    return vec2<f32>(ndcX, ndcY);
}

fn buildTransformMatrix(instanceIndex: u32, position: vec2<f32>, scale: f32) {
    let base = instanceIndex * 4u;
    
    // Simple 2D translation matrix (no rotation for stroke points)
    instanceMatrices[base + 0u] = vec4<f32>(scale, 0.0, 0.0, 0.0);
    instanceMatrices[base + 1u] = vec4<f32>(0.0, scale, 0.0, 0.0);
    instanceMatrices[base + 2u] = vec4<f32>(0.0, 0.0, 1.0, 0.0);
    instanceMatrices[base + 3u] = vec4<f32>(position.x, position.y, 0.0, 1.0);
}

fn setInactiveInstance(instanceIndex: u32) {
    let base = instanceIndex * 4u;
    // Zero out transformation matrix for inactive instances
    instanceMatrices[base + 0u] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    instanceMatrices[base + 1u] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    instanceMatrices[base + 2u] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    instanceMatrices[base + 3u] = vec4<f32>(-10000.0, 0.0, 0.0, 1.0);
}
