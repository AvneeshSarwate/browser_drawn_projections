// Auto-generated style file: manually authored to match fragment generator output.
import * as BABYLON from 'babylonjs';
import { CustomShaderEffect, type ShaderSource, type RenderPrecision, type ShaderUniforms, type Dynamic } from '../shaderFXBabylon';

export const PressureDampVertexSource = `// Auto-generated passthrough
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

export const PressureDampFragmentSources = [
  `// Multiplies input texel by scalar scale
varying vUV: vec2<f32>;
uniform uniforms_scale: f32;
var src: texture_2d<f32>;
var srcSampler: sampler;

struct PressureDampUniforms {
  scale: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: PressureDampUniforms,
  src: texture_2d<f32>,
  srcSampler: sampler,
) -> vec4f {
  let color = textureSample(src, srcSampler, uv);
  return color * uniforms.scale;
}

fn load_PressureDampUniforms() -> PressureDampUniforms {
  return PressureDampUniforms(
    uniforms.uniforms_scale,
  );
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
  let uniforms_value = load_PressureDampUniforms();
  let uv_local = fragmentInputs.vUV;
  let color = pass0(uv_local, uniforms_value, src, srcSampler);
  fragmentOutputs.color = color;
#define CUSTOM_FRAGMENT_MAIN_END
}

`,
] as const;

export const PressureDampPassCount = 1 as const;
export const PressureDampPrimaryTextureName = 'src' as const;

export const PressureDampPassTextureSources = [
  [
    { binding: 'src', source: { kind: 'input', key: 'src' } },
  ],
] as const;

export interface PressureDampUniforms {
  scale: number;
}

export function setPressureDampUniforms(material: BABYLON.ShaderMaterial, uniforms: Partial<PressureDampUniforms>): void {
  if (!uniforms) {
    return;
  }
  if (uniforms.scale !== undefined) {
    material.setFloat('uniforms_scale', uniforms.scale);
  }
}

export type PressureDampTextureName = 'src';
export interface PressureDampInputs {
  src: ShaderSource;
}

export interface PressureDampMaterialHandles {
  material: BABYLON.ShaderMaterial;
  setTexture(name: PressureDampTextureName, texture: BABYLON.BaseTexture): void;
  setTextureSampler(name: PressureDampTextureName, sampler: BABYLON.TextureSampler): void;
  setUniforms(uniforms: Partial<PressureDampUniforms>): void;
}

export interface PressureDampMaterialOptions {
  name?: string;
  passIndex?: number;
}

export function createPressureDampMaterial(scene: BABYLON.Scene, options: PressureDampMaterialOptions = {}): PressureDampMaterialHandles {
  const passIndex = options.passIndex ?? 0;
  if (passIndex < 0 || passIndex >= PressureDampPassCount) {
    throw new Error(`Invalid passIndex ${passIndex} for PressureDamp. Expected 0 <= passIndex < ${PressureDampPassCount}.`);
  }
  const baseName = options.name ?? 'PressureDampMaterial';
  const shaderName = `${baseName}_pass${passIndex}`;

  const vertexShaderName = `${shaderName}VertexShader`;
  const fragmentShaderName = `${shaderName}FragmentShader`;

  BABYLON.ShaderStore.ShadersStoreWGSL[vertexShaderName] = PressureDampVertexSource;
  BABYLON.ShaderStore.ShadersStoreWGSL[fragmentShaderName] = PressureDampFragmentSources[passIndex];

  const material = new BABYLON.ShaderMaterial(shaderName, scene, {
    vertex: shaderName,
    fragment: shaderName,
  }, {
    attributes: ['position', 'uv'],
    uniforms: ['uniforms_scale'],
    samplers: ['src'],
    samplerObjects: ['srcSampler'],
    shaderLanguage: BABYLON.ShaderLanguage.WGSL,
  });

  const samplerLookup = { src: 'srcSampler' } as const;

  const handles: PressureDampMaterialHandles = {
    material,
    setTexture: (name, texture) => material.setTexture(name, texture),
    setTextureSampler: (name, sampler) => material.setTextureSampler(samplerLookup[name], sampler),
    setUniforms: (values) => setPressureDampUniforms(material, values),
  };

  return handles;
}

export class PressureDampEffect extends CustomShaderEffect<PressureDampUniforms, PressureDampInputs> {
  effectName = 'PressureDamp';

  constructor(
    engine: BABYLON.WebGPUEngine,
    inputs: PressureDampInputs,
    width = 1280,
    height = 720,
    sampleMode: 'nearest' | 'linear' = 'nearest',
    precision: RenderPrecision = 'half_float',
  ) {
    super(engine, inputs, {
      factory: (sceneRef, options) => createPressureDampMaterial(sceneRef, options),
      textureInputKeys: ['src'],
      passTextureSources: PressureDampPassTextureSources,
      passCount: PressureDampPassCount,
      primaryTextureKey: 'src',
      width,
      height,
      materialName: 'PressureDampMaterial',
      sampleMode,
      precision,
    });
  }

  override setUniforms(uniforms: { scale?: Dynamic<number> }): void {
    const record: ShaderUniforms = {};
    if (uniforms.scale !== undefined) {
      record['scale'] = uniforms.scale;
    }
    super.setUniforms(record);
  }
}

