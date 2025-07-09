import Konva from "konva";

/* --------------------------------------------------
    1. Stage & layer
-------------------------------------------------- */
const stage = new Konva.Stage({ container: 'container', width: window.innerWidth, height: window.innerHeight - 48 });
const layer = new Konva.Layer();
stage.add(layer);

/* --------------------------------------------------
    2. Transformers
-------------------------------------------------- */
const selTr = new Konva.Transformer({ rotateEnabled: true, keepRatio: true, padding: 6 });
layer.add(selTr);
let grpTr = null; // dedicated transformer for single‑group selection

/* --------------------------------------------------
    3. Mode toggle
-------------------------------------------------- */
let mode = 'draw';
document.getElementById('drawMode').addEventListener('change', () => (mode = 'draw'));
document.getElementById('selectMode').addEventListener('change', () => (mode = 'select'));

/* --------------------------------------------------
    4. Helpers
-------------------------------------------------- */
function lockPivot(node) {
  const box = node.getClientRect({ relativeTo: node });
  node.offset({ x: box.width / 2, y: box.height / 2 });
  node.position({ x: node.x() + box.width / 2, y: node.y() + box.height / 2 });
}

// return the top‑most group (direct child of layer) for any descendant click
function topGroup(node) {
  let cur = node;
  let candidate = null;
  while (cur && cur !== layer) {
    if (cur instanceof Konva.Group) candidate = cur;
    cur = cur.getParent();
  }
  return candidate; // may be null
}

// guard against selecting ancestor & descendant simultaneously
function hasAncestorConflict(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].isAncestorOf(nodes[j]) || nodes[j].isAncestorOf(nodes[i])) return true;
    }
  }
  return false;
}

/* --------------------------------------------------
    5. Drawing
-------------------------------------------------- */
let isDrawing = false;
let currentLine = null;

stage.on('mousedown touchstart', () => {
  if (mode !== 'draw') return;
  isDrawing = true;
  const { x, y } = stage.getPointerPosition();
  currentLine = new Konva.Line({ points: [x, y], stroke: 'black', strokeWidth: 6, lineCap: 'round', lineJoin: 'round', draggable: true });
  layer.add(currentLine);
});

stage.on('mousemove touchmove', () => {
  if (!isDrawing) return;
  const { x, y } = stage.getPointerPosition();
  currentLine.points([...currentLine.points(), x, y]);
  layer.batchDraw();
});

stage.on('mouseup touchend', () => {
  if (!isDrawing) return;
  isDrawing = false;
  lockPivot(currentLine);
  layer.batchDraw();
  currentLine = null;
});

/* --------------------------------------------------
    6. Selection
-------------------------------------------------- */
const selected = [];

stage.on('click tap', (e) => {
  if (mode !== 'select') return;
  let target = e.target;
  if (target === stage || target === layer) { clearSelection(); return; }

  const group = topGroup(target);
  target = group ?? target; // escalate to top‑group if exists

  if (e.evt.shiftKey) toggle(target); else { clearSelection(); add(target); }
});

function add(node) { if (!selected.includes(node)) selected.push(node); refreshUI(); }
function toggle(node) { const idx = selected.indexOf(node); idx >= 0 ? selected.splice(idx, 1) : selected.push(node); refreshUI(); }
function clearSelection() { selected.length = 0; refreshUI(); }

/* --------------------------------------------------
    7. Group / Ungroup (fully nested‑aware)
-------------------------------------------------- */
const groupBtn = document.getElementById('groupBtn');
const ungroupBtn = document.getElementById('ungroupBtn');

groupBtn.addEventListener('click', () => {
  if (selected.length < 2) return;

  // compute common parent to insert new group into (layer by default)
  let commonParent = selected[0].getParent();
  for (const n of selected) if (n.getParent() !== commonParent) { commonParent = layer; break; }

  const superGroup = new Konva.Group({ draggable: true });
  commonParent.add(superGroup);

  selTr.nodes([]); if (grpTr) grpTr.nodes([]);

  selected.forEach((node) => {
    node.draggable(false);
    const absPos = node.getAbsolutePosition();
    const absRot = node.getAbsoluteRotation();
    const absScale = node.getAbsoluteScale();
    node.moveTo(superGroup);
    node.position(absPos);
    node.rotation(absRot);
    node.scale(absScale);
  });

  lockPivot(superGroup);

  clearSelection();
  selected.push(superGroup);
  refreshUI();
  layer.batchDraw();
});

ungroupBtn.addEventListener('click', () => {
  if (!(selected.length === 1 && selected[0] instanceof Konva.Group)) return;
  const grp = selected[0];
  const parent = grp.getParent();
  if (grpTr) grpTr.nodes([]);

  // Snapshot children so iteration is safe during re‑parenting
  [...grp.getChildren()].forEach((child) => {
    const absPos = child.getAbsolutePosition();
    const absRot = child.getAbsoluteRotation();
    const absScale = child.getAbsoluteScale();
    child.moveTo(parent);
    child.position(absPos);
    child.rotation(absRot);
    child.scale(absScale);
    child.draggable(true);
  });

  grp.destroy();

  clearSelection();
  layer.batchDraw();
});

/* --------------------------------------------------
    8. UI update helpers
-------------------------------------------------- */
function refreshUI() {
  // transformers
  if (selected.length === 1 && selected[0] instanceof Konva.Group) {
    if (!grpTr) { grpTr = new Konva.Transformer({ rotateEnabled: true, keepRatio: true, padding: 6 }); layer.add(grpTr); }
    grpTr.nodes([selected[0]]);
    selTr.nodes([]);
  } else {
    selTr.nodes(selected);
    if (grpTr) grpTr.nodes([]);
  }

  // buttons
  const canGroup = selected.length >= 2 && !hasAncestorConflict(selected);
  groupBtn.disabled = !canGroup;
  ungroupBtn.disabled = !(selected.length === 1 && selected[0] instanceof Konva.Group);
  layer.batchDraw();
}

/* --------------------------------------------------
    9. Responsive resize
-------------------------------------------------- */
window.addEventListener('resize', () => {
  stage.width(window.innerWidth);
  stage.height(window.innerHeight - 48);
  layer.batchDraw();
});