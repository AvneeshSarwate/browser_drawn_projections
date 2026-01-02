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

@group(0) @binding(0) var<uniform> settings: GridCircleSettings;
@group(0) @binding(1) var<storage, read_write> instanceData: array<f32>;

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

  let base = idx * 7u;
  instanceData[base + 0u] = pos.x;
  instanceData[base + 1u] = pos.y;
  instanceData[base + 2u] = settings.quadScale;
  instanceData[base + 3u] = 0.0;
  instanceData[base + 4u] = 1.0;
  instanceData[base + 5u] = 1.0;
  instanceData[base + 6u] = 1.0;
}
