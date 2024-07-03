type Comparator<Key> = (a: Key, b: Key) => number;

enum Color {
  RED,
  BLACK,
}

class Node<Key, Value> {
  key: Key;
  value: Value;
  left: Node<Key, Value> | null = null;
  right: Node<Key, Value> | null = null;
  color: Color;
  size: number;

  constructor(key: Key, value: Value, color: Color, size: number) {
    this.key = key;
    this.value = value;
    this.color = color;
    this.size = size;
  }
}

export class RedBlackBST<Key, Value> {
  private root: Node<Key, Value> | null = null;
  private comparator: Comparator<Key>;

  constructor(comparator?: Comparator<Key>) {
    this.comparator = comparator || ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  private isRed(node: Node<Key, Value> | null): boolean {
    if (!node) return false;
    return node.color === Color.RED;
  }

  private _size(node: Node<Key, Value> | null): number {
    if (!node) return 0;
    return node.size;
  }

  public size(): number {
    return this._size(this.root);
  }

  public isEmpty(): boolean {
    return this.root === null;
  }

  public get(key: Key): Value | null {
    return this.getValue(this.root, key);
  }

  private getValue(node: Node<Key, Value> | null, key: Key): Value | null {
    while (node) {
      const cmp = this.comparator(key, node.key);
      if (cmp < 0) node = node.left;
      else if (cmp > 0) node = node.right;
      else return node.value;
    }
    return null;
  }

  public contains(key: Key): boolean {
    return this.get(key) !== null;
  }

  public put(key: Key, value: Value): void {
    this.root = this.putValue(this.root, key, value);
    if (this.root) this.root.color = Color.BLACK;
  }

  private putValue(node: Node<Key, Value> | null, key: Key, value: Value): Node<Key, Value> {
    if (!node) return new Node(key, value, Color.RED, 1);

    const cmp = this.comparator(key, node.key);
    if (cmp < 0) node.left = this.putValue(node.left, key, value);
    else if (cmp > 0) node.right = this.putValue(node.right, key, value);
    else node.value = value;

    if (this.isRed(node.right) && !this.isRed(node.left)) node = this.rotateLeft(node);
    if (this.isRed(node.left) && node.left && this.isRed(node.left.left)) node = this.rotateRight(node);
    if (this.isRed(node.left) && this.isRed(node.right)) this.flipColors(node);

    node.size = this._size(node.left) + this._size(node.right) + 1;

    return node;
  }

  private rotateRight(node: Node<Key, Value>): Node<Key, Value> {
    const x = node.left!;
    node.left = x.right;
    x.right = node;
    x.color = node.color;
    node.color = Color.RED;
    x.size = node.size;
    node.size = this._size(node.left) + this._size(node.right) + 1;
    return x;
  }

  private rotateLeft(node: Node<Key, Value>): Node<Key, Value> {
    const x = node.right!;
    node.right = x.left;
    x.left = node;
    x.color = node.color;
    node.color = Color.RED;
    x.size = node.size;
    node.size = this._size(node.left) + this._size(node.right) + 1;
    return x;
  }

  private flipColors(node: Node<Key, Value>): void {
    node.color = Color.RED;
    if (node.left) node.left.color = Color.BLACK;
    if (node.right) node.right.color = Color.BLACK;
  }

  public min(): Key | null {
    if (this.isEmpty()) return null;
    return this.minNode(this.root)!.key;
  }

  private minNode(node: Node<Key, Value> | null): Node<Key, Value> | null {
    if (node === null) return null;
    if (node.left === null) return node;
    return this.minNode(node.left);
  }

  public max(): Key | null {
    if (this.isEmpty()) return null;
    return this.maxNode(this.root)!.key;
  }

  private maxNode(node: Node<Key, Value> | null): Node<Key, Value> | null {
    if (node === null) return null;
    if (node.right === null) return node;
    return this.maxNode(node.right);
  }

  public deleteMin(): void {
    if (this.isEmpty()) throw new Error("BST underflow");

    if (!this.isRed(this.root!.left) && !this.isRed(this.root!.right)) {
      this.root!.color = Color.RED;
    }

    this.root = this.deleteMinNode(this.root);
    if (!this.isEmpty()) this.root!.color = Color.BLACK;
  }

  private deleteMinNode(node: Node<Key, Value> | null): Node<Key, Value> | null {
    if (node === null) return null;
    if (node.left === null) return null;

    if (!this.isRed(node.left) && node.left && !this.isRed(node.left.left)) {
      node = this.moveRedLeft(node);
    }

    node.left = this.deleteMinNode(node.left);
    return this.balance(node);
  }

  public deleteMax(): void {
    if (this.isEmpty()) throw new Error("BST underflow");

    if (!this.isRed(this.root!.left) && !this.isRed(this.root!.right)) {
      this.root!.color = Color.RED;
    }

    this.root = this.deleteMaxNode(this.root);
    if (!this.isEmpty()) this.root!.color = Color.BLACK;
  }

  private deleteMaxNode(node: Node<Key, Value> | null): Node<Key, Value> | null {
    if (node === null) return null;

    if (this.isRed(node.left)) {
      node = this.rotateRight(node);
    }

    if (node.right === null) return null;

    if (!this.isRed(node.right) && node.right && !this.isRed(node.right.left)) {
      node = this.moveRedRight(node);
    }

    node.right = this.deleteMaxNode(node.right);

    return this.balance(node);
  }

  public delete(key: Key): void {
    if (!this.contains(key)) return;

    if (!this.isRed(this.root!.left) && !this.isRed(this.root!.right)) {
      this.root!.color = Color.RED;
    }

    this.root = this.deleteNode(this.root, key);
    if (!this.isEmpty()) this.root!.color = Color.BLACK;
  }

  private deleteNode(node: Node<Key, Value> | null, key: Key): Node<Key, Value> | null {
    if (node === null) return null;

    if (this.comparator(key, node.key) < 0) {
      if (!this.isRed(node.left) && node.left && !this.isRed(node.left.left)) {
        node = this.moveRedLeft(node);
      }
      node.left = this.deleteNode(node.left, key);
    } else {
      if (this.isRed(node.left)) {
        node = this.rotateRight(node);
      }
      if (this.comparator(key, node.key) === 0 && (node.right === null)) {
        return null;
      }
      if (!this.isRed(node.right) && node.right && !this.isRed(node.right.left)) {
        node = this.moveRedRight(node);
      }
      if (this.comparator(key, node.key) === 0) {
        const x = this.minNode(node.right)!;
        node.key = x.key;
        node.value = x.value;
        node.right = this.deleteMinNode(node.right);
      } else {
        node.right = this.deleteNode(node.right, key);
      }
    }
    return this.balance(node);
  }

  private moveRedLeft(node: Node<Key, Value>): Node<Key, Value> {
    this.flipColors(node);
    if (node.right && this.isRed(node.right.left)) {
      node.right = this.rotateRight(node.right);
      node = this.rotateLeft(node);
      this.flipColors(node);
    }
    return node;
  }

  private moveRedRight(node: Node<Key, Value>): Node<Key, Value> {
    this.flipColors(node);
    if (node.left && this.isRed(node.left.left)) {
      node = this.rotateRight(node);
      this.flipColors(node);
    }
    return node;
  }

  private balance(node: Node<Key, Value>): Node<Key, Value> {
    if (this.isRed(node.right) && !this.isRed(node.left)) node = this.rotateLeft(node);
    if (this.isRed(node.left) && node.left && this.isRed(node.left.left)) node = this.rotateRight(node);
    if (this.isRed(node.left) && this.isRed(node.right)) this.flipColors(node);

    node.size = this._size(node.left) + this._size(node.right) + 1;
    return node;
  }

  public keys(): Key[] {
    const queue: Key[] = [];
    this.collectKeys(this.root, queue);
    return queue;
  }

  private collectKeys(node: Node<Key, Value> | null, queue: Key[]): void {
    if (node === null) return;
    this.collectKeys(node.left, queue);
    queue.push(node.key);
    this.collectKeys(node.right, queue);
  }

  public height(): number {
    return this.heightHelper(this.root);
  }

  private heightHelper(node: Node<Key, Value> | null): number {
    if (node === null) return -1;
    return 1 + Math.max(this.heightHelper(node.left), this.heightHelper(node.right));
  }
}

// Test the implementation
const tree = new RedBlackBST<string, number>();
tree.put('S', 0);
tree.put('E', 1);
tree.put('A', 2);
tree.put('R', 3);
tree.put('C', 4);
tree.put('H', 5);
tree.put('X', 6);
tree.put('A', 7);
tree.put('M', 8);
tree.put('P', 9);
tree.put('L', 10);
tree.put('E', 11);

console.log(tree.get('E')); // should print 11
console.log(tree.size()); // should print the size of the tree
console.log(tree.keys()); // should print all keys in ascending order

// Additional test for delete operation
const testTree = new RedBlackBST<number, number>();
for (let i = 0; i < 5000; i++) {
  testTree.put(i, i);
}
for (let i = 0; i < 5000; i++) {
  testTree.delete(i);
}
console.assert(testTree.size() === 0, `Size should be 0 after 5000 deletions, but got ${testTree.size()}`);
