<script setup lang="ts">
import { ref, inject } from 'vue';
import { resolution, type PolygonFillAppState, appStateName } from './appState'

const resRef = ref(resolution)
const appState = inject<PolygonFillAppState>(appStateName)!!

// Add popup window functionality
let popupWindow: Window | null = null
const popupCanvas = () => {
  console.log("popup canvas")
  if(popupWindow && !popupWindow.closed) return
  popupWindow = window.open("", "popupWindow", `width=${resolution.width},height=${resolution.height}`)
  if (!popupWindow) return
  
  popupWindow.document.body.style.backgroundColor = "black"
  popupWindow.document.body.style.margin = "0"
  popupWindow.document.body.style.padding = "0"
  
  // Get the three.js canvas and move it to popup
  const threeCanvas = document.getElementById('threeCanvas')
  if (threeCanvas) {
    threeCanvas.style.width = '100%'
    threeCanvas.style.height = '100%'

    const fullscreenButton = popupWindow.document.createElement('button');
    fullscreenButton.innerText = 'Fullscreen';
    fullscreenButton.style.position = 'absolute';
    fullscreenButton.style.top = '10px';
    fullscreenButton.style.right = '10px';
    fullscreenButton.style.zIndex = '1000';
    fullscreenButton.onclick = (e) => {
      // Prevent event bubbling to avoid triggering canvas mouse events
      e.stopPropagation();
      e.preventDefault();
      
      const canvas = popupWindow?.document.getElementById('threeCanvas') as HTMLCanvasElement
      if (canvas) {
        // Store original canvas dimensions and styling
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        const originalStyleWidth = canvas.style.width;
        const originalStyleHeight = canvas.style.height;
        
        canvas.requestFullscreen().then(() => {
          console.log('Entering fullscreen with canvas dimensions:', {
            width: originalWidth,
            height: originalHeight,
            styleWidth: originalStyleWidth,
            styleHeight: originalStyleHeight
          });
          
          // Ensure canvas maintains its resolution in fullscreen
          canvas.width = originalWidth;
          canvas.height = originalHeight;
          canvas.style.width = '100vw';
          canvas.style.height = '100vh';
          canvas.style.backgroundColor = 'black';
          fullscreenButton.style.display = 'none';
        }).catch(err => {
          console.error('Failed to enter fullscreen:', err);
        });
        
        // Listen for fullscreen exit
        const handleFullscreenChange = () => {
          const isStillFullscreen = !!(popupWindow?.document.fullscreenElement || 
                                      (popupWindow?.document as any)?.webkitFullscreenElement || 
                                      (popupWindow?.document as any)?.mozFullScreenElement || 
                                      (popupWindow?.document as any)?.msFullscreenElement);
          
          if (!isStillFullscreen) {
            console.log('Exiting fullscreen, restoring canvas styling');
            canvas.style.width = originalStyleWidth || '100%';
            canvas.style.height = originalStyleHeight || '100%';
            canvas.style.backgroundColor = '';
            fullscreenButton.style.display = 'block';
            popupWindow?.document.removeEventListener('fullscreenchange', handleFullscreenChange);
          }
        };
        
        popupWindow.document.addEventListener('fullscreenchange', handleFullscreenChange);
      }
    };
    
    // Add the button with a flag to ignore clicks on it
    fullscreenButton.setAttribute('data-ignore-click', 'true');
    popupWindow.document.body.appendChild(fullscreenButton);

    // Add instructions to popup
    const instructions = popupWindow.document.createElement('div');
    instructions.innerHTML = `
      <div style="color: white; position: absolute; top: 30px; left: 10px; font-family: Arial; font-size: 12px; z-index: 1000;">
        <p>1-4: Change cursor mode | \` (backtick): Finalize polygon | P: Pause | Q/W/E/R: Play sequences</p>
      </div>
    `;
    popupWindow.document.body.appendChild(instructions);

    // Store reference to original container
    const originalContainer = threeCanvas.parentElement
    
    // Move canvas to popup
    popupWindow.document.body.appendChild(threeCanvas)
    
    // Focus the popup window immediately
    popupWindow.focus()
    
    // Update app state AFTER moving the canvas
    setTimeout(() => {
      appState.canvasInPopup = true
      appState.popupWindow = popupWindow
      console.log('Canvas moved to popup, app state updated')
      // Focus again after state update
      popupWindow?.focus()
    }, 100)

    // Handle popup close - use multiple event types for better reliability
    const handlePopupClose = () => {
      console.log('Popup closing, moving canvas back')
      if (originalContainer && threeCanvas) {
        // Restore original canvas styling
        threeCanvas.style.width = ''
        threeCanvas.style.height = ''
        threeCanvas.style.objectFit = 'initial'
        
        originalContainer.appendChild(threeCanvas)
        
        // Focus main window
        window.focus()
        
        // Update app state AFTER moving canvas back
        setTimeout(() => {
          appState.canvasInPopup = false
          appState.popupWindow = null
          console.log('Canvas moved back to main page, app state updated')
        }, 100)
      }
    }

    // Listen for multiple close events
    popupWindow.addEventListener("beforeunload", handlePopupClose)
    popupWindow.addEventListener("unload", handlePopupClose)
    
    // Also poll to check if window was closed
    const checkClosed = setInterval(() => {
      if (popupWindow?.closed) {
        handlePopupClose()
        clearInterval(checkClosed)
        popupWindow = null
      }
    }, 1000)
  }
}

</script>

<template>
  <div class="sketch-container">
    <div id="canvasContainer" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}">
      <canvas id="p5Canvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
      <canvas id="threeCanvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
    </div>
    
    <div class="controls-section">
      <div class="instructions">
        <div class="instruction-item">
          <span class="key-combo">1-4</span>
          <span class="description">Change cursor mode</span>
        </div>
        <div class="instruction-item">
          <span class="key-combo">`</span>
          <span class="description">Finalize polygon</span>
        </div>
        <div class="instruction-item">
          <span class="key-combo">P</span>
          <span class="description">Pause</span>
        </div>
        <div class="instruction-item">
          <span class="key-combo">Q/W/E/R</span>
          <span class="description">Play sequences</span>
        </div>
      </div>
      
      <button @click="popupCanvas" class="popup-btn">
        <span class="btn-icon">🪟</span>
        Popup Canvas
      </button>
    </div>
    
    <div id="debugInfo" class="debug-info"></div>
  </div>
</template>

<style scoped>
.sketch-container {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #333;
}

#canvasContainer {
  background-color: black;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  margin-bottom: 12px;
}

#p5Canvas {
  border: none;
  top: 0;
  left: 0;
  z-index: -1;
  visibility: hidden;
}

#threeCanvas {
  border: none;
  position: absolute;
  top: 0;
  left: 0;
  visibility: visible;
}

.controls-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}

.instructions {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.instruction-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.key-combo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  background: #6c757d;
  color: white;
  border-radius: 3px;
  font-weight: bold;
  font-size: 11px;
  padding: 0 4px;
  white-space: nowrap;
}

.description {
  color: #495057;
  font-weight: 500;
  white-space: nowrap;
}

.popup-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #007bff;
  color: white;
}

.popup-btn:hover {
  background: #0056b3;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.popup-btn:active {
  transform: translateY(0);
}

.btn-icon {
  font-size: 14px;
}

.debug-info {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  color: #6c757d;
  min-height: 20px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.debug-info:empty {
  display: none;
}

/* Responsive Design */
@media (max-width: 768px) {
  .controls-section {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .instructions {
    justify-content: center;
    gap: 12px;
  }
  
  .instruction-item {
    flex-direction: column;
    gap: 2px;
    text-align: center;
  }
  
  .popup-btn {
    align-self: center;
  }
}

@media (max-width: 480px) {
  .instructions {
    flex-direction: column;
    gap: 6px;
  }
  
  .instruction-item {
    flex-direction: row;
    gap: 6px;
  }
}
</style>