/* eslint-disable no-case-declarations */
class VariationNode<T> {
  value: T
  children: VariationNode<T>[]
  childrenByTransform: Map<string, VariationNode<T>[]>
  parent: VariationNode<T> | null
  transformKey: string

  constructor(value: T, parent: VariationNode<T> | null = null, transformKey: string = '') {
    this.value = value
    this.parent = parent
    this.transformKey = transformKey
    this.children = []
    this.childrenByTransform = new Map<string, VariationNode<T>[]>()
  }
}

class VariationTree<T> {
  root: VariationNode<T>
  currentNode: VariationNode<T>
  defaultTransform: (value: T) => T
  transformMap: Map<string, (value: T) => T>
  bookmarkedNodes: Map<string, VariationNode<T>>

  constructor(rootVal: T, defaultTransform: (value: T) => T = (t: T) => t) {
    this.root = new VariationNode<T>(rootVal)
    this.currentNode = this.root
    this.defaultTransform = defaultTransform
    this.transformMap = new Map<string, (value: T) => T>()
    this.bookmarkedNodes = new Map<string, VariationNode<T>>()
  }

  moveUp() {
    if (this.currentNode.parent !== null) {
      this.currentNode = this.currentNode.parent
    }
  }

  siblings(transformKey: string = ''): VariationNode<T>[] {
    return this.currentNode.parent?.children ?? []
  }

  numSiblings(): number {
    return this.currentNode.parent?.children.length ?? 0
  }

  siblingsByTransform(transformKey: string): VariationNode<T>[] | null {
    return this.currentNode.parent?.childrenByTransform.get(transformKey) ?? []
  }

  numSibsByTransform(transformKey: string): number {
    if (this.currentNode === this.root) return 0
    const usedKey = this.currentNode.parent?.childrenByTransform.has(transformKey)
      ? transformKey
      : ''
    return usedKey === '' ? this.siblings().length : this.siblingsByTransform(usedKey)?.length ?? 0
  }

  actualKey(transformKey: string): string {
    return this.currentNode.childrenByTransform.has(transformKey) ? transformKey : ''
  }

  numChildrenByTransform(transformKey: string): number {
    const usedKey = this.actualKey(transformKey)
    return usedKey === ''
      ? this.currentNode.children.length
      : this.currentNode.childrenByTransform.get(usedKey)?.length ?? 0
  }

  siblingIndex(): number {
    return this.currentNode.parent?.children.indexOf(this.currentNode) ?? 0
  }

  sibIndexByTransform(transformKey: string): number {
    if (this.currentNode === this.root) return 0
    const usedKey = this.actualKey(transformKey)
    return usedKey === ''
      ? this.siblingIndex()
      : this.siblingsByTransform(this.currentNode.transformKey)?.indexOf(this.currentNode) ?? 0
  }

  makeChild(transformKey: string) {
    const varFunc = this.transformMap.get(transformKey) ?? this.defaultTransform
    const usedKey = this.transformMap.has(transformKey) ? transformKey : 'default'
    const newVal = varFunc(this.currentNode.value)
    const newNode = new VariationNode(newVal, this.currentNode, transformKey)

    this.currentNode.children.push(newNode)

    if (!this.currentNode.childrenByTransform.has(usedKey)) {
      this.currentNode.childrenByTransform.set(usedKey, [])
    }
    this.currentNode.childrenByTransform.get(usedKey)?.push(newNode)

    this.currentNode = newNode
  }

  makeSibling(transformKey: string) {
    const varFunc = this.transformMap.get(transformKey) ?? this.defaultTransform
    const usedKey = this.transformMap.has(transformKey) ? transformKey : 'default'
    if (this.currentNode === this.root) {
      this.makeChild(transformKey)
    } else {
      const newVal = varFunc(this.currentNode.parent!.value)
      const newNode = new VariationNode(newVal, this.currentNode.parent, usedKey)

      this.siblings().push(newNode)

      if (!this.currentNode.parent!.childrenByTransform.has(usedKey)) {
        this.currentNode.parent!.childrenByTransform.set(usedKey, [])
      }
      this.currentNode.parent!.childrenByTransform.get(usedKey)?.push(newNode)

      this.currentNode = newNode
    }
  }

  jumpToRandomChild(transformKey: string) {
    if (this.currentNode.children.length === 0) {
      this.makeChild(transformKey)
    } else {
      if (transformKey !== '' && this.numChildrenByTransform(transformKey) === 0) {
        this.makeChild(transformKey)
      } else {
        const usedKey = this.actualKey(transformKey)
        this.currentNode =
          usedKey === ''
            ? this.currentNode.children[
                Math.floor(Math.random() * this.currentNode.children.length)
              ]
            : this.currentNode.childrenByTransform.get(usedKey)![
                Math.floor(Math.random() * this.numChildrenByTransform(usedKey))
              ]
      }
    }
  }

  jumpToChild(transformKey: string, ind: number) {
    // Assuming mod2 function is defined similar to the Kotlin code
    const mod2 = (x: number, m: number) => ((x % m) + m) % m

    if (this.currentNode.children.length === 0) {
      this.makeChild(transformKey)
    } else {
      if (transformKey !== '' && this.numChildrenByTransform(transformKey) === 0) {
        this.makeChild(transformKey)
      } else {
        const usedKey = this.actualKey(transformKey)
        this.currentNode =
          usedKey === ''
            ? this.currentNode.children[mod2(ind, this.currentNode.children.length)]
            : this.currentNode.childrenByTransform.get(usedKey)![
                mod2(ind, this.numChildrenByTransform(usedKey))
              ]
      }
    }
  }

  jumpToRandSibling(transformKey: string) {
    if (this.currentNode === this.root) {
      this.jumpToRandomChild(transformKey)
    } else {
      if (transformKey !== '' && this.numSibsByTransform(transformKey) === 0) {
        this.makeSibling(transformKey)
      } else {
        const usedKey = this.currentNode.parent!.childrenByTransform.has(transformKey)
          ? transformKey
          : ''
        this.currentNode =
          usedKey === ''
            ? this.siblings()[Math.floor(Math.random() * this.siblings().length)]
            : this.siblingsByTransform(usedKey)![
                Math.floor(Math.random() * this.siblingsByTransform(usedKey)!.length)
              ]
      }
    }
  }

  jumpToSibling(transformKey: string, ind: number) {
    // Assuming mod2 function is defined as in jumpToChild
    const mod2 = (x: number, m: number) => ((x % m) + m) % m

    if (this.currentNode === this.root) {
      this.jumpToRandomChild(transformKey)
    } else {
      if (transformKey !== '' && this.numSibsByTransform(transformKey) === 0) {
        this.makeSibling(transformKey)
      } else {
        const usedKey = this.currentNode.parent!.childrenByTransform.has(transformKey)
          ? transformKey
          : ''
        this.currentNode =
          usedKey === ''
            ? this.siblings()[mod2(ind, this.numSiblings())]
            : this.siblingsByTransform(usedKey)![mod2(ind, this.numSibsByTransform(usedKey))]
      }
    }
  }

  moveInSiblingList(transformKey: string, amt: number) {
    // Assuming mod2 function is defined as in jumpToChild
    const mod2 = (x: number, m: number) => ((x % m) + m) % m

    if (this.currentNode === this.root) {
      this.jumpToRandomChild(transformKey)
    } else {
      const usedKey = this.currentNode.parent!.childrenByTransform.has(transformKey)
        ? transformKey
        : ''
      this.currentNode =
        usedKey === ''
          ? this.currentNode.parent!.children[mod2(this.siblingIndex() + amt, this.numSiblings())]
          : this.siblingsByTransform(usedKey)![
              mod2(this.sibIndexByTransform(usedKey) + amt, this.numSibsByTransform(usedKey))
            ]
    }
  }

  returnToRoot() {
    this.currentNode = this.root
  }

  jumpToNode(node: VariationNode<T>) {
    this.currentNode = node
  }

  get currentVal() {
    return this.currentNode.value
  }

  commandIsValid(command: string): boolean {
    // Assuming regexes are defined similarly to the Kotlin code
    const regexes = [
      /D(_[a-zA-Z0-9]+)?_([0-9]+|[rnl])/,
      /S(_[a-zA-Z0-9]+)?_((-?[0-9])+|[rnl])/,
      /M(_[a-zA-Z0-9]+)?_((-?[0-9])+|[rnl])/,
      /U(_[0-9]+)?/,
      /R/,
      /B_[a-zA-Z0-9]+/,
      /C_[a-zA-Z0-9]+/
    ]

    const matches = regexes.some((regex) => regex.test(command))
    if (!matches) throw new Error(`Transformation Tree Command String invalid: ${command}`)
    return true
  }

  commandStringExecute(command: string): VariationNode<T> | null {
    const commandParts = command.split('_')
    const commandBase = commandParts[0]
    const arg1 = commandParts.length > 1 ? commandParts[1] : ''
    const arg2 = commandParts.length > 2 ? commandParts[2] : ''

    const parseTransformAndIndex = (arg1: string, arg2: string): [string, string] => {
      const transformKey = arg1.match(/[a-zA-Z]/) ? arg1 : ''
      const indexStr = transformKey === '' ? arg1 : arg2
      return [transformKey, indexStr]
    }

    switch (commandBase) {
      case 'R':
        this.returnToRoot()
        break

      case 'U':
        const upIterations = arg1 === '' ? 1 : parseInt(arg1)
        for (let i = 0; i < upIterations; i++) {
          this.moveUp()
        }
        break

      case 'B':
        const bookmarkedNode = this.bookmarkedNodes.get(arg1)
        if (bookmarkedNode) {
          this.jumpToNode(bookmarkedNode)
        }
        break

      case 'C':
        this.bookmarkedNodes.set(arg1, this.currentNode)
        break

      case 'S':
        const [transformKeyS, indexStrS] = parseTransformAndIndex(arg1, arg2)
        switch (indexStrS) {
          case 'r':
            this.jumpToRandSibling(transformKeyS)
            break
          case 'n':
            this.makeSibling(transformKeyS)
            break
          case 'l':
            this.jumpToSibling(transformKeyS, this.numSibsByTransform(transformKeyS) - 1)
            break
          default:
            const indexS = indexStrS === '' ? 0 : parseInt(indexStrS)
            this.jumpToSibling(transformKeyS, indexS)
            break
        }
        break

      case 'M':
        const [transformKeyM, indexStrM] = parseTransformAndIndex(arg1, arg2)
        switch (indexStrM) {
          case 'r':
            this.jumpToRandSibling(transformKeyM)
            break
          case 'n':
            this.makeSibling(transformKeyM)
            break
          case 'l':
            this.jumpToSibling(transformKeyM, this.numSibsByTransform(transformKeyM) - 1)
            break
          default:
            const indexM = indexStrM === '' ? 1 : parseInt(indexStrM)
            this.moveInSiblingList(transformKeyM, indexM)
            break
        }
        break

      case 'D':
        const [transformKeyD, indexStrD] = parseTransformAndIndex(arg1, arg2)
        switch (indexStrD) {
          case 'r':
            this.jumpToRandomChild(transformKeyD)
            break
          case 'n':
            this.makeChild(transformKeyD)
            break
          case 'l':
            this.jumpToChild(transformKeyD, this.numSibsByTransform(transformKeyD) - 1)
            break
          default:
            const indexD = indexStrD === '' ? 0 : parseInt(indexStrD)
            this.jumpToChild(transformKeyD, indexD)
            break
        }
        break

      default:
        break
    }

    return commandBase === 'C' ? null : this.currentNode
  }

  run(commandString: string): VariationNode<T>[] {
    const commandList = commandString.split(/\s+/)
    commandList.forEach((command) => this.commandIsValid(command))
    return commandList
      .map((command) => this.commandStringExecute(command))
      .filter((node) => node !== null) as VariationNode<T>[]
  }
}

/* TODO api: tree language and tree goals more generally
      - Language is characters D U L R B for down up left right base(root-note)
      - Add "-" char for creation, and transform key after (e.g. D-split)
      - If no transform key is given (eg "D-") the default transform is used
      - for parsing simplicty, "B-transform" is invalid but will just be treated as B
      - (the above is not what is exactly wanted anymore)

      - important to be able to define repeatable paths thru a tree once you have
      - made a tree of a couple variations of depth

      - also important to be able to "traverse" based on transformations?
      - eg, you want to go down to an up-shifted variant, not a down-shifted variant
      - maybe traverse to children based on transform key and/or index

      - pre-generate a tree with enough variations and then only think about traversal during performance?
      - 3 transforms w 3 children per type per level -> 9^n for n levels

      - new DLS statements:
      - down_transformKey_index/rand/lastMade/createFlag         : D_key_[ 3,r,l,n]
      - sibling_transformKey_shiftAmt/rand/lastMade/createFlag   : S_key_[-2,r,l,n]
      - move_transformKey_shiftAmt/rand/lastMade/createFlag      : M_key_[-2,r,l,n]
      - up_numShift                                              : U_3
      - toRoot                                                   : R
      - save"bookmark" to node w save(name), recall w/           : C_name - DOES NOT PRODUCE OUTPUT NODE
      - recall bookmarked note w/                                : B_name
      - Move is just like Sibling, except dove is relative movement,
        and Sibling is direct index into list
      - idea is to save a bookmark, run a string, with creates, and then replace
        the createFlag with lastMade to be able to "replay" the sequence just created.
        have a tree method that does replacement (eg tree.replay())
      - omit transform key for moving to arbitrary child/sibling.
        create flag with no key uses default (or random?) transform

      - B_r1
        D_sparse_n D_rev_n
     */
