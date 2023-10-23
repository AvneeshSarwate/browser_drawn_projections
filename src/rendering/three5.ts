import * as THREE from 'three';

import { planeVS } from './vertexShaders';

export class Three5 {
  private scene: THREE.Scene;
  width: number;
  height: number;
  private camera: THREE.OrthographicCamera;
  private circleGeometry: THREE.CircleGeometry; 
  private rectGeometry: THREE.PlaneGeometry;
  private material: THREE.Material;
  public output: THREE.WebGLRenderTarget;


  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, width, height, 0, -1, 1)
    this.circleGeometry = new THREE.CircleGeometry(1, 128); //todo performance - have a few diff resolutions for performance?
    this.rectGeometry = new THREE.PlaneGeometry(1, 1);
    this.output = new THREE.WebGLRenderTarget(width, height);
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  }

  setMaterial(material: THREE.Material) {
    this.material = material;
  }

  circle(x: number, y: number, radius: number) {
    const mesh = new THREE.Mesh(this.circleGeometry, this.material);
    mesh.position.set(x, y, 0);
    mesh.scale.set(radius, radius, 1);
    this.scene.add(mesh);
  }

  rect(x: number, y: number, width: number, height: number) {
    const mesh = new THREE.Mesh(this.rectGeometry, this.material);
    mesh.position.set(x, y, 0);
    mesh.scale.set(width, height, 1);
    this.scene.add(mesh);
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const mesh = new THREE.Mesh(this.rectGeometry, this.material);
    mesh.position.set(x1, y1, 0);
    mesh.rotation.set(0, 0, angle);
    mesh.scale.set(length, 1, 1);
    this.scene.add(mesh);
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
    this.scene.clear();
  }

  createGradientMaterial(color1: THREE.Color, color2: THREE.Color, angle: number, scale: number, offset: number) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color1: { value: color1 },
        color2: { value: color2 },
        angle: { value: angle },
        scale: { value: scale },
        offset: { value: offset },
      },
      vertexShader: planeVS,
      fragmentShader: gradientFS,
    });
    return material;
  }

  dispose() {
    this.scene.clear();
    this.output.dispose();
  }
}


const gradientFS = `
precision highp float;

varying vec2 vUV;
uniform vec3 color1;
uniform vec3 color2;
uniform float angle;
uniform float scale;
uniform float offset;

void main() {
  vec2 uv = vUV;
  uv *= scale;
  uv += offset;
  uv = vec2(
    uv.x * cos(angle) - uv.y * sin(angle),
    uv.x * sin(angle) + uv.y * cos(angle)
  );
  vec3 color = mix(color1, color2, uv.y);
  gl_FragColor = vec4(color, 1.);
}
`;