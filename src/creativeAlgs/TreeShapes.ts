import p5 from "p5"

/*
base case - get 3 layers of square working properly with just outline drawing, 
but handle all folding edge cases

need to think of 2 different operations 
"shape folding" - which is the oulines of children unfolding to the parent
"point consolidating" - which is all the points of the children then lerping back 
  and deduplicating so the parent as the original number of points again

point-consolidating could be optional?
can point consolidation be lerped at the same time as shape-folding?
  or does it have to happen after?
*/

type Point = {
  x: number
  y: number
}

export type FoldMode = 'outline' | 'shrink' | 'segment'

class TreeShape {
  points: Point[]
  foldLerpPoints: Point[]
  isFolding = false
  children: TreeShape[]
  id: string
  foldProgress: number = 0
  isVisible: boolean = true
  foldMode: FoldMode = 'outline'
  parentPointIndex?: number // For child shapes, this indicates which parent point it's associated with

  //for tracking changes and optimizing spline calculations - 
  //partiularly - don't need to recalculate spline if base points haven't changed
  version = 0

  constructor(points: Point[]) {
    this.points = points.map(p => ({x: p.x, y: p.y}))
    this.foldLerpPoints = [...this.points]
    this.children = []
    this.id = crypto.randomUUID()
  }

  drawFunc?: (points: Point[]) => void

  draw() {
    if (this.drawFunc && this.isVisible) {
      this.drawFunc(this.isFolding ? this.foldLerpPoints : this.points)
      
      // Draw children if not folding or partially folding
      if (!this.isFolding || this.foldProgress < 1) {
        this.children.forEach(child => child.draw())
      }
    }
  }

  setPoints(points: Point[]) {
    this.points = points.map(p => ({x: p.x, y: p.y}))
    this.foldLerpPoints = [...this.points]
    this.version++
  }

  addChild(child: TreeShape, parentPointIndex?: number) {
    this.children.push(child)
    if (parentPointIndex !== undefined) {
      child.parentPointIndex = parentPointIndex
    }
    return child
  }

  removeChild(childId: string) {
    const index = this.children.findIndex(child => child.id === childId)
    if (index !== -1) {
      this.children.splice(index, 1)
      return true
    }
    return false
  }

  rotatePoints(offset: number) {
    if (offset === 0 || this.points.length <= 1) return
    
    const normalizedOffset = ((offset % this.points.length) + this.points.length) % this.points.length
    const newPoints = [
      ...this.points.slice(normalizedOffset),
      ...this.points.slice(0, normalizedOffset)
    ]
    
    this.setPoints(newPoints)
  }

  /**
   * Positions a child shape so one of its points is on the parent point
   * and the rest of the shape is "inside" relative to the parent
   */
  positionChildInsideParent(child: TreeShape, childPointIndex: number, parentPointIndex: number) {
    if (!this.points[parentPointIndex] || !child.points[childPointIndex]) {
      console.error("Invalid point indices for positioning child")
      return
    }

    // Get offset needed to move child's point to parent point
    const offsetX = this.points[parentPointIndex].x - child.points[childPointIndex].x
    const offsetY = this.points[parentPointIndex].y - child.points[childPointIndex].y
    
    // Move all child points by this offset
    const newChildPoints = child.points.map(p => ({
      x: p.x + offsetX,
      y: p.y + offsetY
    }))
    
    child.setPoints(newChildPoints)
    child.parentPointIndex = parentPointIndex
  }

  /**
   * Begin folding children into this shape
   * @param depth How many layers down to fold (1 = just direct children)
   */
  startFold(depth: number = 1) {
    if (this.children.length === 0) return
    
    this.isFolding = true
    this.foldProgress = 0
    
    // Initialize fold lerp points
    this.prepareFoldLerpPoints(depth)
  }

  /**
   * Set up the points for folding animation
   */
  private prepareFoldLerpPoints(depth: number) {
    // Get all points from children that need to be folded
    const allChildPoints = this.collectChildPoints(depth)
    
    // Initialize folding points to current points
    this.foldLerpPoints = [...this.points]
    
    // For each child, set its folding state too if needed
    if (depth > 1) {
      this.children.forEach(child => {
        child.startFold(depth - 1)
      })
    }
  }

  /**
   * Collect points from children for folding
   */
  private collectChildPoints(depth: number): Point[] {
    let points: Point[] = []
    
    this.children.forEach(child => {
      points = points.concat(child.points)
      
      if (depth > 1) {
        points = points.concat(child.collectChildPoints(depth - 1))
      }
    })
    
    return points
  }

  /**
   * Update the folding animation
   * @param amount Progress to add (0-1)
   * @returns true if folding is complete
   */
  updateFold(amount: number): boolean {
    if (!this.isFolding) return false
    
    this.foldProgress = Math.min(1, this.foldProgress + amount)
    
    // Update fold lerp points based on fold mode
    this.updateFoldLerpPoints()
    
    // Update children folding
    this.children.forEach(child => {
      child.updateFold(amount)
    })
    
    const complete = this.foldProgress >= 1
    
    // If folding is complete, finish the fold
    if (complete) {
      this.finishFold()
    }
    
    return complete
  }

  /**
   * Update the folding animation points based on fold mode
   */
  private updateFoldLerpPoints() {
    if (!this.isFolding) return
    
    const t = this.foldProgress
    
    switch (this.foldMode) {
      case 'outline':
        this.updateOutlineFold(t)
        break
      case 'shrink':
        this.updateShrinkFold(t)
        break
      case 'segment':
        this.updateSegmentFold(t)
        break
    }
  }

  /**
   * Update points for outline fold mode
   */
  private updateOutlineFold(t: number) {
    this.children.forEach(child => {
      if (child.parentPointIndex === undefined) return
      
      // Map child points to parent outline segments
      const numParentPoints = this.points.length
      const parentIndex = child.parentPointIndex
      
      // For each child point, calculate its position along parent outline
      child.foldLerpPoints.forEach((childPoint, i) => {
        // Calculate position along parent outline
        const childProgress = i / child.points.length
        
        // Distribute child points along parent outline starting from parentIndex
        const parentSegmentPos = (parentIndex + childProgress) % numParentPoints
        const parentSegmentIndex = Math.floor(parentSegmentPos)
        const parentSegmentT = parentSegmentPos - parentSegmentIndex
        
        const nextParentIndex = (parentSegmentIndex + 1) % numParentPoints
        
        // Lerp between parent points
        const px1 = this.points[parentSegmentIndex].x
        const py1 = this.points[parentSegmentIndex].y
        const px2 = this.points[nextParentIndex].x
        const py2 = this.points[nextParentIndex].y
        
        // Original child point
        const originalX = child.points[i].x
        const originalY = child.points[i].y
        
        // Position on parent outline
        const outlineX = px1 + (px2 - px1) * parentSegmentT
        const outlineY = py1 + (py2 - py1) * parentSegmentT
        
        // Lerp between original and outline position
        childPoint.x = originalX + (outlineX - originalX) * t
        childPoint.y = originalY + (outlineY - originalY) * t
      })
    })
  }

  /**
   * Update points for shrink fold mode
   */
  private updateShrinkFold(t: number) {
    this.children.forEach(child => {
      if (child.parentPointIndex === undefined) return
      
      // Get parent point where this child should shrink to
      const parentPoint = this.points[child.parentPointIndex]
      
      // Shrink all child points toward parent point
      child.foldLerpPoints.forEach((childPoint, i) => {
        const originalX = child.points[i].x
        const originalY = child.points[i].y
        
        childPoint.x = originalX + (parentPoint.x - originalX) * t
        childPoint.y = originalY + (parentPoint.y - originalY) * t
      })
    })
  }

  /**
   * Update points for segment fold mode
   */
  private updateSegmentFold(t: number) {
    this.children.forEach(child => {
      if (child.parentPointIndex === undefined) return
      
      // Get parent point and adjacent points
      const parentIndex = child.parentPointIndex
      const numParentPoints = this.points.length
      
      const prevIndex = (parentIndex - 1 + numParentPoints) % numParentPoints
      const nextIndex = (parentIndex + 1) % numParentPoints
      
      const prevPoint = this.points[prevIndex]
      const parentPoint = this.points[parentIndex]
      const nextPoint = this.points[nextIndex]
      
      // Map child points to segments on either side of parent point
      child.foldLerpPoints.forEach((childPoint, i) => {
        const originalX = child.points[i].x
        const originalY = child.points[i].y
        
        // Determine if point should map to prev or next segment
        const childProgress = i / (child.points.length - 1)
        
        let targetX: number, targetY: number
        
        if (childProgress <= 0.5) {
          // Map to previous segment
          const segmentT = childProgress * 2
          targetX = prevPoint.x + (parentPoint.x - prevPoint.x) * segmentT
          targetY = prevPoint.y + (parentPoint.y - prevPoint.y) * segmentT
        } else {
          // Map to next segment
          const segmentT = (childProgress - 0.5) * 2
          targetX = parentPoint.x + (nextPoint.x - parentPoint.x) * segmentT
          targetY = parentPoint.y + (nextPoint.y - parentPoint.y) * segmentT
        }
        
        // Lerp between original and target position
        childPoint.x = originalX + (targetX - originalX) * t
        childPoint.y = originalY + (targetY - originalY) * t
      })
    })
  }

  /**
   * Finish the folding process
   */
  private finishFold() {
    this.isFolding = false
    this.foldProgress = 0
    
    // Additional cleanup or state changes after fold completes
  }

  /**
   * Save the current fold state by committing folded points
   */
  saveFold() {
    if (!this.isFolding && this.foldProgress < 1) return
    
    // Commit the folded state
    this.isFolding = false
    this.foldProgress = 0
    
    // Any additional cleanup needed
  }

  /**
   * Reverse a fold operation that's in progress
   */
  reverseFold() {
    if (!this.isFolding) return
    
    // Reverse fold progress
    this.foldProgress = 1 - this.foldProgress
    this.updateFoldLerpPoints()
    
    // Also reverse for children
    this.children.forEach(child => {
      child.reverseFold()
    })
  }

  /**
   * Create a square TreeShape
   */
  static createSquare(x: number, y: number, size: number): TreeShape {
    const halfSize = size / 2
    return new TreeShape([
      { x: x - halfSize, y: y - halfSize },
      { x: x + halfSize, y: y - halfSize },
      { x: x + halfSize, y: y + halfSize },
      { x: x - halfSize, y: y + halfSize },
      { x: x - halfSize, y: y - halfSize } // Close the shape
    ])
  }

  /**
   * Create a circle TreeShape (approximated with points)
   */
  static createCircle(x: number, y: number, radius: number, numPoints: number = 16): TreeShape {
    const points: Point[] = []
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2
      points.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius
      })
    }
    return new TreeShape(points)
  }

  /**
   * Create a rectangular grid of child shapes
   */
  static createHierarchicalGrid(
    parentShape: TreeShape, 
    rows: number, 
    cols: number, 
    childGenerator: (row: number, col: number) => TreeShape,
    positionInside: boolean = true
  ): TreeShape {
    // Create children and add them to parent
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const child = childGenerator(r, c)
        parentShape.addChild(child)
        
        if (positionInside) {
          // Position child inside parent based on grid position
          const parentPointIndex = r * cols + c
          if (parentPointIndex < parentShape.points.length) {
            parentShape.positionChildInsideParent(child, 0, parentPointIndex)
          }
        }
      }
    }
    
    return parentShape
  }
}

export { TreeShape, type Point }