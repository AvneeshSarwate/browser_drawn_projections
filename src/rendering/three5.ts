import * as THREE from 'three';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'

import { planeVS } from './vertexShaders';
import type { Three5Style } from './three5Style';


type Constructor<T> = new (...args: any[]) => T;
class ResourcePool<T> {
  private pool: T[] = [];
  private ctor: Constructor<T>;
  private maxSize: number = 1000;
  private index: number = 0;

  constructor(ctor: Constructor<T>) {
    this.ctor = ctor;
  }

  get(): T {
    if (this.pool.length === this.maxSize) {
      throw new Error('ResourcePool is full');
    }
    if(this.index >= this.pool.length) {
      this.pool.push(new this.ctor());
    }
    const item = this.pool[this.index];
    this.index++;
    return item;
  }

  reset() {
    this.index = 0;
  }
}


export class Three5 {
  private scene: THREE.Scene;
  width: number;
  height: number;
  private camera: THREE.OrthographicCamera;

  private circleGeometry: THREE.CircleGeometry; 
  private circleStrokeGeometry: MeshLineGeometry
  //todo performance - create pool for MeshLineGeometry instances for better custom shape performance

  private lineGeoPool = new ResourcePool(MeshLineGeometry);

  private rectGeometry: THREE.PlaneGeometry;

  private cachedLineGeos = new Map<string, MeshLineGeometry>();

  //todo performance - probably want setters/getters to dispose old "reference style" materials when new ones are set
  private material: THREE.Material;
  private strokeMaterial: MeshLineMaterial;

  useStroke = false;

  public output: THREE.WebGLRenderTarget;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, width, height, 0, -1, 1)

    this.circleGeometry = new THREE.CircleGeometry(1, 128); //todo performance - have a few diff resolutions for performance?
    this.circleStrokeGeometry = new MeshLineGeometry();
    const circlePts = this.circleGeometry.attributes.position.array;
    const circlePointsJsArray = [];
    for (let i = 3; i < circlePts.length; i += 3) {
      circlePointsJsArray.push(new THREE.Vector3(circlePts[i], circlePts[i + 1], circlePts[i + 2]));
    }
    this.circleStrokeGeometry.setPoints(circlePointsJsArray);
      
    this.rectGeometry = new THREE.PlaneGeometry(1, 1);



    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.strokeMaterial = new MeshLineMaterial({resolution: new THREE.Vector2(width, height), color: new THREE.Color(0xffffff), lineWidth: .01})

    this.output = new THREE.WebGLRenderTarget(width, height);
  }

  public style: Three5Style | undefined
  public styleMode: "style" | "material" = "material"

  setStyle(style: Three5Style) {
    this.style = style
    this.styleMode = "style"
  }

  setMaterial(material: THREE.Material) {
    this.material = material;
    this.styleMode = "material"
  }

  setStrokeMaterial(material: MeshLineMaterial) {
    this.strokeMaterial = material;
  }

  getMaterial(): THREE.Material {
    if(this.styleMode === "style") {
      return this.style!.getMaterial()
    }
    return this.material
  }

  circle(x: number, y: number, radius: number, z: number = 0, strokeZ: number = 0.0000001) {
    const mesh = new THREE.Mesh(this.circleGeometry, this.getMaterial());
    mesh.position.set(x, y, z);
    mesh.scale.set(radius, radius, 1);
    this.scene.add(mesh);

    if (this.useStroke) {
      const meshLine = new THREE.Mesh(this.circleStrokeGeometry, this.strokeMaterial);
      meshLine.position.set(x, y, z + strokeZ);
      meshLine.scale.set(radius, radius, 1);
      this.scene.add(meshLine);
    }
  }

  rect(x: number, y: number, width: number, height: number) {
    const mesh = new THREE.Mesh(this.rectGeometry, this.getMaterial());
    mesh.position.set(x, y, 0);
    mesh.scale.set(width, height, 1);
    this.scene.add(mesh);
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const mesh = new THREE.Mesh(this.rectGeometry, this.getMaterial());
    mesh.position.set(x1, y1, 0);
    mesh.rotation.set(0, 0, angle);
    mesh.scale.set(length, 1, 1);
    this.scene.add(mesh);
  }

  private useLinePool = false

  curve(rawPts: THREE.Vector2[], resolution: number = 2) {
    const curve = new THREE.SplineCurve(rawPts)
    const points = curve.getPoints(curve.points.length * resolution);
    const vec3Points = points.map(point => new THREE.Vector3(point.x, point.y, 0));

    const lineGeo = this.useLinePool ? this.lineGeoPool.get() : new MeshLineGeometry();
    lineGeo.setPoints(vec3Points);
    const meshLineMat = new MeshLineMaterial({ resolution: new THREE.Vector2(this.width, this.height), color: new THREE.Color(0xffffff), lineWidth: .01 })
    const meshLine = new THREE.Mesh(lineGeo, meshLineMat);

    this.scene.add(meshLine);
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);

    //todo performance - dispose geometries (base and stroke) for custom curves/shapes, but not for circles/rects/primitives

    const meshes = this.scene.children.filter(child => child instanceof THREE.Mesh).map(child => child as THREE.Mesh);
    const geos = meshes.map(mesh => mesh.geometry).filter(geo => this.cachedLineGeos.has(geo.uuid) === false);

    
    setTimeout(() => {
      //@ts-expect-error
      meshes.forEach(child => (child as THREE.Mesh).material.dispose());
    }, 100)
    
    if(!this.useLinePool) geos.forEach(geo => geo.dispose());

    //todo performance - need to properly dispose of stroke meshes
    
    this.scene.clear(); //todo api - don't clear automatically on render
    this.lineGeoPool.reset();
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
    const meshes = this.scene.children.filter(child => child instanceof THREE.Mesh).map(child => child as THREE.Mesh);
    const geos = meshes.map(mesh => mesh.geometry).filter(geo => this.cachedLineGeos.has(geo.uuid) === false);
    
    geos.forEach(geo => geo.dispose());
    //@ts-expect-error
    meshes.forEach(child => (child as THREE.Mesh).material.dispose());

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