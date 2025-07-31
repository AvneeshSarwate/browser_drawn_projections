interface PriorityQueueItem<T> {
  id: string;
  deadline: number;
  metadata: T;
}

export class PriorityQueue<T> {
  private heap: PriorityQueueItem<T>[] = [];
  private idToIndex = new Map<string, number>();

  add(id: string, deadline: number, metadata: T): void {
    if (this.idToIndex.has(id)) {
      console.warn(`Item with id "${id}" already exists in queue`);
      return;
    }

    const item: PriorityQueueItem<T> = { id, deadline, metadata };
    this.heap.push(item);
    const index = this.heap.length - 1;
    this.idToIndex.set(id, index);
    this.heapifyUp(index);
  }

  peek(): PriorityQueueItem<T> | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  pop(): PriorityQueueItem<T> | null {
    if (this.heap.length === 0) return null;

    const result = this.heap[0];
    this.idToIndex.delete(result.id);

    if (this.heap.length === 1) {
      this.heap.pop();
      return result;
    }

    const lastItem = this.heap.pop()!;
    this.heap[0] = lastItem;
    this.idToIndex.set(lastItem.id, 0);
    this.heapifyDown(0);

    return result;
  }

  remove(id: string): boolean {
    const index = this.idToIndex.get(id);
    if (index === undefined) {
      console.warn(`Item with id "${id}" not found in queue`);
      return false;
    }

    this.idToIndex.delete(id);

    if (index === this.heap.length - 1) {
      this.heap.pop();
      return true;
    }

    const lastItem = this.heap.pop()!;
    this.heap[index] = lastItem;
    this.idToIndex.set(lastItem.id, index);

    const parentIndex = Math.floor((index - 1) / 2);
    if (index > 0 && this.heap[index].deadline < this.heap[parentIndex].deadline) {
      this.heapifyUp(index);
    } else {
      this.heapifyDown(index);
    }

    return true;
  }

  adjustDeadline(id: string, newDeadline: number): boolean {
    const index = this.idToIndex.get(id);
    if (index === undefined) {
      console.warn(`Item with id "${id}" not found in queue`);
      return false;
    }

    const oldDeadline = this.heap[index].deadline;
    this.heap[index].deadline = newDeadline;

    if (newDeadline < oldDeadline) {
      this.heapifyUp(index);
    } else if (newDeadline > oldDeadline) {
      this.heapifyDown(index);
    }

    return true;
  }

  getData(id: string): T | null {
    const index = this.idToIndex.get(id);
    if (index === undefined) {
      console.warn(`Item with id "${id}" not found in queue`);
      return null;
    }
    return this.heap[index].metadata;
  }

  size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].deadline >= this.heap[parentIndex].deadline) break;

      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private heapifyDown(index: number): void {
    while (true) {
      let smallest = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < this.heap.length && 
          this.heap[leftChild].deadline < this.heap[smallest].deadline) {
        smallest = leftChild;
      }

      if (rightChild < this.heap.length && 
          this.heap[rightChild].deadline < this.heap[smallest].deadline) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.idToIndex.set(this.heap[i].id, i);
    this.idToIndex.set(this.heap[j].id, j);
  }
}
