import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { Line2, LineGeometry, LineMaterial } from "three/examples/jsm/Addons.js";
import { resolution } from "./appState";
import { REVISION } from 'three';
import { Earcut } from 'three/src/extras/Earcut.js';
const UNPKG_PATH = `https://unpkg.com/three@0.${REVISION}.x/examples/jsm/libs/basis/`;

const OUTLINE_LENGTH = 821
const OUTLINE_GRID_SIZE = 512

type PeopleData =  {
  [key: string]: {
    splineFrames: THREE.Vector2[][];
    onePersonSkeletons: {
        landmarks: {
            name: string;
            x: number;
            y: number;
            z: number;
            visibility: number;
            presence: number;
        }[];
    }[][];
    bezierCurves: number[][][];
    numFrames: number;
  }
}

type QuadParam = {
  texName: string
  frameCount: number
  fps: number
  dancerName: string
  showRegions: boolean
  color1: THREE.Vector4
  color2: THREE.Vector4
  color3: THREE.Vector4
  color4: THREE.Vector4
  color5: THREE.Vector4
  color6: THREE.Vector4
}

type DancerShapeUniforms = {
  color1: { value: THREE.Vector4 }
  color2: { value: THREE.Vector4 }
  color3: { value: THREE.Vector4 }
  color4: { value: THREE.Vector4 }
  color5: { value: THREE.Vector4 }
  color6: { value: THREE.Vector4 }
  xMid: { value: number }
  yBottom: { value: number }
  yTop: { value: number }
}

export type Dancer = {
  id: string
  group: THREE.Group
  line: Line2
  quad: THREE.Mesh
  uniforms: { 
    frame: { value: number }
    textureArray: { value: THREE.CompressedArrayTexture }
    makeBlackThresh: { value: number }
  }
  params: QuadParam
  lerpDef: {
    lerping: boolean
    lerp: number
    fromDancer: DancerName
    toDancer: DancerName
    fromFrame: number
    toFrame: number
  }
  dancerShape: {
    mesh: THREE.Mesh
    geometry: THREE.BufferGeometry
    material: THREE.ShaderMaterial
  }
  dancerShapeUniforms: DancerShapeUniforms
  updateLerp: () => void
  setFrame: (frame: number) => void
  remove: () => void
  quadVisible: (b: boolean) => void
  lineVisible: (b: boolean) => void
  regionsVisible: (b: boolean) => void
}

function updateOutlineFlatGeometry(geometry: THREE.BufferGeometry, points: THREE.Vector2[]) {

  const debug = false

  if(!debug) {
    const posAttribute = geometry.getAttribute('position')
    for(let i = 0; i < points.length; i++) {
      posAttribute.setXYZ(i, points[i].x, points[i].y, 0)
    }
    posAttribute.needsUpdate = true

    const uvAttribute = geometry.getAttribute('uv')
    for(let i = 0; i < points.length; i++) {
      uvAttribute.setXY(i, points[i].x/OUTLINE_GRID_SIZE, points[i].y/OUTLINE_GRID_SIZE)
    }
    uvAttribute.needsUpdate = true

    const indices = Earcut.triangulate(points.map(pt => [pt.x, pt.y]).flat())
    const indexAttribute = geometry.getIndex()
    indexAttribute.set(indices)
    indexAttribute.needsUpdate = true

    geometry.setDrawRange(0, indices.length)
  } else {

    // as a debug test, draw an indexed quad
    const size = 250
    const quadPts = [new THREE.Vector2(0, 0), new THREE.Vector2(size, 0), new THREE.Vector2(size, size), new THREE.Vector2(0, size)]
    const quadIndices = [0, 1, 2, 0, 2, 3]
    const posAttribute = geometry.getAttribute('position')
    for(let i = 0; i < quadPts.length; i++) {
      posAttribute.setXYZ(i, quadPts[i].x, quadPts[i].y, 0)
    }
    posAttribute.needsUpdate = true

    const uvAttribute = geometry.getAttribute('uv')
    for(let i = 0; i < quadPts.length; i++) {
      uvAttribute.setXY(i, quadPts[i].x/OUTLINE_GRID_SIZE, quadPts[i].y/OUTLINE_GRID_SIZE)
    }
    uvAttribute.needsUpdate = true

    // const indices = Earcut.triangulate(quadPts.map(pt => [pt.x, pt.y]).flat())
    const indexAttribute = geometry.getIndex()
    indexAttribute.set(quadIndices)
    indexAttribute.needsUpdate = true

    geometry.setDrawRange(0, quadIndices.length)
  }
}

function getDancerBounds(frame: THREE.Vector2[]) {
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  frame.forEach(pt => {
    xMin = Math.min(xMin, pt.x)
    xMax = Math.max(xMax, pt.x)
    yMin = Math.min(yMin, pt.y)
    yMax = Math.max(yMax, pt.y)
  })
  const xMid = (xMin + xMax) / 2
  const yBottom = yMin + (yMax - yMin) / 3
  const yTop = yMin + (yMax - yMin) * 2 / 3
  return {xMid, yBottom, yTop}
}

function updateDancerShapeUniforms(dancerShapeUniforms: DancerShapeUniforms, frame: THREE.Vector2[]) {
  const {xMid, yBottom, yTop} = getDancerBounds(frame)
  dancerShapeUniforms.xMid.value = xMid / OUTLINE_GRID_SIZE
  dancerShapeUniforms.yBottom.value = yBottom / OUTLINE_GRID_SIZE
  dancerShapeUniforms.yTop.value = yTop / OUTLINE_GRID_SIZE
}

async function getPeopleData() {
  //replace with fetch and cast to RawPeopleData
  // const peopleData = people.map(person => countoursAndSkeletonForPersonTHREE(person))
  const peopleDataResponse = await fetch('allPeopleData_equiSpline.json')
  const peopleData = await peopleDataResponse.json() as PeopleData
  people.forEach(person => {
    peopleData[person].splineFrames = peopleData[person].splineFrames.map(frame => frame.map(pt => new THREE.Vector2(pt.x, pt.y)))
  })
  return peopleData
}

//todo - find out how shreya data got misformatted on export

type Point = {
  x: number
  y: number
}

// const canvas = document.querySelector<HTMLCanvasElement>("#three-canvas")!;

// const splineFrames = contours.diana.frames.map(frame => bezierToCatmullRomExact(frame))

type DancerName = "aroma" | "chloe" | "chris" | "diana" | "idris" | "iman" | "jah" | "jesse" | "kat" | "kurush" | "latasha" | "martin" | "robert" | "rupal" | "sara" | "segnon" | "senay" | "shreya" | "stoney" | "zandie"
export const people: DancerName[] = ["aroma", "chloe", "chris", "diana", "idris", "iman", "jah", "jesse", "kat", "kurush", "latasha", "martin", "robert", "rupal", "sara", "segnon", "senay", "shreya", "stoney", "zandie"]
export const framesPerPerson: Record<string, number> = {}
export const createDancerScene = async (renderer: THREE.WebGLRenderer, renderTarget: THREE.WebGLRenderTarget) => {
  let transcoderPath = "../node_modules/three/examples/jsm/libs/basis/"
  if (import.meta.env.PROD) {
    console.log("running in production mode")
    transcoderPath = UNPKG_PATH
  } 
  
  // Load textures
  const loader = new KTX2Loader()
    .setTranscoderPath(transcoderPath)
    .detectSupport(renderer);

  console.log(loader);

  const textures = people.map(person => `${person}_texture_array.ktx2`)
  const textureLengthMap: Record<string, number> = {}
  const loadTexturePromises = textures.map(textureName => {
    return new Promise<THREE.CompressedArrayTexture>((resolve, reject) => {
      loader.load(
        textureName,
        (textureArray) => {
          const texArr = textureArray as THREE.CompressedArrayTexture
          textureLengthMap[textureName] = texArr.source.data.depth
          framesPerPerson[textureName.split("_")[0]] = texArr.source.data.depth
          console.log(`${textureName}:`, "frames", texArr.mipmaps!!.length, "megs", texArr.mipmaps!![0].data.length / 1000000, "format", texArr.format);
          resolve(texArr);
        },
        undefined,
        (err) => {
          console.log("error loading texture", textureName)
          reject(new Error(`Error loading texture: ${textureName} ${err}`))
        }
      );
    });
  });
  const textureArrays = await Promise.all(loadTexturePromises)  
  const texturesByName: Record<string, THREE.CompressedArrayTexture> = {}
  textures.forEach((textureName, i) => {
    texturesByName[textureName] = textureArrays[i]
  })

  // const peopleData = people.map(person => countoursAndSkeletonForPersonTHREE(person))
  const peopleData = await getPeopleData()

  // Scene
  const scene = new THREE.Scene();

  const orthoCam = new THREE.OrthographicCamera(0, resolution.width, 0, resolution.height)
  orthoCam.position.z = 2
  scene.add(orthoCam)

  // Uniforms
  const uniforms = {
    frame: { value: 0 },
    textureArray: { value: null },
    makeBlackThresh: { value: 3 },
  };

  // Quad geometry and shader material
  const size = 1
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2DArray textureArray;
      uniform float frame;
      uniform float makeBlackThresh;
      varying vec2 vUv;
      void main() {
        vec2 yFlip = vec2(vUv.x, 1.0 - vUv.y);
        vec4 color = texture(textureArray, vec3(yFlip, frame));
        bool makeBlack = color.a == 0.0 || color.r + color.g + color.b > makeBlackThresh;
        gl_FragColor = makeBlack ? vec4(0,0,0,0) : color;
      }
    `,
  });
  material.transparent = true;
  material.side = THREE.DoubleSide;


  const dancerShapeUniforms = {
    color1: { value: new THREE.Vector4(0.5, 0, 0, 1) },
    color2: { value: new THREE.Vector4(0, 0.5, 0, 1) },
    color3: { value: new THREE.Vector4(0, 0, 0.5, 1) },
    color4: { value: new THREE.Vector4(0.5, 0.5, 0, 1) },
    color5: { value: new THREE.Vector4(0, 0.5, 0.5, 1) },
    color6: { value: new THREE.Vector4(0.5, 0, 0.5, 1) },
    xMid: { value: 0.5 },
    yBottom: { value: 0.33 },
    yTop: { value: 0.66 },
  }
  const dancerShapeMaterial = new THREE.ShaderMaterial({
    uniforms: dancerShapeUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec4 color1;
      uniform vec4 color2;
      uniform vec4 color3;
      uniform vec4 color4;
      uniform vec4 color5;
      uniform vec4 color6;
      uniform float xMid;
      uniform float yBottom;
      uniform float yTop;
      varying vec2 vUv;
      void main() {
        vec4 outColor = vec4(0,0,0,0);

        if(vUv.x < xMid && vUv.y < yBottom) {
          outColor = color1;
        } else if(vUv.x < xMid && vUv.y > yBottom && vUv.y < yTop) {
          outColor = color2;
        } else if(vUv.x < xMid && vUv.y > yTop) {
          outColor = color3;
        } else if(vUv.x > xMid && vUv.y < yBottom) {
          outColor = color4;
        } else if(vUv.x > xMid && vUv.y > yBottom && vUv.y < yTop) {
          outColor = color5;
        } else if(vUv.x > xMid && vUv.y > yTop) {
          outColor = color6;
        }
        gl_FragColor = outColor;
      }
    `,
  });
  dancerShapeMaterial.transparent = true;
  dancerShapeMaterial.side = THREE.DoubleSide;
  

  const dancers: Map<string, Dancer> = new Map()

  const baseFps = 15

  //todo add Line2 for outlines here

  function createDancer(dancerName: DancerName, blockSize: number, position: {x: number, y: number}): Dancer {
    const textureName = `${dancerName}_texture_array.ktx2`
    const matClone = material.clone()
    const uniformsClone = {
      frame: { value: 0 },
      textureArray: { value: texturesByName[textureName] },
      makeBlackThresh: { value: 3 },
    }
    matClone.uniforms = uniformsClone

    const quad = new THREE.Mesh(geometry, matClone);
    quad.scale.set(blockSize, blockSize * -1, 1)

    const lineGeometry = new LineGeometry()
    const lineMaterial = new LineMaterial( {
      color: 0xffffff,
      linewidth: 2, // in world units with size attenuation, pixels otherwise
      // vertexColors: true,
      dashed: false,
      alphaToCoverage: true,
      // worldUnits: true,
    });
    lineGeometry.setFromPoints(peopleData[dancerName].splineFrames[0])
    const line = new Line2(lineGeometry, lineMaterial)
    line.computeLineDistances();
    line.scale.set(blockSize / 512, blockSize / 512, 1)
    //translate xy so that the scaling is centered on the quad
    line.position.x = - blockSize / 2
    line.position.y = - blockSize / 2
    line.translateZ(0.001)

    const group = new THREE.Group()
    group.position.x = position.x
    group.position.y = position.y
    group.add(quad)
    group.add(line)
    
    const params: QuadParam = {
      texName: textureName,
      frameCount: textureLengthMap[textureName],
      fps: baseFps,
      dancerName,
      showRegions: false,
      color1: new THREE.Vector4(1, 0, 0, 1),
      color2: new THREE.Vector4(0, 1, 0, 1),
      color3: new THREE.Vector4(0, 0, 1, 1),
      color4: new THREE.Vector4(1, 1, 0, 1),
      color5: new THREE.Vector4(0, 1, 1, 1),
      color6: new THREE.Vector4(1, 0, 1, 1),
    }

    const lerpDef = {
      lerping: false,
      lerp: 0,
      fromDancer: dancerName,
      toDancer: dancerName,
      fromFrame: 0,
      toFrame: 0,
    }

    const id = crypto.randomUUID()

    const dancerShapeGeometry = new THREE.BufferGeometry()
    dancerShapeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(OUTLINE_LENGTH * 3), 3))
    dancerShapeGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(OUTLINE_LENGTH * 2), 2))
    dancerShapeGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(OUTLINE_LENGTH*3), 1))
    const dancerShapeMat = dancerShapeMaterial.clone()
    const dancerShapeMesh = new THREE.Mesh(dancerShapeGeometry, dancerShapeMat)
    // dancerShapeMesh.scale.set(blockSize / 512, blockSize / 512, 1)
    dancerShapeMesh.position.x = - blockSize / 2
    dancerShapeMesh.position.y = - blockSize / 2
    dancerShapeMesh.translateZ(0.005)
    dancerShapeMesh.visible = false
    dancerShapeMesh.frustumCulled = false
    group.add(dancerShapeMesh)

    const dancerShape = {
      mesh: dancerShapeMesh,
      geometry: dancerShapeGeometry,
      material: dancerShapeMat,
    }
    const dancerShapeUniforms = {
      color1: { value: new THREE.Vector4(0.5, 0, 0, 1) },
      color2: { value: new THREE.Vector4(0, 0.5, 0, 1) },
      color3: { value: new THREE.Vector4(0, 0, 0.5, 1) },
      color4: { value: new THREE.Vector4(0.5, 0.5, 0, 1) },
      color5: { value: new THREE.Vector4(0, 0.5, 0.5, 1) },
      color6: { value: new THREE.Vector4(0.5, 0, 0.5, 1) },
      xMid: { value: 0.5 },
      yBottom: { value: 0.33 },
      yTop: { value: 0.66 },
    }
    dancerShapeMat.uniforms = dancerShapeUniforms

    scene.add(group)

    return {
      id,
      group,
      line,
      quad,
      uniforms: uniformsClone,
      dancerShape,
      dancerShapeUniforms,
      params,
      lerpDef,
      quadVisible: (b: boolean) => quad.visible = b,
      lineVisible: (b: boolean) => line.visible = b,
      regionsVisible: (b: boolean) => {
        dancerShape.mesh.visible = b
        params.showRegions = b
      },
      setFrame: (frame: number) => {
        uniformsClone.frame.value = frame % params.frameCount
        const frameData = peopleData[params.dancerName].splineFrames[frame % params.frameCount]
        line.geometry.setFromPoints(frameData)
        if(params.showRegions) {
          updateOutlineFlatGeometry(dancerShape.geometry, frameData)
          updateDancerShapeUniforms(dancerShapeUniforms, frameData)
        }
      },
      updateLerp: () => {
        const startFrame = peopleData[lerpDef.fromDancer].splineFrames[lerpDef.fromFrame % params.frameCount]
        const endFrame = peopleData[lerpDef.toDancer].splineFrames[lerpDef.toFrame % params.frameCount]
        const lerpFrame = startFrame.map((pt, i) => pt.clone().lerp(endFrame[i], lerpDef.lerp))
        line.geometry.setFromPoints(lerpFrame)
        if(params.showRegions) {
          updateOutlineFlatGeometry(dancerShape.geometry, lerpFrame)
          updateDancerShapeUniforms(dancerShapeUniforms, lerpFrame)
        }
      },
      remove: () => {
        //sometimes performance tanks when doing this synchronously
        setTimeout(() => {
          scene.remove(group)
          line.removeFromParent()
          quad.removeFromParent()
          dancerShape.mesh.removeFromParent()
          lineMaterial.dispose()
          lineGeometry.dispose()
          matClone.dispose()
          dancerShapeGeometry.dispose()
          dancerShapeMaterial.dispose()
          dancers.delete(id)
        }, 1)
      }
    }
  }


   //4x5 grid positions
   const rows = 3
   const cols = 7
   const blockWidth = resolution.width / cols 
   const blockHeight = resolution.height / rows
 
   const positions = Array.from({length: rows * cols}, (_, i) => ({
     x: (i % cols) * blockWidth + blockWidth / 2,
     y: Math.floor(i / cols) * blockHeight + blockHeight / 2,
   }))
   const numQuads = rows * cols

  // for (let i = 0; i < numQuads; i++) {
  //   if(!people[i]) continue
  //   const dancer = createDancer(people[i], blockSize, positions[i])
  //   dancers.set(dancer.id, dancer)
  // }

  

  let lastTime = performance.now()
  let accumTime = 0

  const renderScene = (renderTarget: THREE.WebGLRenderTarget) => {
    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, orthoCam);
  }

  const animate = (renderTarget: THREE.WebGLRenderTarget) => {
    const newTime = performance.now()
    const deltaTime = newTime - lastTime
    lastTime = newTime
    accumTime += deltaTime / 1000

    dancers.forEach(dancer => {
      dancer.setFrame(Math.floor(accumTime * dancer.params.fps) % dancer.params.frameCount)
    })

    renderScene(renderTarget)
  }

  return {
    animate: () => animate(renderTarget),
    dancers,
    createDancer,
    scene,
    renderer,
    renderScene
  }
}
