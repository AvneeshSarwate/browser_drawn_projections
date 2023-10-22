import * as THREE from 'three';

class Three5 {
  private scene: THREE.Scene;
  width: number;
  height: number;
  private camera: THREE.OrthographicCamera;
  private circleGeometry: THREE.CircleGeometry; 
  private rectGeometry: THREE.PlaneGeometry;
  public output: THREE.WebGLRenderTarget;


  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, width, 0, height, 0, 1)
    this.circleGeometry = new THREE.CircleGeometry(1, 128); //todo performance - have a few diff resolutions for performance?
    this.rectGeometry = new THREE.PlaneGeometry(1, 1);
    this.output = new THREE.WebGLRenderTarget(width, height);
  }

  circle(x: number, y: number, radius: number, color: THREE.ColorRepresentation, shader?: string) {
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(this.circleGeometry, material);
    mesh.position.set(x, y, 0);
    mesh.scale.set(radius, radius, 1);
    this.scene.add(mesh);
  }

  rect(x: number, y: number, width: number, height: number, color: THREE.ColorRepresentation, shader?: string) {
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(this.rectGeometry, material);
    mesh.position.set(x, y, 0);
    mesh.scale.set(width, height, 1);
    this.scene.add(mesh);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: THREE.ColorRepresentation, shader?: string) {
    const material = new THREE.MeshBasicMaterial({ color });
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const mesh = new THREE.Mesh(this.rectGeometry, material);
    mesh.position.set(x1, y1, 0);
    mesh.rotation.set(0, 0, angle);
    mesh.scale.set(length, 1, 1);
    this.scene.add(mesh);
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(this.output);
    renderer.render(this.scene, this.camera);
    this.scene.clear();
  }
}