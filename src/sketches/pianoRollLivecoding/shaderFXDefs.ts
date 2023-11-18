const shaderFXDefs = `
import * as THREE from 'three';
export declare const errorImageTexture: THREE.Texture;
export type ShaderSource = THREE.Texture | THREE.WebGLRenderTarget | HTMLCanvasElement | ShaderEffect;
type ShaderInputs = {
    [key: string]: ShaderSource;
};
type ThreeVector = THREE.Vector2 | THREE.Vector3 | THREE.Vector4;
type ThreeMatrix = THREE.Matrix3 | THREE.Matrix4;
type ThreeColor = THREE.Color;
type ThreeVectorArray = ThreeVector[];
export type Dynamic<T> = T | (() => T);
export type ShaderUniform = number | number[] | ThreeVector | ThreeMatrix | ThreeColor | ThreeVectorArray | THREE.Texture;
export type ShaderUniforms = {
    [key: string]: Dynamic<ShaderUniform>;
};
export declare abstract class ShaderEffect {
    abstract setSrcs(fx: ShaderInputs): void;
    abstract render(renderer: THREE.WebGLRenderer): void;
    abstract setUniforms(uniforms: ShaderUniforms): void;
    abstract updateUniforms(): void;
    abstract output: THREE.WebGLRenderTarget;
    effectName: string;
    width: number;
    height: number;
    inputs: ShaderInputs;
    uniforms: ShaderUniforms;
    abstract dispose(): void;
    disposeAll(): void;
    renderAll(renderer: THREE.WebGLRenderer): void;
}
export declare class FeedbackNode extends ShaderEffect {
    width: number;
    height: number;
    output: THREE.WebGLRenderTarget;
    _passthru: Passthru;
    feedbackSrc?: ShaderEffect;
    firstRender: boolean;
    inputs: ShaderInputs;
    constructor(startState: ShaderEffect);
    setFeedbackSrc(fx: ShaderEffect): void;
    setSrcs(fx: {
        initialState: ShaderEffect;
    }): void;
    render(renderer: THREE.WebGLRenderer): void;
    dispose(): void;
    setUniforms(_uniforms: ShaderUniforms): void;
    updateUniforms(): void;
}
declare class Pingpong {
    src: THREE.WebGLRenderTarget;
    dst: THREE.WebGLRenderTarget;
    swap(): void;
    constructor(width: number, height: number);
}
export declare class CustomShaderEffect extends ShaderEffect {
    output: THREE.WebGLRenderTarget;
    width: number;
    height: number;
    scene: THREE.Scene;
    camera: THREE.Camera;
    inputs: ShaderInputs;
    material: THREE.ShaderMaterial;
    constructor(fsString: string, inputs: ShaderInputs, width?: number, height?: number, customOutput?: THREE.WebGLRenderTarget);
    dispose(): void;
    setUniforms(uniforms: ShaderUniforms): void;
    updateSources(): void;
    updateUniforms(): void;
    setShader(fragmentString: string): void;
    setSrcs(inputs: ShaderInputs): void;
    _setMaterialUniformsFromInputs(): void;
    render(renderer: THREE.WebGLRenderer): void;
}
export declare class CustomFeedbackShaderEffect extends CustomShaderEffect {
    pingpong: Pingpong;
    _passthrough: Passthru;
    constructor(fsString: string, inputArgs: ShaderInputs, width?: number, height?: number);
    render(renderer: THREE.WebGLRenderer): void;
    dispose(): void;
}
export declare class Passthru extends CustomShaderEffect {
    effectName: string;
    constructor(inputs: {
        src: ShaderSource;
    }, width?: number, height?: number, customOutput?: THREE.WebGLRenderTarget);
    setSrcs(fx: {
        src: ShaderSource;
    }): void;
}
export declare class CanvasPaint extends CustomShaderEffect {
    effectName: string;
    constructor(inputs: {
        src: ShaderSource;
    }, width?: number, height?: number);
    setSrcs(fx: {
        src: ShaderSource;
    }): void;
    render(renderer: THREE.WebGLRenderer): void;
}
`;

const customFXDefs = `
import { CustomShaderEffect, type Dynamic, type ShaderSource, CustomFeedbackShaderEffect } from "./shaderFX";
export declare class Wobble extends CustomShaderEffect {
    effectName: string;
    constructor(inputs: {
        src: ShaderSource;
    }, width?: number, height?: number);
    setUniforms(uniforms: {
        xStrength: Dynamic<number>;
        yStrength: Dynamic<number>;
        time?: Dynamic<number>;
    }): void;
}
export declare class VerticalBlur extends CustomShaderEffect {
    effectName: string;
    constructor(inputs: {
        src: ShaderSource;
    }, width?: number, height?: number);
    setUniforms(uniforms: {
        pixels: Dynamic<number>;
    }): void;
}
export declare class HorizontalBlur extends CustomShaderEffect {
    effectName: string;
    constructor(inputs: {
        src: ShaderSource;
    }, width?: number, height?: number);
    setUniforms(uniforms: {
        pixels: Dynamic<number>;
    }): void;
}
export declare class Transform extends CustomShaderEffect {
    effectName: string;
    constructor(inputs: {
        src: ShaderSource;
    }, width?: number, height?: number);
    setUniforms(uniforms: {
        rotate?: Dynamic<number>;
        anchor?: Dynamic<[number, number]>;
        translate?: Dynamic<[number, number]>;
        scale?: Dynamic<[number, number]>;
    }): void;
}
export declare class LayerBlend extends CustomShaderEffect {
    effectName: string;
    constructor(inputs: {
        src1: ShaderSource;
        src2: ShaderSource;
    }, width?: number, height?: number);
}
export declare class UVDraw extends CustomShaderEffect {
    effectName: string;
    constructor(width?: number, height?: number);
}
export declare class FeedbackZoom extends CustomFeedbackShaderEffect {
    effectName: string;
    constructor(inputs: {
        src: ShaderSource;
    }, width?: number, height?: number);
    setUniforms(uniforms: {
        zoom: Dynamic<number>;
    }): void;
}
`;