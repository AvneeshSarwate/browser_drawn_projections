import * as BABYLON from 'babylonjs';
import {
  CustomShaderEffect,
  type Dynamic,
  type RenderPrecision,
  type ShaderSource,
  type ShaderUniforms,
} from '../shaderFXBabylon';

// ===== Scalar Field Debug Effect =====

export const ScalarFieldDebugVertexSource = `// Scalar debug passthrough
attribute position: vec3<f32>;
attribute uv: vec2<f32>;
varying vUV: vec2<f32>;

#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
  vertexOutputs.position = vec4<f32>(vertexInputs.position, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
#define CUSTOM_VERTEX_MAIN_END
}

`;

export const ScalarFieldDebugFragmentSource = `// Visualizes a scalar field as grayscale.
varying vUV: vec2<f32>;
uniform uniforms_scale: f32;
uniform uniforms_offset: f32;
var src: texture_2d<f32>;
var srcSampler: sampler;

struct ScalarFieldDebugUniforms {
  scale: f32,
  offset: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: ScalarFieldDebugUniforms,
  src: texture_2d<f32>,
  srcSampler: sampler,
) -> vec4f {
  let sample = textureSample(src, srcSampler, clamp(uv, vec2f(0.0), vec2f(1.0))).x;
  let scaled = 0.5 + (sample + uniforms.offset) * uniforms.scale;
  let normalized = clamp(scaled, 0.0, 1.0);
  return vec4f(vec3f(normalized), 1.0);
}

fn load_ScalarFieldDebugUniforms() -> ScalarFieldDebugUniforms {
  return ScalarFieldDebugUniforms(
    uniforms.uniforms_scale,
    uniforms.uniforms_offset
  );
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
  let uniforms_value = load_ScalarFieldDebugUniforms();
  let uv_local = fragmentInputs.vUV;
  let color = pass0(uv_local, uniforms_value, src, srcSampler);
  fragmentOutputs.color = color;
#define CUSTOM_FRAGMENT_MAIN_END
}

`;

export interface ScalarFieldDebugUniforms {
  scale: number;
  offset: number;
}

export interface ScalarFieldDebugInputs {
  src: ShaderSource;
}

export interface ScalarFieldDebugMaterialHandles {
  material: BABYLON.ShaderMaterial;
  setTexture(name: 'src', texture: BABYLON.BaseTexture): void;
  setTextureSampler(name: 'src', sampler: BABYLON.TextureSampler): void;
  setUniforms(uniforms: Partial<ScalarFieldDebugUniforms>): void;
}

export interface ScalarFieldDebugMaterialOptions {
  name?: string;
  passIndex?: number;
}

export function createScalarFieldDebugMaterial(
  scene: BABYLON.Scene,
  options: ScalarFieldDebugMaterialOptions = {}
): ScalarFieldDebugMaterialHandles {
  const passIndex = options.passIndex ?? 0;
  if (passIndex !== 0) {
    throw new Error(`ScalarFieldDebugMaterial has only one pass (received passIndex=${passIndex}).`);
  }
  const baseName = options.name ?? 'ScalarFieldDebugMaterial';
  const shaderName = `${baseName}_pass${passIndex}`;
  const vertexShaderName = `${shaderName}VertexShader`;
  const fragmentShaderName = `${shaderName}FragmentShader`;

  BABYLON.ShaderStore.ShadersStoreWGSL[vertexShaderName] = ScalarFieldDebugVertexSource;
  BABYLON.ShaderStore.ShadersStoreWGSL[fragmentShaderName] = ScalarFieldDebugFragmentSource;

  const material = new BABYLON.ShaderMaterial(shaderName, scene, {
    vertex: shaderName,
    fragment: shaderName,
  }, {
    attributes: ['position', 'uv'],
    uniforms: ['uniforms_scale', 'uniforms_offset'],
    samplers: ['src'],
    samplerObjects: ['srcSampler'],
    shaderLanguage: BABYLON.ShaderLanguage.WGSL,
  });

  const samplerLookup = { src: 'srcSampler' } as const;

  return {
    material,
    setTexture: (name, texture) => material.setTexture(name, texture),
    setTextureSampler: (name, sampler) => material.setTextureSampler(samplerLookup[name], sampler),
    setUniforms: (uniforms) => {
      if (uniforms.scale !== undefined) {
        material.setFloat('uniforms_scale', uniforms.scale);
      }
      if (uniforms.offset !== undefined) {
        material.setFloat('uniforms_offset', uniforms.offset);
      }
    },
  };
}

export class ScalarFieldDebugEffect extends CustomShaderEffect<
  ScalarFieldDebugUniforms,
  ScalarFieldDebugInputs
> {
  effectName = 'ScalarFieldDebug';

  constructor(
    engine: BABYLON.WebGPUEngine,
    inputs: ScalarFieldDebugInputs,
    width = 1280,
    height = 720,
    sampleMode: 'nearest' | 'linear' = 'linear',
    precision: RenderPrecision = 'half_float',
  ) {
    super(engine, inputs, {
      factory: (sceneRef, options) => createScalarFieldDebugMaterial(sceneRef, options),
      textureInputKeys: ['src'],
      passTextureSources: [
        [{ binding: 'src', source: { kind: 'input', key: 'src' } }],
      ],
      passCount: 1,
      primaryTextureKey: 'src',
      width,
      height,
      materialName: 'ScalarFieldDebugMaterial',
      sampleMode,
      precision,
    });
  }

  override setUniforms(uniforms: {
    scale?: Dynamic<number>;
    offset?: Dynamic<number>;
  }): void {
    const record: ShaderUniforms = {};
    if (uniforms.scale !== undefined) {
      record['scale'] = uniforms.scale;
    }
    if (uniforms.offset !== undefined) {
      record['offset'] = uniforms.offset;
    }
    super.setUniforms(record);
  }
}

// ===== Velocity Field Debug Effect =====

export const VelocityFieldDebugVertexSource = `// Velocity debug passthrough
attribute position: vec3<f32>;
attribute uv: vec2<f32>;
varying vUV: vec2<f32>;

#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
  vertexOutputs.position = vec4<f32>(vertexInputs.position, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
#define CUSTOM_VERTEX_MAIN_END
}

`;

export const VelocityFieldDebugFragmentSource = `// Visualizes velocity field: R=X dir, G=Y dir, B=magnitude.
varying vUV: vec2<f32>;
uniform uniforms_vectorScale: f32;
uniform uniforms_magnitudeScale: f32;
var src: texture_2d<f32>;
var srcSampler: sampler;

struct VelocityFieldDebugUniforms {
  vectorScale: f32,
  magnitudeScale: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: VelocityFieldDebugUniforms,
  src: texture_2d<f32>,
  srcSampler: sampler,
) -> vec4f {
  let velocity = textureSample(src, srcSampler, clamp(uv, vec2f(0.0), vec2f(1.0))).xy;
  let dir = clamp(0.5 + velocity * uniforms.vectorScale, vec2f(0.0), vec2f(1.0));
  let magnitude = clamp(length(velocity) * uniforms.magnitudeScale, 0.0, 1.0);
  let color = vec3f(dir.x, dir.y, magnitude);
  return vec4f(color, 1.0);
}

fn load_VelocityFieldDebugUniforms() -> VelocityFieldDebugUniforms {
  return VelocityFieldDebugUniforms(
    uniforms.uniforms_vectorScale,
    uniforms.uniforms_magnitudeScale
  );
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
  let uniforms_value = load_VelocityFieldDebugUniforms();
  let uv_local = fragmentInputs.vUV;
  let color = pass0(uv_local, uniforms_value, src, srcSampler);
  fragmentOutputs.color = color;
#define CUSTOM_FRAGMENT_MAIN_END
}

`;

export interface VelocityFieldDebugUniforms {
  vectorScale: number;
  magnitudeScale: number;
}

export interface VelocityFieldDebugInputs {
  src: ShaderSource;
}

export interface VelocityFieldDebugMaterialHandles {
  material: BABYLON.ShaderMaterial;
  setTexture(name: 'src', texture: BABYLON.BaseTexture): void;
  setTextureSampler(name: 'src', sampler: BABYLON.TextureSampler): void;
  setUniforms(uniforms: Partial<VelocityFieldDebugUniforms>): void;
}

export interface VelocityFieldDebugMaterialOptions {
  name?: string;
  passIndex?: number;
}

export function createVelocityFieldDebugMaterial(
  scene: BABYLON.Scene,
  options: VelocityFieldDebugMaterialOptions = {}
): VelocityFieldDebugMaterialHandles {
  const passIndex = options.passIndex ?? 0;
  if (passIndex !== 0) {
    throw new Error(`VelocityFieldDebugMaterial has only one pass (received passIndex=${passIndex}).`);
  }
  const baseName = options.name ?? 'VelocityFieldDebugMaterial';
  const shaderName = `${baseName}_pass${passIndex}`;
  const vertexShaderName = `${shaderName}VertexShader`;
  const fragmentShaderName = `${shaderName}FragmentShader`;

  BABYLON.ShaderStore.ShadersStoreWGSL[vertexShaderName] = VelocityFieldDebugVertexSource;
  BABYLON.ShaderStore.ShadersStoreWGSL[fragmentShaderName] = VelocityFieldDebugFragmentSource;

  const material = new BABYLON.ShaderMaterial(shaderName, scene, {
    vertex: shaderName,
    fragment: shaderName,
  }, {
    attributes: ['position', 'uv'],
    uniforms: ['uniforms_vectorScale', 'uniforms_magnitudeScale'],
    samplers: ['src'],
    samplerObjects: ['srcSampler'],
    shaderLanguage: BABYLON.ShaderLanguage.WGSL,
  });

  const samplerLookup = { src: 'srcSampler' } as const;

  return {
    material,
    setTexture: (name, texture) => material.setTexture(name, texture),
    setTextureSampler: (name, sampler) => material.setTextureSampler(samplerLookup[name], sampler),
    setUniforms: (uniforms) => {
      if (uniforms.vectorScale !== undefined) {
        material.setFloat('uniforms_vectorScale', uniforms.vectorScale);
      }
      if (uniforms.magnitudeScale !== undefined) {
        material.setFloat('uniforms_magnitudeScale', uniforms.magnitudeScale);
      }
    },
  };
}

export class VelocityFieldDebugEffect extends CustomShaderEffect<
  VelocityFieldDebugUniforms,
  VelocityFieldDebugInputs
> {
  effectName = 'VelocityFieldDebug';

  constructor(
    engine: BABYLON.WebGPUEngine,
    inputs: VelocityFieldDebugInputs,
    width = 1280,
    height = 720,
    sampleMode: 'nearest' | 'linear' = 'linear',
    precision: RenderPrecision = 'half_float',
  ) {
    super(engine, inputs, {
      factory: (sceneRef, options) => createVelocityFieldDebugMaterial(sceneRef, options),
      textureInputKeys: ['src'],
      passTextureSources: [
        [{ binding: 'src', source: { kind: 'input', key: 'src' } }],
      ],
      passCount: 1,
      primaryTextureKey: 'src',
      width,
      height,
      materialName: 'VelocityFieldDebugMaterial',
      sampleMode,
      precision,
    });
  }

  override setUniforms(uniforms: {
    vectorScale?: Dynamic<number>;
    magnitudeScale?: Dynamic<number>;
  }): void {
    const record: ShaderUniforms = {};
    if (uniforms.vectorScale !== undefined) {
      record['vectorScale'] = uniforms.vectorScale;
    }
    if (uniforms.magnitudeScale !== undefined) {
      record['magnitudeScale'] = uniforms.magnitudeScale;
    }
    super.setUniforms(record);
  }
}

