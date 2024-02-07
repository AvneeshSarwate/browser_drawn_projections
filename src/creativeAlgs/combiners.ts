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

const stuff = {
  nums: [1, 2, 3],
  letters: ['a', 'b', 'c', 'd']
}

const z = new Zipper(stuff)
const out10 = z.nextN(10)
console.log(out10)




