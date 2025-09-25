import * as BABYLON from 'babylonjs'

import { ShaderEffect } from './shaderFXBabylon'
import type { ShaderInputs, ShaderUniforms } from './shaderFXBabylon'
import { PassthruEffect } from './postFX/passthru.frag.generated'

export class FeedbackNode extends ShaderEffect {
  output: BABYLON.RenderTargetTexture
  private readonly passthrough: PassthruEffect
  private readonly sampleMode: 'nearest' | 'linear'
  private firstRender = true
  private feedbackSrc?: ShaderEffect

  constructor(
    engine: BABYLON.WebGPUEngine,
    startState: ShaderEffect,
    width = startState.width,
    height = startState.height,
    sampleMode: 'nearest' | 'linear' = 'linear',
  ) {
    super()
    this.width = width
    this.height = height
    this.inputs = { initialState: startState }
    this.sampleMode = sampleMode
    this.passthrough = new PassthruEffect(engine, { src: startState.output }, width, height, sampleMode)
    this.output = this.passthrough.output
  }

  setFeedbackSrc(effect: ShaderEffect): void {
    this.feedbackSrc = effect
    const inputs = this.inputs as ShaderInputs
    inputs['feedback'] = effect
  }

  setSrcs(inputs: { initialState: ShaderEffect }): void {
    this.inputs = inputs
    this.passthrough.setSrcs({ src: inputs.initialState.output })
    this.firstRender = true
  }

  setUniforms(_uniforms: ShaderUniforms): void {}

  updateUniforms(): void {}

  render(engine: BABYLON.Engine): void {
    this.passthrough.render(engine)
    if (this.firstRender) {
      this.firstRender = false
      if (this.feedbackSrc) {
        this.passthrough.setSrcs({ src: this.feedbackSrc.output })
      }
    }
  }

  dispose(): void {
    this.passthrough.dispose()
  }
}
