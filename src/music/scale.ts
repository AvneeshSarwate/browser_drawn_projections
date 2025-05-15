function integerDivision(dividend: number, divisor: number): number {
  const result = dividend / divisor
  return result >= 0 ? Math.floor(result) : Math.ceil(result)
}

function mod2(n: number, m: number): number {
  return ((n % m) + m) % m
}

export class Scale {
  private degrees: number[] = [0, 2, 4, 5, 7, 9, 11, 12]
  private root: number = 60

  constructor(notes?: number[], root?: number) {
    if (notes) {
      const minNote = Math.min(...notes)
      const normedNotes = notes.sort((a, b) => a - b).map((n) => n - minNote)
      this.degrees = normedNotes
    }
    if (root !== undefined) {
      this.root = root
    }
  }

  cycleUp(): Scale {
    const newScale = new Scale([], this.root)
    const deltas = this.deltas()
    const firstDelta = deltas.shift()
    if (firstDelta !== undefined) {
      deltas.push(firstDelta)
    }
    let runningNote = 0
    const newNotes = [runningNote]
    deltas.forEach((delta) => {
      runningNote += delta
      newNotes.push(runningNote)
    })
    newScale.setDegrees(newNotes)
    return newScale
  }

  cycleDown(): Scale {
    const newScale = new Scale([], this.root)
    const deltas = this.deltas()
    const lastDelta = deltas.pop()
    if (lastDelta !== undefined) {
      deltas.unshift(lastDelta)
    }
    let runningNote = 0
    const newNotes = [runningNote]
    deltas.forEach((delta) => {
      runningNote += delta
      newNotes.push(runningNote)
    })
    newScale.setDegrees(newNotes)
    return newScale
  }

  cycle(n: number): Scale {
    let newScale = new Scale(this.degrees.slice(), this.root)

    if (n === 0) return newScale

    for (let i = 0; i < Math.abs(n); i++) {
      newScale = n > 0 ? newScale.cycleUp() : newScale.cycleDown()
    }
    return newScale
  }

  invertUp(): Scale {
    const newScale = new Scale()
    newScale.setRoot(this.getByIndex(1))
    newScale.setDegrees(this.cycleUp().getDegrees())
    return newScale
  }

  invertDown(): Scale {
    const newScale = new Scale()
    newScale.setRoot(this.getByIndex(-1))
    newScale.setDegrees(this.cycleDown().getDegrees())
    return newScale
  }

  invert(n: number): Scale {
    let newScale = new Scale(this.degrees.slice(), this.root)

    if (n === 0) return newScale

    for (let i = 0; i < Math.abs(n); i++) {
      newScale = n > 0 ? newScale.invertUp() : newScale.invertDown()
    }
    return newScale
  }

  deltas(): number[] {
    const deltas: number[] = []
    for (let i = 1; i < this.degrees.length; i++) {
      deltas.push(this.degrees[i] - this.degrees[i - 1])
    }
    return deltas
  }

  getByIndex(index: number | string): number {
    if (typeof index === 'string') {
      if (index.includes("+")) {
        const [base, delta] = index.split("+")
        const intBase = parseInt(base)
        const intDelta = parseInt(delta)
        if (isNaN(intBase) || isNaN(intDelta)) {
          throw new Error(`Invalid index: ${index}`)
        }
        return this.getByIndex(intBase) + intDelta
      } else {
        const intIndex = parseInt(index)
        if (isNaN(intIndex)) {
          throw new Error(`Invalid index: ${index}`)
        }
        return this.root + intIndex
      }
    } else {
      if (index === 0) return this.root
      if (index > 0) {
        const numOctaves = integerDivision(index, this.degrees.length - 1)
        const octaveShift = this.degrees[this.degrees.length - 1] * numOctaves
        const degree = this.degrees[index % (this.degrees.length - 1)]
        return this.root + octaveShift + degree
      } else {
        const negDeltas = this.deltas().reverse()
        const negNotes = [0]
        let runningNote = 0
        negDeltas.forEach((delta) => {
          runningNote += delta
          negNotes.push(runningNote)
        })

        const numOctaves = integerDivision(index, this.degrees.length - 1)
        const octaveShift = this.degrees[this.degrees.length - 1] * numOctaves
        const degree = -negNotes[Math.abs(index) % (negNotes.length - 1)]
        return this.root + octaveShift + degree
      }
    }
  }

  getShapeFromInd(rootInd: number, shape: number[]): number[] {
    return shape.map((degree) => this.getByIndex(rootInd + degree))
  }

  getIndFromPitch(pitch: number): number {
    const rootDist = pitch - this.root
    const chroma = mod2(rootDist, Math.max(...this.degrees))

    let chromaDegree = this.degrees.includes(chroma) ? this.degrees.indexOf(chroma) : -1

    //if note not in scale, chroma is a fraction where the fractional part represents lerp between 2 closest notes
    if (chromaDegree === -1) {
      const chromaticDegree = mod2(pitch - this.root, this.degrees[this.degrees.length - 1])
      const octaveBelow = pitch - chromaticDegree
      const pitches = this.degrees.map(d => octaveBelow + d)
      const noteBelow = Math.max(...pitches.filter(p => p < pitch))
      const noteAbove = pitches.find(p => p > pitch)
      const indFrac = (pitch - noteBelow) / (noteAbove - noteBelow)
      const lowerChroma = pitches.findIndex(d => d === noteBelow)
      chromaDegree = lowerChroma + indFrac
    }
    const octaveWidth = this.degrees[this.degrees.length - 1]
    const octaveInd = Math.floor((pitch - this.root) / octaveWidth)
    const ind = octaveInd * (this.degrees.length - 1) + chromaDegree

    return ind
  }

  getMultiple(indices: (number | string)[]): number[] {
    return indices.map((index) => this.getByIndex(index))
  }

  setDegrees(degrees: number[]): void {
    this.degrees = degrees
  }

  getDegrees(): number[] {
    return this.degrees
  }

  setRoot(root: number): void {
    this.root = root
  }
}
