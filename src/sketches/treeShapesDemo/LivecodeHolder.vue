<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TreeShapeDemoAppState, appStateName, globalStore } from './appState';
import { inject, onMounted, onUnmounted, ref, computed } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext } from '@/channels/channels';
import { TreeShape, type Point, type FoldMode } from '@/creativeAlgs/TreeShapes';

// Change how we get appState to use inject with type assertion
const appState = inject<TreeShapeDemoAppState>(appStateName)!;

let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

// Keep track of which shape is being folded
let foldingShape: TreeShape | null = null
const foldDepth = ref(1)

// Animation control
const autoAnimating = ref(false)
const autoAnimationDelay = ref(1000) // ms between animations

// Store original positions
const originalPositions: Record<number, { x: number, y: number }> = {}

// UI Control methods
const selectShape = (index: number) => {
  if (appState.rootShapes.length > index) {
    appState.activeShape = appState.rootShapes[index]
  }
}

const isShapeActive = (index: number) => {
  return appState.activeShape === appState.rootShapes[index]
}

const setFoldMode = (mode: FoldMode) => {
  appState.selectedFoldMode = mode
  
  if (appState.activeShape) {
    applyFoldModeRecursive(appState.activeShape, mode)
  }
}

const startFold = () => {
  if (appState.activeShape) {
    foldingShape = appState.activeShape
    foldingShape.startFold(foldDepth.value)
  }
}

const reverseFold = () => {
  if (foldingShape) {
    foldingShape.reverseFold()
  }
}

const updateFoldDepth = () => {
  // No need to do anything here since foldDepth is a ref
  // and will automatically update
}

// Save original positions for animation and transformation
function saveOriginalPositions() {
  appState.rootShapes.forEach((shape, index) => {
    if (shape.points.length > 0) {
      // Calculate the center of the shape
      let centerX = 0, centerY = 0;
      shape.points.forEach(p => {
        centerX += p.x;
        centerY += p.y;
      });
      centerX /= shape.points.length;
      centerY /= shape.points.length;
      
      originalPositions[index] = { x: centerX, y: centerY };
    }
  });
}

// Animation Controls
const startAnimationLoop = () => {
  if (autoAnimating.value) return; // Already running
  
  autoAnimating.value = true;
  
  // Save initial positions if not already saved
  if (Object.keys(originalPositions).length === 0) {
    saveOriginalPositions();
  }
  
  // Create animation loop using the function defined in the code block
  launchLoop(async (ctx) => {
    // Animation loop
    while (autoAnimating.value) {
      // Animate square with outline folding
      selectShape(0);
      setFoldMode('outline');
      foldingShape = appState.rootShapes[0];
      foldingShape.startFold(foldDepth.value);
      
      // Wait for animation to complete + delay
      await ctx.waitSec(3);
      
      // Animate circle with shrink folding
      selectShape(1);
      setFoldMode('shrink');
      foldingShape = appState.rootShapes[1];
      foldingShape.startFold(foldDepth.value);
      
      // Wait for animation to complete + delay
      await ctx.waitSec(3);
      
      // Animate triangle with segment folding
      selectShape(2);
      setFoldMode('segment');
      foldingShape = appState.rootShapes[2];
      foldingShape.startFold(foldDepth.value);
      
      // Wait for animation to complete + delay
      await ctx.waitSec(3);
      
      // Animate shape positions
      ctx.branch(async (posCtx) => {
        // Move square right
        const squareStartX = originalPositions[0].x;
        const squareStartY = originalPositions[0].y;
        const steps = 60; // 60 steps for 1 second at 60fps
        
        for (let i = 0; i < steps; i++) {
          const progress = i / steps;
          const newX = squareStartX + (200 * progress);
          moveShape(0, newX, squareStartY);
          await posCtx.waitFrame();
        }
      });
      
      ctx.branch(async (posCtx) => {
        // Move circle up
        const circleStartX = originalPositions[1].x;
        const circleStartY = originalPositions[1].y;
        const steps = 60; // 60 steps for 1 second at 60fps
        
        for (let i = 0; i < steps; i++) {
          const progress = i / steps;
          const newY = circleStartY - (150 * progress);
          moveShape(1, circleStartX, newY);
          await posCtx.waitFrame();
        }
      });
      
      ctx.branch(async (posCtx) => {
        // Move triangle left
        const triangleStartX = originalPositions[2].x;
        const triangleStartY = originalPositions[2].y;
        const steps = 60; // 60 steps for 1 second at 60fps
        
        for (let i = 0; i < steps; i++) {
          const progress = i / steps;
          const newX = triangleStartX - (100 * progress);
          moveShape(2, newX, triangleStartY);
          await posCtx.waitFrame();
        }
      });
      
      // Wait for position animations to complete
      await ctx.waitSec(3);
      
      // Return shapes to original positions
      ctx.branch(async (posCtx) => {
        // Return square to original position
        const currentX = originalPositions[0].x + 200;
        const steps = 60; // 60 steps for 1 second at 60fps
        
        for (let i = 0; i < steps; i++) {
          const progress = i / steps;
          const newX = currentX - (200 * progress);
          moveShape(0, newX, originalPositions[0].y);
          await posCtx.waitFrame();
        }
      });
      
      ctx.branch(async (posCtx) => {
        // Return circle to original position
        const currentY = originalPositions[1].y - 150;
        const steps = 60; // 60 steps for 1 second at 60fps
        
        for (let i = 0; i < steps; i++) {
          const progress = i / steps;
          const newY = currentY + (150 * progress);
          moveShape(1, originalPositions[1].x, newY);
          await posCtx.waitFrame();
        }
      });
      
      ctx.branch(async (posCtx) => {
        // Return triangle to original position
        const currentX = originalPositions[2].x - 100;
        const steps = 60; // 60 steps for 1 second at 60fps
        
        for (let i = 0; i < steps; i++) {
          const progress = i / steps;
          const newX = currentX + (100 * progress);
          moveShape(2, newX, originalPositions[2].y);
          await posCtx.waitFrame();
        }
      });
      
      // Wait for position reset to complete
      await ctx.waitSec(3);
    }
  });
}

const stopAnimationLoop = () => {
  autoAnimating.value = false;
}

// Helper function to apply fold mode recursively
const applyFoldModeRecursive = (shape: TreeShape, mode: FoldMode) => {
  shape.foldMode = mode
  shape.children.forEach(child => {
    applyFoldModeRecursive(child, mode)
  })
}

// Move a shape to a new position
function moveShape(shapeIndex: number, newX: number, newY: number) {
  const shape = appState.rootShapes[shapeIndex];
  if (!shape) return;
  
  // Calculate the center of the shape
  let centerX = 0, centerY = 0;
  shape.points.forEach(p => {
    centerX += p.x;
    centerY += p.y;
  });
  centerX /= shape.points.length;
  centerY /= shape.points.length;
  
  // Calculate the offset
  const offsetX = newX - centerX;
  const offsetY = newY - centerY;
  
  // Apply the offset to all points
  shape.setPoints(shape.points.map(p => ({
    x: p.x + offsetX,
    y: p.y + offsetY
  })));
}

onMounted(() => {
  try {
    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, p5Canvas)
    }, p5Canvas)

    const code = () => {
      clearDrawFuncs()

      // Colors
      const COLORS = {
        background: p5i.color(20, 20, 20),
        rootShapes: p5i.color(255, 255, 255),
        level1: p5i.color(0, 200, 150),
        level2: p5i.color(255, 100, 50),
        level3: p5i.color(100, 100, 255),
        blue: p5i.color(50, 120, 255),
        green: p5i.color(50, 200, 100),
        purple: p5i.color(180, 100, 200),
        yellow: p5i.color(255, 200, 50),
        red: p5i.color(255, 80, 80)
      }

      // Create a 3-level hierarchy of squares
      function initializeDemo() {
        // Create a root square centered in the canvas
        const rootSquare = TreeShape.createSquare(p5i.width / 2, p5i.height / 2, 300)
        rootSquare.drawFunc = (points) => drawShape(points, COLORS.rootShapes, 2)
        
        // Create 4 child squares (level 1)
        for (let i = 0; i < 4; i++) {
          const childSquare = TreeShape.createSquare(0, 0, 100)
          childSquare.drawFunc = (points) => drawShape(points, COLORS.level1, 2)
          childSquare.foldMode = 'outline'
          
          // Add and position the child
          rootSquare.addChild(childSquare, i)
          rootSquare.positionChildInsideParent(childSquare, 0, i)
          
          // Add level 2 squares to each level 1 square
          for (let j = 0; j < 4; j++) {
            const level2Square = TreeShape.createSquare(0, 0, 40)
            level2Square.drawFunc = (points) => drawShape(points, COLORS.level2, 1.5)
            level2Square.foldMode = 'outline'
            
            // Add and position the level 2 child
            childSquare.addChild(level2Square, j)
            childSquare.positionChildInsideParent(level2Square, 0, j)
            
            // Add level 3 squares
            for (let k = 0; k < 4; k++) {
              const level3Square = TreeShape.createSquare(0, 0, 15)
              level3Square.drawFunc = (points) => drawShape(points, COLORS.level3, 1)
              level3Square.foldMode = 'outline'
              
              // Add and position the level 3 child
              level2Square.addChild(level3Square, k)
              level2Square.positionChildInsideParent(level3Square, 0, k)
            }
          }
        }
        
        // Create a root circle
        const rootCircle = TreeShape.createCircle(p5i.width / 4, p5i.height / 2, 150, 24)
        rootCircle.drawFunc = (points) => drawShape(points, COLORS.blue, 2)
        
        // Add level 1 child circles
        const numChildren = 12
        for (let i = 0; i < numChildren; i++) {
          const childCircle = TreeShape.createCircle(0, 0, 40, 12)
          childCircle.drawFunc = (points) => drawShape(points, COLORS.green, 1.5)
          childCircle.foldMode = 'shrink'
          
          // Add and position each child circle
          rootCircle.addChild(childCircle, i * 2)  // Space them out
          rootCircle.positionChildInsideParent(childCircle, 0, i * 2)
        }
        
        // Create a triangle shape by defining points
        const trianglePoints: Point[] = [
          { x: p5i.width * 0.75, y: p5i.height * 0.3 },
          { x: p5i.width * 0.85, y: p5i.height * 0.7 },
          { x: p5i.width * 0.65, y: p5i.height * 0.7 },
          { x: p5i.width * 0.75, y: p5i.height * 0.3 }  // Close the shape
        ]
        const rootTriangle = new TreeShape(trianglePoints)
        rootTriangle.drawFunc = (points) => drawShape(points, COLORS.purple, 2)
        
        // Add child shapes with segment fold mode
        const numTriangleChildren = 3
        for (let i = 0; i < numTriangleChildren; i++) {
          const childShape = new TreeShape([
            { x: 0, y: 0 },
            { x: 30, y: -40 },
            { x: 60, y: 0 },
            { x: 30, y: 40 },
            { x: 0, y: 0 }  // Close the shape
          ])
          childShape.drawFunc = (points) => drawShape(points, COLORS.yellow, 1.5)
          childShape.foldMode = 'segment'
          
          // Add and position
          rootTriangle.addChild(childShape, i)
          rootTriangle.positionChildInsideParent(childShape, 0, i)
        }
        
        // Add to app state
        appState.rootShapes = [rootSquare, rootCircle, rootTriangle]
        appState.activeShape = rootSquare
      }
      
      // Helper to draw a shape with points
      function drawShape(points: Point[], color: p5.Color, weight: number) {
        p5i.push()
        p5i.stroke(color)
        p5i.noFill()
        p5i.strokeWeight(weight)
        
        p5i.beginShape()
        for (const point of points) {
          p5i.vertex(point.x, point.y)
        }
        p5i.endShape()
        p5i.pop()
      }
      
      // Update status info
      function updateStatusInfo() {
        // Update debug info div instead of drawing directly on canvas
        const debugInfo = document.getElementById('debugInfo')
        if (debugInfo) {
          const shapeName = appState.activeShape ? 
            ['Square', 'Circle', 'Triangle'][appState.rootShapes.indexOf(appState.activeShape)] || 'Unknown' : 
            'None';
            
          const foldingStatus = foldingShape ? 
            'Currently folding' : 
            (autoAnimating.value ? 'Auto-animating' : 'Ready');
            
          debugInfo.innerHTML = `
            <div style="margin: 10px 0; text-align: center; font-family: sans-serif; color: #333;">
              <span style="margin: 0 10px; font-weight: bold;">Status: ${foldingStatus}</span>
              <span style="margin: 0 10px;">Selected: ${shapeName}</span>
              <span style="margin: 0 10px;">Mode: ${appState.selectedFoldMode}</span>
            </div>
          `
        }
      }

      // Initialize our demo shapes
      initializeDemo()
      
      // Setup our draw function
      appState.drawFunctions.push((p) => {
        // Clear background
        p.background(COLORS.background)
        
        // Draw all shapes
        appState.rootShapes.forEach(shape => shape.draw())
        
        // Update any folding animation
        if (foldingShape) {
          const complete = foldingShape.updateFold(appState.foldingSpeed)
          if (complete) {
            foldingShape = null
          }
        }
        
        // Update status info
        updateStatusInfo()
      })
      
      // Create an animation sequence using TimeContext
      function startAnimationLoop() {
        if (autoAnimating.value) return; // Already running
        
        autoAnimating.value = true;
        
        // Save initial positions if not already saved
        if (Object.keys(originalPositions).length === 0) {
          saveOriginalPositions();
        }
        
        // Create animation loop
        launchLoop(async (ctx) => {
          // Animation loop
          while (autoAnimating.value) {
            // Animate square with outline folding
            selectShape(0);
            setFoldMode('outline');
            foldingShape = appState.rootShapes[0];
            foldingShape.startFold(foldDepth.value);
            
            // Wait for animation to complete + delay
            await ctx.waitSec(3);
            
            // Animate circle with shrink folding
            selectShape(1);
            setFoldMode('shrink');
            foldingShape = appState.rootShapes[1];
            foldingShape.startFold(foldDepth.value);
            
            // Wait for animation to complete + delay
            await ctx.waitSec(3);
            
            // Animate triangle with segment folding
            selectShape(2);
            setFoldMode('segment');
            foldingShape = appState.rootShapes[2];
            foldingShape.startFold(foldDepth.value);
            
            // Wait for animation to complete + delay
            await ctx.waitSec(3);
            
            // Animate shape positions
            ctx.branch(async (posCtx) => {
              // Move square right
              const squareStartX = originalPositions[0].x;
              const squareStartY = originalPositions[0].y;
              const steps = 60; // 60 steps for 1 second at 60fps
              
              for (let i = 0; i < steps; i++) {
                const progress = i / steps;
                const newX = squareStartX + (200 * progress);
                moveShape(0, newX, squareStartY);
                await posCtx.waitFrame();
              }
            });
            
            ctx.branch(async (posCtx) => {
              // Move circle up
              const circleStartX = originalPositions[1].x;
              const circleStartY = originalPositions[1].y;
              const steps = 60; // 60 steps for 1 second at 60fps
              
              for (let i = 0; i < steps; i++) {
                const progress = i / steps;
                const newY = circleStartY - (150 * progress);
                moveShape(1, circleStartX, newY);
                await posCtx.waitFrame();
              }
            });
            
            ctx.branch(async (posCtx) => {
              // Move triangle left
              const triangleStartX = originalPositions[2].x;
              const triangleStartY = originalPositions[2].y;
              const steps = 60; // 60 steps for 1 second at 60fps
              
              for (let i = 0; i < steps; i++) {
                const progress = i / steps;
                const newX = triangleStartX - (100 * progress);
                moveShape(2, newX, triangleStartY);
                await posCtx.waitFrame();
              }
            });
            
            // Wait for position animations to complete
            await ctx.waitSec(3);
            
            // Return shapes to original positions
            ctx.branch(async (posCtx) => {
              // Return square to original position
              const currentX = originalPositions[0].x + 200;
              const steps = 60; // 60 steps for 1 second at 60fps
              
              for (let i = 0; i < steps; i++) {
                const progress = i / steps;
                const newX = currentX - (200 * progress);
                moveShape(0, newX, originalPositions[0].y);
                await posCtx.waitFrame();
              }
            });
            
            ctx.branch(async (posCtx) => {
              // Return circle to original position
              const currentY = originalPositions[1].y - 150;
              const steps = 60; // 60 steps for 1 second at 60fps
              
              for (let i = 0; i < steps; i++) {
                const progress = i / steps;
                const newY = currentY + (150 * progress);
                moveShape(1, originalPositions[1].x, newY);
                await posCtx.waitFrame();
              }
            });
            
            ctx.branch(async (posCtx) => {
              // Return triangle to original position
              const currentX = originalPositions[2].x - 100;
              const steps = 60; // 60 steps for 1 second at 60fps
              
              for (let i = 0; i < steps; i++) {
                const progress = i / steps;
                const newX = currentX + (100 * progress);
                moveShape(2, newX, originalPositions[2].y);
                await posCtx.waitFrame();
              }
            });
            
            // Wait for position reset to complete
            await ctx.waitSec(3);
          }
        });
      }
      
      // Function to stop animation loop
      function stopAnimationLoop() {
        autoAnimating.value = false;
      }
      
      // Apply fold mode to a shape and all its children
      function applyFoldModeRecursive(shape: TreeShape, mode: FoldMode) {
        shape.foldMode = mode
        shape.children.forEach(child => {
          applyFoldModeRecursive(child, mode)
        })
      }

      // Set up shader chain
      const passthru = new Passthru({ src: p5Canvas })
      const canvasPaint = new CanvasPaint({ src: passthru })

      shaderGraphEndNode = canvasPaint
      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    }

    appState.codeStack.push(code)
    code()
  } catch (e) {
    console.warn(e)
  }
})

onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
})

</script>

<template>
  <div class="controls-container">
    <div class="control-panel">
      <h3>TreeShapes Controls</h3>
      
      <div class="control-group">
        <div class="control-label">Select Shape:</div>
        <div class="control-buttons">
          <button @click="selectShape(0)" class="btn" :class="{ active: appState.activeShape === appState.rootShapes[0] }">Square</button>
          <button @click="selectShape(1)" class="btn" :class="{ active: appState.activeShape === appState.rootShapes[1] }">Circle</button>
          <button @click="selectShape(2)" class="btn" :class="{ active: appState.activeShape === appState.rootShapes[2] }">Triangle</button>
          <div></div>
        </div>
      </div>
      
      <div class="control-group">
        <div class="control-label">Fold Mode:</div>
        <div class="control-buttons">
          <button @click="setFoldMode('outline')" class="btn" :class="{ active: appState.selectedFoldMode === 'outline' }">Outline</button>
          <button @click="setFoldMode('shrink')" class="btn" :class="{ active: appState.selectedFoldMode === 'shrink' }">Shrink</button>
          <button @click="setFoldMode('segment')" class="btn" :class="{ active: appState.selectedFoldMode === 'segment' }">Segment</button>
        </div>
      </div>
      
      <div class="control-group">
        <div class="control-label">Fold Depth: {{ foldDepth }}</div>
        <div class="control-slider">
          <input 
            type="range" 
            min="1" 
            max="3" 
            step="1" 
            v-model.number="foldDepth"
          />
        </div>
      </div>
      
      <div class="control-group">
        <div class="control-label">Animation Speed: {{ appState.foldingSpeed.toFixed(3) }}</div>
        <div class="control-slider">
          <input 
            type="range" 
            min="0.001" 
            max="0.1" 
            step="0.001" 
            v-model.number="appState.foldingSpeed"
          />
        </div>
      </div>
      
      <div class="control-group">
        <div class="control-buttons action-buttons">
          <button @click="startFold" class="primary">Fold</button>
          <button @click="reverseFold">Reverse</button>
          <button @click="appState.paused = !appState.paused">
            {{ appState.paused ? 'Resume' : 'Pause' }}
          </button>
        </div>
      </div>
      
      <div class="control-group">
        <div class="control-label">Auto Animation</div>
        <div class="control-buttons">
          <button @click="startAnimationLoop" class="btn" :class="{ active: autoAnimating }">Start Animation</button>
          <button @click="stopAnimationLoop" class="btn">Stop Animation</button>
        </div>
        <div class="control-info">
          Runs a complete animation cycle with folding and movement
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls-container {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}

.control-panel {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  width: 400px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.control-panel h3 {
  margin-top: 0;
  margin-bottom: 20px;
  text-align: center;
  color: #333;
}

.control-group {
  margin-bottom: 15px;
}

.control-label {
  font-weight: bold;
  margin-bottom: 5px;
  color: #555;
}

.control-buttons {
  display: flex;
  gap: 10px;
}

.control-buttons button {
  flex: 1;
  padding: 8px 12px;
  background-color: #e0e0e0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.control-buttons button:hover {
  background-color: #d0d0d0;
}

.control-buttons button.active {
  background-color: #4a90e2;
  color: white;
}

.control-buttons button.primary {
  background-color: #4a90e2;
  color: white;
}

.control-buttons button.primary:hover {
  background-color: #3a80d2;
}

.control-slider {
  width: 100%;
}

.control-slider input {
  width: 100%;
}

.action-buttons {
  margin-top: 20px;
}

.control-info {
  font-size: 0.8em;
  color: #666;
  margin-top: 5px;
  text-align: center;
}
</style>