import { RedBlackBST } from './redBlack_claude'; // Adjust the import path as needed

function testBasicOperations() {
  console.log("Testing basic operations...");
  
  const bst = new RedBlackBST<number, string>();
  
  // Test put and get
  bst.put(5, "five");
  bst.put(2, "two");
  bst.put(7, "seven");
  bst.put(1, "one");
  bst.put(8, "eight");

  assert(bst.get(5) === "five", "Get operation failed for key 5");
  assert(bst.get(2) === "two", "Get operation failed for key 2");
  assert(bst.get(7) === "seven", "Get operation failed for key 7");
  assert(bst.get(1) === "one", "Get operation failed for key 1");
  assert(bst.get(8) === "eight", "Get operation failed for key 8");
  
  // Test size
  assert(bst.size() === 5, "Size should be 5");
  
  // Test contains
  assert(bst.contains(7), "Contains should return true for existing key");
  assert(!bst.contains(10), "Contains should return false for non-existing key");
  
  console.log("Basic operations tests passed.");
}

function testDuplicateKeys() {
  console.log("Testing duplicate keys...");
  
  const bst = new RedBlackBST<number, string>();
  
  bst.put(5, "five");
  bst.put(5, "cinco");
  
  assert(bst.get(5) === "cinco", "Duplicate key should update the value");
  assert(bst.size() === 1, "Size should remain 1 after inserting duplicate key");
  
  console.log("Duplicate keys tests passed.");
}

function testDeletion() {
  console.log("Testing deletion...");
  
  const bst = new RedBlackBST<number, string>();
  
  bst.put(5, "five");
  bst.put(2, "two");
  bst.put(7, "seven");
  bst.put(1, "one");
  bst.put(8, "eight");
  
  bst.delete(2);
  assert(!bst.contains(2), "Key 2 should be deleted");
  assert(bst.size() === 4, "Size should be 4 after deletion");
  
  bst.delete(5);
  assert(!bst.contains(5), "Key 5 (root) should be deleted");
  assert(bst.size() === 3, "Size should be 3 after root deletion");
  
  bst.delete(10); // Non-existent key
  assert(bst.size() === 3, "Size should remain 3 after attempting to delete non-existent key");
  
  console.log("Deletion tests passed.");
}

function testCustomComparator() {
  console.log("Testing custom comparator...");
  
  const reverseComparator = (a: number, b: number) => b - a;
  const bst = new RedBlackBST<number, string>(reverseComparator);
  
  bst.put(5, "five");
  bst.put(2, "two");
  bst.put(7, "seven");
  
  assert(bst.get(5) === "five", "Get operation failed with custom comparator");
  assert(bst.get(2) === "two", "Get operation failed with custom comparator");
  assert(bst.get(7) === "seven", "Get operation failed with custom comparator");
  assert(bst.min() === 7, "Min operation failed with custom comparator");
  assert(bst.max() === 2, "Max operation failed with custom comparator");
  
  console.log("Custom comparator tests passed.");
}

function testEdgeCases() {
  console.log("Testing edge cases...");
  
  const bst = new RedBlackBST<number, string>();
  
  // Test empty tree
  assert(bst.isEmpty(), "Tree should be empty initially");
  assert(bst.size() === 0, "Size should be 0 for empty tree");
  assert(bst.get(1) === null, "Get on empty tree should return null");
  
  // Test single node
  bst.put(1, "one");
  assert(!bst.isEmpty(), "Tree should not be empty after insertion");
  assert(bst.size() === 1, "Size should be 1 after single insertion");
  
  // Test deletion of root when it's the only node
  bst.delete(1);
  assert(bst.isEmpty(), "Tree should be empty after deleting the only node");
  assert(bst.size() === 0, "Size should be 0 after deleting the only node");
  
  console.log("Edge cases tests passed.");
}

function testLargeDataset() {
  console.log("Testing with large dataset...");
  
  const bst = new RedBlackBST<number, number>();
  const n = 10000;

  // Insert a large number of elements
  for (let i = 0; i < n; i++) {
    bst.put(i, i);
  }

  assert(bst.size() === n, `Size should be ${n} after ${n} insertions`);

  // Check if all elements are present
  for (let i = 0; i < n; i++) {
    assert(bst.contains(i), `Tree should contain key ${i}`);
    assert(bst.get(i) === i, `Value for key ${i} should be ${i}`);
  }

  // Delete half of the elements
  for (let i = 0; i < n / 2; i++) {
    bst.delete(i);
  }

  assert(bst.size() === n / 2, `Size should be ${n / 2} after ${n / 2} deletions`);

  // Check remaining elements
  for (let i = n / 2; i < n; i++) {
    assert(bst.contains(i), `Tree should still contain key ${i}`);
    assert(bst.get(i) === i, `Value for key ${i} should still be ${i}`);
  }

  console.log("Large dataset test passed.");
}

function testBalanceAfterOperations() {
  console.log("Testing tree balance after operations...");

  const bst = new RedBlackBST<number, string>();

  // Insert elements in ascending order
  for (let i = 0; i < 100; i++) {
    bst.put(i, `value${i}`);
  }

  // Check if the tree is balanced by comparing its height to the optimal height
  const height = getTreeHeight(bst);
  const optimalHeight = Math.floor(Math.log2(101)); // 101 because 0 is included

  assert(height <= 2 * optimalHeight, `Tree height (${height}) should be at most twice the optimal height (${optimalHeight})`);

  // Delete some elements
  for (let i = 0; i < 50; i += 2) {
    bst.delete(i);
  }

  // Check balance again
  const newHeight = getTreeHeight(bst);
  assert(newHeight <= 2 * optimalHeight, `Tree height (${newHeight}) should still be balanced after deletions`);

  console.log("Balance test passed.");
}

function getTreeHeight(bst: RedBlackBST<number, string>): number {
  return bst.height();
}

function testStringKeys() {
  console.log("Testing with string keys...");

  const bst = new RedBlackBST<string, number>();

  const words = ["apple", "banana", "cherry", "date", "elderberry"];

  // Insert words
  words.forEach((word, index) => {
    bst.put(word, index);
  });

  assert(bst.size() === words.length, `Size should be ${words.length}`);

  // Check if all words are present
  words.forEach((word, index) => {
    assert(bst.contains(word), `Tree should contain key "${word}"`);
    assert(bst.get(word) === index, `Value for key "${word}" should be ${index}`);
  });

  // Delete some words
  bst.delete("banana");
  bst.delete("date");

  assert(bst.size() === words.length - 2, `Size should be ${words.length - 2} after deletions`);
  assert(!bst.contains("banana"), `Tree should not contain "banana" after deletion`);
  assert(!bst.contains("date"), `Tree should not contain "date" after deletion`);

  console.log("String keys test passed.");
}

function testCustomObjectKeys() {
  console.log("Testing with custom object keys...");

  class CustomKey {
    constructor(public id: number, public name: string) {}
  }

  const customComparator = (a: CustomKey, b: CustomKey) => a.id - b.id;
  const bst = new RedBlackBST<CustomKey, string>(customComparator);

  const keys = [
    new CustomKey(1, "one"),
    new CustomKey(2, "two"),
    new CustomKey(3, "three")
  ];

  keys.forEach((key, index) => {
    bst.put(key, `value${index}`);
  });

  assert(bst.size() === keys.length, `Size should be ${keys.length}`);

  // Check if all keys are present
  keys.forEach((key, index) => {
    assert(bst.contains(key), `Tree should contain key "${key.name}"`);
    assert(bst.get(key) === `value${index}`, `Value for key "${key.name}" should be "value${index}"`);
  });

  // Delete a key
  bst.delete(keys[1]);
  assert(bst.size() === keys.length - 1, `Size should be ${keys.length - 1} after deletion`);
  assert(!bst.contains(keys[1]), `Tree should not contain "${keys[1].name}" after deletion`);

  console.log("Custom object keys test passed.");
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTests() {
  console.log("Running Red-Black BST Tests");

  testBasicOperations();
  testDuplicateKeys();
  testDeletion();
  testCustomComparator();
  testEdgeCases();
  testLargeDataset();
  testBalanceAfterOperations();
  testStringKeys();
  testCustomObjectKeys();

  console.log("All tests completed.");
}

runTests();
