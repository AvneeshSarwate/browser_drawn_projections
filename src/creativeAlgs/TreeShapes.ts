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

class TreeShape {
  points: Point[]
  foldLerpPoints: Point[]
  isFolding = false
  children: TreeShape[]
  id: string

  //for tracking changes and optimizing spline calculations - 
  //partiularly - don't need to recalculate spline if base points haven't changed
  version = 0

  constructor(points: Point[]) {
    this.points = points.map(p => ({x: p.x, y: p.y}))
    this.foldLerpPoints = []
    this.children = []
    this.id = crypto.randomUUID()
  }

  drawFunc?: (points: Point[]) => void

  draw() {
    if(this.drawFunc) {
      this.drawFunc(this.isFolding ? this.foldLerpPoints : this.points)
    }
  }

  setPoints(points: Point[]) {
    this.points = points
    this.version++
  }
}