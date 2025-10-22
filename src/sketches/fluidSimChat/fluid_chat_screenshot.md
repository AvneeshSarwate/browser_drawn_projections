# Fluid Chat Screenshot Feature Implementation Plan

## Overview
Add screenshot capture functionality to the fluid simulation chat interface, allowing users to capture simulation frames and reference them in conversations with Claude.

## Implementation Overview

**Phase 1 (3-4 hours)**: Core capture, dropdown UI, and Claude API integration  
**Phase 2 (3-4 hours)**: Polish with badges, keyboard shortcuts, memory management

**Key files to create:**
- `useScreenshots.ts` - Composable managing screenshot store
- Modify `createClaudeFluidChat.ts` to accept `getAttachments()` callback
- Update `FluidChat.vue` with dropdown + badges UI

**Image format:** WebP at 0.85 quality, full canvas resolution. PNG option for precise debug analysis.

## Key Design Decision: UI-Driven Attachment (Not Tool-Based)

**Why not use tool calls for image selection?**
- Claude tools return JSON, not image bytes
- The assistant cannot pull local image assets after the conversation starts
- Images must be included in the initial user message content as `input_image` blocks
- Tool-based selection would require multiple round trips without delivering actual pixels

**Recommended approach:** UI-driven selection where users choose screenshots before sending, and images are attached directly to the user message.

## Architecture

### 1. Data Structures

#### Screenshot Interface
```typescript
interface Screenshot {
  id: string                    // unique id (nanoid)
  label: string                 // auto-generated label (Shot 1, Shot 2, etc)
  createdAt: number            // timestamp
  debugMode: FluidDebugMode    // 'dye' | 'velocity' | 'divergence' | 'pressure' | 'splat' | 'splatRaw'
  width: number                // original capture dimensions
  height: number
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg'
  base64: string               // base64 encoded (no data: prefix)
  sizeBytes: number           // for memory management
  blobUrl: string             // blob URL for display (browser scales via CSS)
  note?: string               // optional user caption
}
```

#### Screenshot Store (Composable)
```typescript
// useScreenshots.ts
export function useScreenshots() {
  const screenshots = ref<Screenshot[]>([])
  const selectedIds = ref<Set<string>>(new Set())
  const maxItems = 30  // auto-cleanup beyond this
  let captureCount = 0  // for auto-generating labels
  
  // Methods:
  // - capture(options?: { lossless?: boolean }): Promise<Screenshot>
  // - setSelected(ids: string[]): void
  // - toggleSelected(id: string): void
  // - remove(id: string): void (revokes object URLs)
  // - getSelected(): Screenshot[]
  // - clearSelection(): void
  
  return { screenshots, selectedIds, capture, remove, ... }
}
```

### 2. Image Capture & Processing

#### Source
- Canvas: `state.fluidEngine?.getRenderingCanvas()`
- If simulation is paused, ensure a fresh frame by calling `state.shaderDrawFunc?.()`

#### Processing Pipeline
1. **Capture**: Use `canvas.toBlob()` to get image data at full canvas resolution
2. **Encode**: 
   - Default: WebP quality 0.85
   - Optional: PNG lossless for precise debug analysis
3. **Store**: Convert to base64 (no `data:` prefix) and store with metadata
4. **Thumbnail**: Reuse same blob URL, let browser rescale via CSS

#### Image Format Guidelines
- **Default**: WebP q=0.85 at full canvas resolution
- **Debug precision**: PNG lossless for divergence/pressure heatmaps
- **Thumbnails**: Same image, scaled via CSS/HTML
- **Base64**: No `data:image/webp;base64,` prefix (Claude API expects raw base64)

### 3. UI/UX Flow

#### Capture Button
- Camera icon overlay on simulation canvas
- Click to capture → creates screenshot with auto-incrementing label ("Shot 1", "Shot 2", etc.)
- Badge shows current debug mode (e.g., "Dye", "Velocity")
- Optional: Toggle for lossless PNG capture

#### Screenshot Selection UI
**Location**: Below the text input box in the chat composer

**Components**:
1. **Dropdown**: Lists all captured screenshots
   - Shows: "Shot 1 (Dye) - 2:34pm"
   - Newest first
   - Scrollable if many screenshots
   
2. **Add Button**: Adds selected screenshot from dropdown to attachment list
   - When clicked, selected screenshot is added to message
   - Dropdown shows visual feedback (checkmark or disabled state) for already-selected screenshots

3. **Selected Screenshots Display**: Below dropdown/add button
   - Show badges/chips for each selected screenshot
   - Each badge displays:
     - Label (e.g., "Shot 3")
     - Debug mode badge (small, e.g., "Dye")
     - Thumbnail preview (tiny, optional)
     - Remove button (×)
   - Multi-select supported - can attach multiple screenshots

**Memory Management**:
- Cap at 30 screenshots max
- Auto-delete oldest when limit exceeded
- Revoke blob URLs on deletion
- Show size warning for images >1 MB

#### Composer Integration
**Below textarea**: 
- Dropdown + Add button for selecting screenshots
- Selected screenshot badges/chips appear below
- Each badge shows: label + debug mode + remove (×)

**After send**:
- Clear attachment selection by default
- Keep screenshots in store for future messages

### 4. Claude API Integration

#### Modified createClaudeFluidChat Signature
```typescript
export function createClaudeFluidChat(
  getFluidParams: () => ParamDef[] | undefined,
  opts?: { getAttachments?: () => Screenshot[] }
): ClaudeFluidChat
```

#### Send Message with Attachments
```typescript
async function send(apiKey: string, userText: string): Promise<void> {
  const attachments = opts?.getAttachments?.() ?? []
  
  // Build content array with images first, then text
  const userContent: Anthropic.ContentBlockParam[] = [
    // Add all attached images
    ...attachments.map(screenshot => ({
      type: 'image',  // or 'input_image' depending on SDK version
      source: {
        type: 'base64',
        media_type: screenshot.mediaType,
        data: screenshot.base64
      }
    })),
    // Add text with caption listing attached screenshots
    {
      type: 'text',
      text: buildUserText(userText, attachments)
    }
  ]
  
  const conversationMessages: Anthropic.MessageParam[] = [
    { role: 'user', content: userContent }
  ]
  
  // Rest of existing send logic...
}
```

#### Build User Text with Caption
```typescript
function buildUserText(prompt: string, attachments: Screenshot[]): string {
  if (attachments.length === 0) return prompt
  
  const caption = attachments
    .map(s => `- ${s.label} — mode: ${s.debugMode} — ${new Date(s.createdAt).toLocaleString()}`)
    .join('\n')
  
  return `${prompt}\n\nAttached screenshots:\n${caption}`
}
```

### 5. Implementation Files

#### New Files
1. **`useScreenshots.ts`** - Composable for screenshot store and operations
2. **`types/screenshot.ts`** - TypeScript interfaces

#### Modified Files
1. **`FluidChat.vue`**
   - Add screenshot dropdown + add button below textarea
   - Add selected screenshot badges below dropdown
   - Pass `getAttachments` to `createClaudeFluidChat`

2. **`createClaudeFluidChat.ts`**
   - Update factory signature to accept `opts.getAttachments`
   - Modify `send()` to build multi-block content array
   - Add `buildUserText()` helper

3. **`SketchHtml.vue`**
   - Add capture button overlay on canvas

4. **`appState.ts`**
   - Optionally add screenshot store to global state if needed

## Edge Cases & Guardrails

### Memory Management
- **Problem**: Many screenshots can bloat memory
- **Solution**: 
  - Cap at 30 screenshots, delete oldest on overflow
  - Revoke blob URLs on deletion
  - Show size tooltip per image
  - Warn when individual image >1 MB

### Duplicate Labels
- **Problem**: Auto-generated labels are always unique (Shot 1, Shot 2, etc.)
- **Solution**: Use simple counter that increments with each capture

### Canvas Timing
- **Problem**: Async rendering might capture stale frame
- **Solution**:
  - Call `state.shaderDrawFunc?.()` before capture if paused
  - Use `requestAnimationFrame` callback for live captures

### High-DPI Canvases
- **Problem**: Retina displays create large images
- **Solution**: Accept full resolution; WebP compression keeps size reasonable

### SDK Block Type Compatibility
- **Problem**: Different SDK versions use 'image' vs 'input_image'
- **Solution**: Feature-detect or use config flag; retry if first attempt fails

### Multiple Images Limit
- **Soft cap**: 4 images per message (default)
- Show tooltip: "Sending many images may slow responses"
- Preserve user-defined order (selection order or drag-to-reorder)

## Implementation Phases

### Phase 1: Core Functionality (Medium effort: 3-4 hours)
- [ ] Create `useScreenshots.ts` composable
- [ ] Implement capture from canvas with downscaling
- [ ] Add capture button overlay on canvas
- [ ] Create dropdown + add button UI in `FluidChat.vue`
- [ ] Create selected screenshot badges display
- [ ] Modify `createClaudeFluidChat.ts` to accept attachments
- [ ] Test end-to-end image sending to Claude

### Phase 2: Polish & UX (Medium effort: 3-4 hours)
- [ ] Add debug mode badges to dropdown items
- [ ] Add thumbnail preview to selected badges (CSS-scaled)
- [ ] Memory management with auto-cleanup
- [ ] Size warnings and compression options
- [ ] Visual feedback for already-selected screenshots in dropdown
- [ ] Keyboard shortcuts (Enter in dropdown to add)
- [ ] Responsive design for mobile

### Phase 3: Advanced Features (Optional)
- [ ] Add `listScreenshots` tool for Claude to query available images
- [ ] Persistent storage with IndexedDB
- [ ] Auto-capture sequences (record every N seconds)
- [ ] Entropy-based "best frame" selection
- [ ] Export/import screenshot collections

## Testing Checklist

- [ ] Capture from each debug mode (dye, velocity, divergence, pressure, splat, splatRaw)
- [ ] Verify image encoding and size (should be <1 MB typically)
- [ ] Test multiple image attachments in single message
- [ ] Verify Claude receives and interprets images correctly
- [ ] Test selection via dropdown + add button flow
- [ ] Test removing selected screenshots via badge × button
- [ ] Verify already-selected screenshots show feedback in dropdown
- [ ] Test memory cleanup when exceeding 30 screenshots
- [ ] Test on different screen sizes/DPI
- [ ] Verify blob URL cleanup (no memory leaks)
- [ ] Test paused vs live capture timing

## API Reference

### Claude Messages API - Vision
```typescript
// Supported image formats
mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

// Content block structure
{
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/webp',
    data: 'iVBORw0KGgoAAAANS...' // no data: prefix
  }
}

// Alternative: URL-based (requires public URL)
{
  type: 'image',
  source: {
    type: 'url',
    url: 'https://example.com/image.jpg'
  }
}
```

## Future Enhancements

1. **Comparison Mode**: Side-by-side view of multiple screenshots
2. **Annotation Tools**: Draw circles/arrows on screenshots before sending
3. **History Playback**: Replay sequence of captures as animation
4. **Export Options**: Download screenshot collection as ZIP
5. **Cloud Storage**: Optional upload to cloud for persistent URLs
6. **AI Suggestions**: Auto-capture interesting moments based on divergence spikes
7. **Collaborative Sessions**: Share screenshot gallery with others

## References

- [Claude Messages API - Vision](https://docs.anthropic.com/en/api/messages-examples)
- [Canvas.toBlob() MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
- [WebP Image Format](https://developers.google.com/speed/webp)
- Current implementation: `src/sketches/fluidSimChat/`
