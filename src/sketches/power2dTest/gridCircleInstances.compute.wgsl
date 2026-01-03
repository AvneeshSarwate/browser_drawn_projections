struct GridCircleSettings {
  time: f32,
  speed: f32,
  centerX: f32,
  centerY: f32,
  gridExtent: f32,
  circleRadius: f32,
  quadScale: f32,
  gridSize: u32,
  instanceCount: u32,
};

struct InstanceData {
  offset: vec2f,
  scale: f32,
  rotation: f32,
  tint: vec3f,
  instanceIndex: f32,
};

@group(0) @binding(0) var<uniform> settings: GridCircleSettings;
@group(0) @binding(1) var<storage, read_write> instanceData: array<InstanceData>;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= settings.instanceCount) {
    return;
  }

  let gridSize = max(settings.gridSize, 2u);
  let row = idx / gridSize;
  let col = idx % gridSize;
  if (row >= gridSize) {
    return;
  }

  let fx = f32(col) / f32(gridSize - 1u);
  let fy = f32(row) / f32(gridSize - 1u);
  let gridPos = vec2f(fx * 2.0 - 1.0, -(fy * 2.0 - 1.0)) * settings.gridExtent;

  let angle = f32(idx) / f32(settings.instanceCount) * 6.28318530718;
  let circlePos = vec2f(cos(angle), sin(angle)) * settings.circleRadius;

  let t = 0.5 + 0.5 * sin(settings.time * settings.speed);
  let pos = mix(gridPos, circlePos, t) + vec2f(settings.centerX, settings.centerY);

  instanceData[idx].offset = pos;
  instanceData[idx].scale = settings.quadScale;
  instanceData[idx].rotation = 0.0;
  instanceData[idx].tint = vec3f(1.0, 1.0, 1.0);
  instanceData[idx].instanceIndex = f32(idx);
}
