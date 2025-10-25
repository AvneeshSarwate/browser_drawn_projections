<template>
  <div class="test-container">
    <h2>Raw WebGPU CSS Resize Test</h2>
    <div class="canvas-wrapper" :class="{ 'css-resize': useCSSResize }">
      <canvas ref="canvasRef" :width="canvasWidth" :height="canvasHeight"></canvas>
    </div>
    <div class="log">
      <h3>Config: MSAA={{ useMSAA }} | CSS Resize={{ useCSSResize }}</h3>
      <h3>Errors:</h3>
      <pre v-if="error" class="error">{{ error }}</pre>
      <pre v-else class="success">No errors!</pre>
    </div>
    <div class="controls">
      <label>
        <input type="checkbox" v-model="useMSAA" @change="restart" />
        MSAA
      </label>
      <label>
        <input type="checkbox" v-model="useCSSResize" @change="restart" />
        CSS Resize
      </label>
      <button @click="restart">Restart</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const canvasRef = ref<HTMLCanvasElement>()
const canvasWidth = 1792
const canvasHeight = 896
const useMSAA = ref(true)
const useCSSResize = ref(true)
const diagnostics = ref('')
const error = ref('')

let device: GPUDevice | null = null
let context: GPUCanvasContext | null = null
let renderTexture: GPUTexture | null = null
let animationId: number | null = null
let pipeline: GPURenderPipeline | null = null
let vertexBuffer: GPUBuffer | null = null

async function init() {
  const canvas = canvasRef.value
  if (!canvas) return

  error.value = ''
  diagnostics.value = 'Initializing...\n'

  try {
    // Get WebGPU adapter and device
    const adapter = await navigator.gpu?.requestAdapter()
    if (!adapter) throw new Error('WebGPU not supported')
    
    device = await adapter.requestDevice()
    device.addEventListener('uncapturederror', (event) => {
      error.value = `WebGPU Error: ${event.error.message}`
      console.error('WebGPU uncaptured error:', event.error)
    })

    // Log canvas dimensions
    const rect = canvas.getBoundingClientRect()
    diagnostics.value += `Canvas attributes: ${canvas.width} x ${canvas.height}\n`
    diagnostics.value += `Canvas clientSize: ${canvas.clientWidth} x ${canvas.clientHeight}\n`
    diagnostics.value += `Canvas boundingRect: ${rect.width} x ${rect.height}\n`
    diagnostics.value += `devicePixelRatio: ${window.devicePixelRatio}\n`
    diagnostics.value += `MSAA enabled: ${useMSAA.value}\n`
    diagnostics.value += `CSS resize: ${useCSSResize.value}\n\n`

    // Configure canvas context
    context = canvas.getContext('webgpu') as GPUCanvasContext
    const format = navigator.gpu.getPreferredCanvasFormat()
    
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    })

    diagnostics.value += `Context format: ${format}\n`
    diagnostics.value += `Configured size: ${canvas.width} x ${canvas.height}\n`

    // Create triangle vertex buffer (positions + colors)
    const vertices = new Float32Array([
      // x, y, r, g, b
      0.0, 0.5, 1.0, 0.0, 0.0,    // top (red)
      -0.5, -0.5, 0.0, 1.0, 0.0,  // bottom left (green)
      0.5, -0.5, 0.0, 0.0, 1.0,   // bottom right (blue)
    ])
    
    vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(vertexBuffer, 0, vertices)

    // Create shader module
    const shaderModule = device.createShaderModule({
      code: `
        struct VertexOutput {
          @builtin(position) position: vec4f,
          @location(0) color: vec3f,
        }

        @vertex
        fn vertexMain(@location(0) pos: vec2f, @location(1) color: vec3f) -> VertexOutput {
          var output: VertexOutput;
          output.position = vec4f(pos, 0.0, 1.0);
          output.color = color;
          return output;
        }

        @fragment
        fn fragmentMain(@location(0) color: vec3f) -> @location(0) vec4f {
          return vec4f(color, 1.0);
        }
      `
    })

    // Create render pipeline
    pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: 5 * 4, // 5 floats per vertex
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
            { shaderLocation: 1, offset: 2 * 4, format: 'float32x3' }, // color
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
      multisample: useMSAA.value ? {
        count: 4,
      } : undefined,
    })

    // Create MSAA texture if enabled
    if (useMSAA.value) {
      renderTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format,
        sampleCount: 4,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
      diagnostics.value += `MSAA texture: ${canvas.width} x ${canvas.height}, samples: 4\n`
    }

    // Simple render loop
    function render() {
      if (!device || !context) return

      try {
        const commandEncoder = device.createCommandEncoder()
        const textureView = context.getCurrentTexture().createView()

        const renderPassDescriptor: GPURenderPassDescriptor = useMSAA.value
          ? {
              colorAttachments: [{
                view: renderTexture!.createView(),
                resolveTarget: textureView,
                clearValue: { r: 0.1, g: 0.2, b: 0.4, a: 1.0 },
                loadOp: 'clear' as const,
                storeOp: 'store' as const,
              }],
            }
          : {
              colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.1, g: 0.2, b: 0.4, a: 1.0 },
                loadOp: 'clear' as const,
                storeOp: 'store' as const,
              }],
            }

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
        passEncoder.setPipeline(pipeline!)
        passEncoder.setVertexBuffer(0, vertexBuffer!)
        passEncoder.draw(3)
        passEncoder.end()

        device.queue.submit([commandEncoder.finish()])
      } catch (e) {
        error.value = `Render error: ${e}`
        console.error('Render error:', e)
        if (animationId) cancelAnimationFrame(animationId)
        return
      }

      animationId = requestAnimationFrame(render)
    }

    render()
  } catch (e) {
    error.value = `Init error: ${e}`
    console.error('Init error:', e)
  }
}

function cleanup() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  if (vertexBuffer) {
    vertexBuffer.destroy()
    vertexBuffer = null
  }
  if (renderTexture) {
    renderTexture.destroy()
    renderTexture = null
  }
  if (device) {
    device.destroy()
    device = null
  }
  context = null
  pipeline = null
}

async function restart() {
  cleanup()
  await new Promise(resolve => setTimeout(resolve, 100))
  init()
}

onMounted(() => {
  init()
})

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
.test-container {
  padding: 20px;
  background: #08090f;
  color: #dde0ff;
  min-height: 100vh;
}

h2 {
  margin: 0 0 15px 0;
  font-size: 1.1rem;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 15px;
  padding: 12px 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.controls label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.controls button {
  background: #667aff;
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.controls button:hover {
  background: #7788ff;
}

.canvas-wrapper {
  background: rgba(0, 0, 0, 0.3);
  padding: 10px;
  border-radius: 8px;
  display: inline-block;
  margin-bottom: 15px;
}

.canvas-wrapper canvas {
  border: 1px solid rgba(255, 255, 255, 0.3);
  display: block;
  background: black;
}

.canvas-wrapper.css-resize canvas {
  width: 100%;
  height: auto;
}

.log {
  background: rgba(0, 0, 0, 0.4);
  padding: 15px;
  border-radius: 8px;
}

.log h3 {
  margin: 0 0 10px 0;
  font-size: 1rem;
}

.log pre {
  margin: 0;
  font-family: monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.error {
  color: #ff9aa2;
}

.success {
  color: #9aff9a;
}
</style>
