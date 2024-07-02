type Color = 'RED' | 'BLACK';

class Node<K, V> {
  key: K;
  value: V;
  left: Node<K, V> | null = null;
  right: Node<K, V> | null = null;
  color: Color;
  size: number;

  constructor(key: K, value: V, color: Color, size: number) {
    this.key = key;
    this.value = value;
    this.color = color;
    this.size = size;
  }
}

export class RedBlackBST<K, V> {
  private root: Node<K, V> | null = null;
  private readonly comparator: (a: K, b: K) => number;

  constructor(comparator?: (a: K, b: K) => number) {
    this.comparator = comparator || this.defaultComparator;
  }

  private defaultComparator(a: K, b: K): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  private isRed(node: Node<K, V> | null): boolean {
    return node?.color === 'RED';
  }

  private _size(node: Node<K, V> | null): number {
    return node?.size ?? 0;
  }

  public size(): number {
    return this._size(this.root);
  }

  public isEmpty(): boolean {
    return this.root === null;
  }

  public get(key: K): V | null {
    let node = this.root;
    while (node !== null) {
      const cmp = this.comparator(key, node.key);
      if (cmp < 0) node = node.left;
      else if (cmp > 0) node = node.right;
      else return node.value;
    }
    return null;
  }

  public contains(key: K): boolean {
    return this.get(key) !== null;
  }

  public put(key: K, value: V): void {
    this.root = this.putNode(this.root, key, value);
    this.root.color = 'BLACK';
  }

  private putNode(node: Node<K, V> | null, key: K, value: V): Node<K, V> {
    if (node === null) return new Node(key, value, 'RED', 1);

    const cmp = this.comparator(key, node.key);
    if (cmp < 0) node.left = this.putNode(node.left, key, value);
    else if (cmp > 0) node.right = this.putNode(node.right, key, value);
    else node.value = value;

    if (this.isRed(node.right) && !this.isRed(node.left)) node = this.rotateLeft(node);
    if (this.isRed(node.left) && node.left && this.isRed(node.left.left)) node = this.rotateRight(node);
    if (this.isRed(node.left) && this.isRed(node.right)) this.flipColors(node);

    node.size = this._size(node.left) + this._size(node.right) + 1;
    return node;
  }

  public delete(key: K): void {
    if (!this.contains(key)) return;

    if (this.root && !this.isRed(this.root.left) && !this.isRed(this.root.right)) {
      this.root.color = 'RED';
    }

    this.root = this.deleteNode(this.root, key);
    if (this.root) this.root.color = 'BLACK';
  }

  private deleteNode(node: Node<K, V> | null, key: K): Node<K, V> | null {
    if (node === null) return null;

    if (this.comparator(key, node.key) < 0) {
      if (node.left && !this.isRed(node.left) && !this.isRed(node.left.left)) {
        node = this.moveRedLeft(node);
      }
      node.left = this.deleteNode(node.left, key);
    } else {
      if (this.isRed(node.left)) {
        node = this.rotateRight(node);
      }
      if (this.comparator(key, node.key) === 0 && node.right === null) {
        return null;
      }
      if (node.right && !this.isRed(node.right) && !this.isRed(node.right.left)) {
        node = this.moveRedRight(node);
      }
      if (this.comparator(key, node.key) === 0) {
        const minNode = this.min(node.right!);
        node.key = minNode.key;
        node.value = minNode.value;
        node.right = this.deleteMin(node.right!);
      } else {
        node.right = this.deleteNode(node.right, key);
      }
    }
    return this.balance(node);
  }

  private rotateRight(node: Node<K, V>): Node<K, V> {
    const x = node.left!;
    node.left = x.right;
    x.right = node;
    x.color = node.color;
    node.color = 'RED';
    x.size = node.size;
    node.size = this._size(node.left) + this._size(node.right) + 1;
    return x;
  }

  private rotateLeft(node: Node<K, V>): Node<K, V> {
    const x = node.right!;
    node.right = x.left;
    x.left = node;
    x.color = node.color;
    node.color = 'RED';
    x.size = node.size;
    node.size = this._size(node.left) + this._size(node.right) + 1;
    return x;
  }

  private flipColors(node: Node<K, V>): void {
    node.color = node.color === 'RED' ? 'BLACK' : 'RED';
    if (node.left) node.left.color = node.left.color === 'RED' ? 'BLACK' : 'RED';
    if (node.right) node.right.color = node.right.color === 'RED' ? 'BLACK' : 'RED';
  }

  private moveRedLeft(node: Node<K, V>): Node<K, V> {
    this.flipColors(node);
    if (node.right && this.isRed(node.right.left)) {
      node.right = this.rotateRight(node.right);
      node = this.rotateLeft(node);
      this.flipColors(node);
    }
    return node;
  }

  private moveRedRight(node: Node<K, V>): Node<K, V> {
    this.flipColors(node);
    if (node.left && this.isRed(node.left.left)) {
      node = this.rotateRight(node);
      this.flipColors(node);
    }
    return node;
  }

  private balance(node: Node<K, V>): Node<K, V> {
    if (this.isRed(node.right) && !this.isRed(node.left)) node = this.rotateLeft(node);
    if (node.left && this.isRed(node.left) && this.isRed(node.left.left)) node = this.rotateRight(node);
    if (this.isRed(node.left) && this.isRed(node.right)) this.flipColors(node);

    node.size = this._size(node.left) + this._size(node.right) + 1;
    return node;
  }

  public min(node: Node<K, V>): Node<K, V> {
    if (node.left === null) return node;
    return this.min(node.left);
  }

  public deleteMin(node: Node<K, V>): Node<K, V> | null {
    if (node.left === null) return node.right;

    if (node.left && !this.isRed(node.left) && !this.isRed(node.left.left)) {
      node = this.moveRedLeft(node);
    }

    node.left = this.deleteMin(node.left!);
    return this.balance(node);
  }

  public max(node: Node<K, V>): Node<K, V> {
    if (node.right === null) return node;
    return this.max(node.right);
  }

  public deleteMax(node: Node<K, V>): Node<K, V> | null {
    if (node.right === null) return node.left;
    if (this.isRed(node.right)) node = this.rotateLeft(node);
    node.right = this.deleteMax(node.right!);
    return this.balance(node);
  }

  public keys(): K[] {
    const queue: K[] = [];
    this.collectKeys(this.root, queue);
    return queue;
  }

  private collectKeys(node: Node<K, V> | null, queue: K[]): void {
    if (node === null) return;
    this.collectKeys(node.left, queue);
    queue.push(node.key);
    this.collectKeys(node.right, queue);
  }

  public height(): number {
    return this.heightHelper(this.root);
  }
  
  private heightHelper(node: Node<K, V> | null): number {
    if (node === null) return -1;
    return 1 + Math.max(this.heightHelper(node.left), this.heightHelper(node.right));
  }
}