import Konva from 'konva'
import { registerAV, type AVContext } from './ancillaryVisualizations'

/**
 * Typography Guidelines Visualization
 * 
 * Draws horizontal dotted lines to help align text elements for typography work.
 * Each line represents a standard typography guideline at a specific position
 * relative to the element's bounding box.
 * 
 * Supported metadata fields (all values should be fractions from 0.0 to 1.0):
 * 
 * - baseline (0.0-1.0): The baseline where most letters sit (typically 0.8-0.9)
 * - lowLine (0.0-1.0): Bottom line for lowercase letters without descenders (typically 0.7-0.8)  
 * - midLine (0.0-1.0): Middle line for lowercase letters like 'x' height (typically 0.4-0.6)
 * - capHeight (0.0-1.0): Top line for capital letters (typically 0.1-0.3)
 * - ascender (0.0-1.0): Top line for letters with ascenders like 'h', 'k' (typically 0.0-0.2)
 * - descender (0.0-1.0): Bottom line for letters with descenders like 'g', 'y' (typically 0.9-1.0)
 * 
 * Visual rendering:
 * - Each guideline appears as a horizontal dotted line spanning the full width of the element
 * - Different colors for different guidelines: baseline (dark gray), lowLine (gray), 
 *   midLine (orange), capHeight (green), ascender (blue), descender (red)
 * - Lines update in real-time when the element is moved, scaled, or metadata changes
 * 
 * Example metadata:
 * {
 *   "baseline": 0.85,
 *   "midLine": 0.5,
 *   "capHeight": 0.15,
 *   "descender": 1.0
 * }
 */

// Register the typography guidelines visualization
registerAV({
  key: 'typo-guides',
  displayName: 'Typography Guidelines',
  validate: ({metadata}) =>
    ['lowLine', 'midLine', 'capHeight', 'ascender', 'descender', 'baseline']
      .some(k => k in metadata && typeof metadata[k] === 'number'),
  create: ctx => createOrUpdateGuides(ctx),
  update: (ctx, existing) => createOrUpdateGuides(ctx, existing as Konva.Line[])
})

function createOrUpdateGuides({bbox, metadata}: AVContext, existing?: Konva.Line[]): Konva.Line[] {
  const dashed = [4, 4]
  
  const guidelines = [
    { key: 'baseline', fraction: metadata.baseline, color: '#333' },
    { key: 'lowLine', fraction: metadata.lowLine, color: '#888' },
    { key: 'midLine', fraction: metadata.midLine, color: '#0a0' },
    { key: 'capHeight', fraction: metadata.capHeight, color: '#f80' },
    { key: 'ascender', fraction: metadata.ascender, color: '#00f' },
    { key: 'descender', fraction: metadata.descender, color: '#f00' }
  ].filter(guide => 
    guide.fraction !== undefined && 
    typeof guide.fraction === 'number' &&
    guide.fraction >= 0 && 
    guide.fraction <= 1
  )

  const newLines = guidelines.map(guide => {
    const y = bbox.y + bbox.height * guide.fraction
    return new Konva.Line({
      points: [bbox.x, y, bbox.x + bbox.width, y],
      stroke: guide.color,
      strokeWidth: 5,
      dash: dashed,
      listening: false,
      name: `typo-guide-${guide.key}`
    })
  })

  if (existing) {
    // Update existing lines
    existing.forEach((line, i) => {
      if (i < newLines.length) {
        const newLine = newLines[i]
        line.points(newLine.points())
        line.stroke(newLine.stroke())
      }
    })
    
    // Remove extra lines if we have fewer now
    if (existing.length > newLines.length) {
      existing.slice(newLines.length).forEach(line => line.destroy())
      existing.splice(newLines.length)
    }
    
    // Add new lines if we have more now
    if (newLines.length > existing.length) {
      existing.push(...newLines.slice(existing.length))
    }
    
    return existing
  }

  return newLines
}
