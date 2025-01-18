import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { Line2, LineGeometry, LineMaterial } from "three/examples/jsm/Addons.js";
import { resolution } from "./appState";
import { REVISION } from 'three';
const THREE_PATH = `https://unpkg.com/three@0.${REVISION}.x`;
const UNPKG_PATH = `https://unpkg.com/three@0.${REVISION}.x/examples/jsm/libs/basis/`;

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

async function getPeopleData() {
  //replace with fetch and cast to RawPeopleData
  // const peopleData = people.map(person => countoursAndSkeletonForPersonTHREE(person))
  const peopleDataResponse = await fetch('allPeopleData.json')
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
const people = ["aroma", "chloe", "chris", "diana", "idris", "iman", "jah", "jesse", "kat", "kurush", "latasha", "martin", "robert", "rupal", "sara", "segnon", "senay", "shreya", "stoney", "zandie"]

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
  
  const dancers: Map<string, {
    dancerName: string
    group: THREE.Group
    line: Line2
    quad: THREE.Mesh
    uniforms: { [key: string]: { value: any } }
    params: QuadParam
    setFrame: (frame: number) => void
    remove: () => void
  }> = new Map()

  const baseFps = 15
  type QuadParam = {
    texName: string
    frameCount: number
    fps: number
  }
  const quadParams: QuadParam[] = []

  //todo add Line2 for outlines here

  function createDancer(dancerName: string, blockSize: number, position: {x: number, y: number}) {
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

    scene.add(group)
    
    const params = {
      texName: textureName,
      frameCount: textureLengthMap[textureName],
      fps: baseFps,
    }
    quadParams.push(params)

    const id = crypto.randomUUID()
    return {
      id,
      dancerName,
      group,
      line,
      quad,
      uniforms: uniformsClone,
      params,
      setFrame: (frame: number) => {
        uniformsClone.frame.value = frame
        line.geometry.setFromPoints(peopleData[dancerName].splineFrames[frame])
      },
      remove: () => {
        //sometimes performance tanks when doing this synchronously
        setTimeout(() => {
          scene.remove(group)
          line.removeFromParent()
          quad.removeFromParent()
          lineMaterial.dispose()
          lineGeometry.dispose()
          matClone.dispose()
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
   const blockSize = 200//Math.min(blockWidth, blockHeight)
 
   const positions = Array.from({length: rows * cols}, (_, i) => ({
     x: (i % cols) * blockWidth + blockWidth / 2,
     y: Math.floor(i / cols) * blockHeight + blockHeight / 2,
   }))
   const numQuads = rows * cols

  for (let i = 0; i < numQuads; i++) {
    if(!people[i]) continue
    const dancer = createDancer(people[i], blockSize, positions[i])
    dancers.set(dancer.id, dancer)
  }

  

  let lastTime = performance.now()
  let accumTime = 0

  const animate = (renderTarget: THREE.WebGLRenderTarget) => {
    const newTime = performance.now()
    const deltaTime = newTime - lastTime
    lastTime = newTime
    accumTime += deltaTime / 1000

    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, orthoCam);

    dancers.forEach(dancer => {
      dancer.setFrame(Math.floor(accumTime * dancer.params.fps) % dancer.params.frameCount)
    })
  }

  return {
    animate: () => animate(renderTarget),
    dancers,
    createDancer,
    scene,
    renderer
  }
}
