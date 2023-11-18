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
