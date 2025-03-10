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

const mod2 = (n: number, m: number) => (n % m + m) % m
const lerp = (a: Point, b: Point, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
})

export class TreeShape2 {
  //todo - for now points are explicit, and not relative coordinates to the parent
  /*points represent a closed shape (e.g., last point automatically connected to the first),
  but which shape is the "start" point can be changed at render time depending on folding logic*/
  points: {point: Point, child?: TreeShape2}[] //points of the shape, and potentially a child at that point
  id: string
  foldProgress: number = 0 //how folded the child is into it's parent, range 0-1
  parentPointIndex?: number // For child shapes, this indicates which parent point it's associated with
  parent?: TreeShape2 //the parent shape

  constructor(points: Point[], parent?: TreeShape2, parentPointIndex?: number) {
    this.points = points.map(p => ({point: p, child: undefined}))
    this.parentPointIndex = parentPointIndex
    this.parent = parent
  }

  drawFunc?: (points: Point[]) => void


  getFlattenedPoints(depth: number): Point[] {
    //an inorder traversal of the tree to get points of leaf nodes

    const children = this.points.map(p => p.child).filter(c => c)

    //if the shape has no children, return the points
    if (children.length === 0 || depth === 0) {
      return this.points.map(p => p.point)
    }
  
    return children.map(c => c.getFlattenedPoints(depth - 1)).flat()    
  }

  baseFold(depth: number, amount: number) {
    //identify closest point to the parent point (pivot point) (and rotate shape duplicated point accordingly?)

    const points = this.getFlattenedPoints(depth) //for now, ignore selecting pivot or optimal lerp mapping

    //create mapping of parent target points
    const parentPrevPoint = this.parent!.points[mod2(this.parent!.parentPointIndex! - 1, this.parent!.points.length)].point
    const parentPoint = this.parent!.points[this.parent!.parentPointIndex!].point
    const parentNextPoint = this.parent!.points[mod2(this.parent!.parentPointIndex! + 1, this.parent!.points.length)].point
    const halfToNext = lerp(parentPoint, parentNextPoint, 0.5)
    const halfToPrev = lerp(parentPoint, parentPrevPoint, 0.5)

    const parentIndex = Math.floor(points.length / 2)
    const numBefore = parentIndex
    const numAfter = points.length - (parentIndex + 1)

    //todo check indexing off by 1
    const pointsBefore = Array.from({length: numBefore}, (_, i) => lerp(halfToPrev, parentPoint, (i + 1) / numBefore))
    const pointsAfter = Array.from({length: numAfter}, (_, i) => lerp(parentPoint, halfToNext, (i + 1) / numAfter))

    const targetPoints = [...pointsBefore, parentPoint, ...pointsAfter]

    const lerpedPoints = points.map((p, i) => lerp(p, targetPoints[i], amount))
    //lerp points towards the parent target points
  }

  parentDrivenFold(amount: number, parentFoldProgPoints: Point[]) {
    //like base fold but use the parentFoldProgPoints to determine the target points
  }

  //todo - figure out how to propogate a multi-level fold down the tree
  //     - thought - multi-level folding is just how many layers to flatten into the lerp.
  //     - client is responsible for making sure layers are folded in the correct order.
  //     - question - do you pick pivot point from shape points only or also children?
  //       - potential anwser - mapping of source to target points is modular and can have different strategies?
  //todo - figure out how to save state for folds



  /**
   * Create a square TreeShape
   */
  static createSquare(x: number, y: number, size: number): TreeShape2 {
    const halfSize = size / 2
    return new TreeShape2([
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
  static createCircle(x: number, y: number, radius: number, numPoints: number = 16): TreeShape2 {
    const points: Point[] = []
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2
      points.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius
      })
    }
    return new TreeShape2(points)
  }
}