type CombinerInput<T> = {
  [K in keyof T]: T[K][];
};

type CombinerOutput<T> = {
  [K in keyof T]: T[K];
};

abstract class FiniteCombiner<T> {
  protected lists: CombinerInput<T>;
  protected indexes: { [K in keyof T]?: number };

  constructor(lists: CombinerInput<T>) {
    this.lists = lists;
    this.indexes = {};
    this.resetIndices();
  }

  abstract updateIndices(): void;
  abstract directIndices(n: number): { [K in keyof T]?: number };

  next(): CombinerOutput<T> {
    const output: Partial<CombinerOutput<T>> = {};
    for (const key in this.lists) {
      const index = this.indexes[key] ?? 0;
      output[key] = this.lists[key][index];
    }
    this.updateIndices();
    return output as CombinerOutput<T>;
  }

  nextN(n: number): CombinerOutput<T>[] {
    const output: CombinerOutput<T>[] = [];
    for (let i = 0; i < n; i++) {
      output.push(this.next());
    }
    return output;
  }

  resetIndices(): void {
    for (const key in this.lists) {
      this.indexes[key] = 0;
    }
  }

  directGet(n: number): CombinerOutput<T> {
    const indices = this.directIndices(n);
    const output: Partial<CombinerOutput<T>> = {};
    for (const key in indices) {
      const index = indices[key];
      if (index !== undefined && this.lists[key] !== undefined) {
        output[key] = this.lists[key][index];
      }
    }
    return output as CombinerOutput<T>;
  }
}


class Zipper<T> extends FiniteCombiner<T> {
  constructor(lists: CombinerInput<T>) {
    super(lists);
  }

  updateIndices(): void {
    for (const key in this.lists) {
      if (this.indexes[key] !== undefined) {
        this.indexes[key] = ((this.indexes[key] ?? 0) + 1) % this.lists[key].length;
      }
    }
  }

  directIndices(n: number): { [K in keyof T]?: number } {
    const indices: Partial<{ [K in keyof T]?: number }> = {};
    for (const key in this.lists) {
      indices[key] = n % this.lists[key].length;
    }
    return indices as { [K in keyof T]?: number };
  }
}

class RootLooper<T> extends FiniteCombiner<T> {
  constructor(lists: CombinerInput<T>) {
    super(lists);
  }

  updateIndices(): void {
    const keys = Object.keys(this.lists) as Array<keyof T>;

    keys.forEach((key, ind) => {
      const list = this.lists[key];
      const nextInd = (this.indexes[key] ?? 0) + 1;
      const modCondition =
        (this.indexes[keys[0]] === 0 && ind !== 0) || nextInd === list.length;

      this.indexes[key] = modCondition ? 0 : nextInd;
    });
  }

  directIndices(n: number): { [K in keyof T]?: number } {
    const firstListSize = this.lists[Object.keys(this.lists)[0]].length;
    const indices: Partial<{ [K in keyof T]?: number }> = {};

    for (const key in this.lists) {
      indices[key] = (n % firstListSize) % this.lists[key].length;
    }

    return indices as { [K in keyof T]?: number };
  }
}

class Nester<T> extends FiniteCombiner<T> {
  constructor(lists: CombinerInput<T>) {
    super(lists);
  }

  directIndices(n: number): { [K in keyof T]?: number } {
    const inOutLengths = Object.keys(this.lists).map(key => this.lists[key].length);
    const numToIncrement: number[] = [inOutLengths[0]];

    for (let i = 1; i < inOutLengths.length; i++) {
      numToIncrement.push(inOutLengths[i] * numToIncrement[i - 1]);
    }

    const directIndices = inOutLengths.map((_, index) => {
      if (index === 0) {
        return n % numToIncrement[0];
      } else {
        return Math.floor((n % numToIncrement[index]) / numToIncrement[index - 1]);
      }
    });

    const indices: Partial<{ [K in keyof T]?: number }> = {};
    Object.keys(this.lists).forEach((key, index) => {
      indices[key as keyof T] = directIndices[index];
    });

    return indices as { [K in keyof T]?: number };
  }

  updateIndices(): void {
    let nextIndexNeedsUpdate = true;
    Object.keys(this.lists).forEach(key => {
      if (nextIndexNeedsUpdate) {
        const lastVal = this.indexes[key] ?? 0;
        this.indexes[key] = ((this.indexes[key] ?? 0) + 1) % this.lists[key].length;
        nextIndexNeedsUpdate = lastVal > (this.indexes[key] ?? 0);
      }
    });
  }
}



const stuff = {
  nums: [1, 2, 3],
  letters: ['a', 'b', 'c', 'd']
}

const z = new Zipper(stuff)
const out10 = z.nextN(10)
console.log(out10)




