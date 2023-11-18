import * as THREE from 'three';
import type { ShaderUniform } from './shaderFX';
type StaticShaderUniforms = {
    [key: string]: ShaderUniform;
};
type ThreeUniforms = {
    [uniform: string]: THREE.IUniform<any>;
};
export declare class Three5Style {
    baseFragmentShader: string;
    uniforms: StaticShaderUniforms;
    mainString: string;
    finalShader: string;
    buildShader(): void;
    constructor();
    getMaterial(): THREE.Material;
    buildThreeUniforms(): ThreeUniforms;
    buildUniformString(): string;
}
export declare class LineStyle extends Three5Style {
    constructor();
    mainString: string;
    uniforms: {
        time: number;
        color0: THREE.Vector4;
        color1: THREE.Vector4;
    };
}
export {};
