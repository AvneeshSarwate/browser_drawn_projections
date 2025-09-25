import * as BABYLON from 'babylonjs'

import type { ShaderSource, Dynamic } from './shaderFXBabylon'
import { WobbleEffect } from './postFX/wobble.frag.generated'
import { VerticalBlurEffect } from './postFX/verticalBlur.frag.generated'
import { HorizontalBlurEffect } from './postFX/horizontalBlur.frag.generated'
import { TransformEffect } from './postFX/transform.frag.generated'
import { MathOpEffect } from './postFX/mathOp.frag.generated'
import { LayerBlendEffect } from './postFX/layerBlend.frag.generated'

export class Wobble extends WobbleEffect {
  constructor(engine: BABYLON.WebGPUEngine, inputs: { src: ShaderSource }, width = 1280, height = 720) {
    super(engine, inputs, width, height)
    const start = performance.now()
    this.setUniformValues({
      xStrength: 0.1,
      yStrength: 0.1,
      time: () => (performance.now() - start) / 1000,
    })
  }

  setUniforms(uniforms: { xStrength?: Dynamic<number>; yStrength?: Dynamic<number>; time?: Dynamic<number> }): void {
    this.setUniformValues(uniforms)
  }
}

export class VerticalBlur extends VerticalBlurEffect {
  constructor(engine: BABYLON.WebGPUEngine, inputs: { src: ShaderSource }, width = 1280, height = 720) {
    super(engine, inputs, width, height)
    this.setUniformValues({ pixels: 5, resolution: height })
  }

  setUniforms(uniforms: { pixels?: Dynamic<number>; resolution?: Dynamic<number> }): void {
    this.setUniformValues(uniforms)
  }
}

export class HorizontalBlur extends HorizontalBlurEffect {
  constructor(engine: BABYLON.WebGPUEngine, inputs: { src: ShaderSource }, width = 1280, height = 720) {
    super(engine, inputs, width, height)
    this.setUniformValues({ pixels: 5, resolution: width })
  }

  setUniforms(uniforms: { pixels?: Dynamic<number>; resolution?: Dynamic<number> }): void {
    this.setUniformValues(uniforms)
  }
}

export class Transform extends TransformEffect {
  constructor(engine: BABYLON.WebGPUEngine, inputs: { src: ShaderSource }, width = 1280, height = 720) {
    super(engine, inputs, width, height)
    this.setUniformValues({
      rotate: 0,
      anchor: vec2(0.5, 0.5),
      translate: vec2(0.0, 0.0),
      scale: vec2(1.0, 1.0),
    })
  }

  setUniforms(uniforms: {
    rotate?: Dynamic<number>
    anchor?: Dynamic<[number, number]>
    translate?: Dynamic<[number, number]>
    scale?: Dynamic<[number, number]>
  }): void {
    this.setUniformValues(uniforms)
  }
}

export class MathOp extends MathOpEffect {
  constructor(engine: BABYLON.WebGPUEngine, inputs: { src: ShaderSource }, width = 1280, height = 720) {
    super(engine, inputs, width, height)
    this.setUniformValues({ preAdd: 0, postAdd: 0, mult: 1, colorOnly: false })
  }

  setUniforms(uniforms: {
    preAdd?: Dynamic<number>
    postAdd?: Dynamic<number>
    mult?: Dynamic<number>
    colorOnly?: Dynamic<boolean>
  }): void {
    this.setUniformValues(uniforms)
  }
}

export class LayerBlend extends LayerBlendEffect {
  constructor(engine: BABYLON.WebGPUEngine, inputs: { src1: ShaderSource; src2: ShaderSource }, width = 1280, height = 720) {
    super(engine, inputs, width, height)
  }
}

function vec2(x: number, y: number): [number, number] {
  return [x, y]
}
