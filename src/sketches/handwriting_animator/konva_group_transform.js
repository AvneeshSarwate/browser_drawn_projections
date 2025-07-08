import Konva from "konva";

/* 1. Stage & layer ------------------------------------------------------- */
const stage = new Konva.Stage({
  container: "container",
  width: window.innerWidth,
  height: window.innerHeight,
});
const layer = new Konva.Layer();
stage.add(layer);

/* 2. Helper → build one column of two PATH squares ---------------------- */
function makeColumn(topFill, bottomFill, xPos) {
  const g = new Konva.Group({
    x: xPos,
    y: stage.height() / 2,
    draggable: true,
  });
  const SZ = 70,
    GAP = 10;

  // SVG path for a 70×70 square starting at 0,0
  const squarePath = (size) => `M0 0 H${size} V${size} H0 Z`;

  g.add(
    new Konva.Path({
      x: -SZ / 2,
      y: -(SZ + GAP / 2),
      data: squarePath(SZ),
      fill: topFill,
      stroke: "black",
      strokeWidth: 2,
    }),
    new Konva.Path({
      x: -SZ / 2,
      y: GAP / 2,
      data: squarePath(SZ),
      fill: bottomFill,
      stroke: "black",
      strokeWidth: 2,
    })
  );

  lockPivot(g); // centre its rotation pivot once
  layer.add(g);
  return g;
}

/* 3. Two independent columns ------------------------------------------- */
const colA = makeColumn("tomato", "gold", stage.width() / 2 - 120);
const colB = makeColumn("dodgerblue", "limegreen", stage.width() / 2 + 120);

let trA, trB, trMaster, superGroup;
attachPerColumnTransformers();

/* 4. Pivot utility ------------------------------------------------------ */
function lockPivot(node) {
  const box = node.getClientRect({ relativeTo: node });
  node.offset({ x: box.width / 2, y: box.height / 2 });
  node.position({ x: node.x() + box.width / 2, y: node.y() + box.height / 2 });
}

/* 5. Transformer helpers ------------------------------------------------ */
function attachPerColumnTransformers() {
  trA = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: true,
    padding: 6,
  });
  trB = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: true,
    padding: 6,
  });
  layer.add(trA).add(trB);
  trA.nodes([colA]);
  trB.nodes([colB]);
}
function destroyPerColumnTransformers() {
  trA.destroy();
  trB.destroy();
}

/* 6. GROUP button ------------------------------------------------------- */
document.getElementById("groupBtn").onclick = () => {
  superGroup = new Konva.Group({ draggable: true });
  layer.add(superGroup);

  [colA, colB].forEach((col) => {
    col.draggable(false);
    const absPos = col.getAbsolutePosition();
    const absRot = col.getAbsoluteRotation();
    const absScale = col.getAbsoluteScale();
    col.moveTo(superGroup);
    col.position(absPos);
    col.rotation(absRot);
    col.scale(absScale);
  });

  lockPivot(superGroup);

  destroyPerColumnTransformers();
  trMaster = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: true,
    padding: 6,
  });
  layer.add(trMaster);
  trMaster.nodes([superGroup]);

  toggleButtons(true);
  layer.batchDraw();
};

/* 7. UNGROUP button ----------------------------------------------------- */
document.getElementById("ungroupBtn").onclick = () => {
  [colA, colB].forEach((col) => {
    const absPos = col.getAbsolutePosition();
    const absRot = col.getAbsoluteRotation();
    const absScale = col.getAbsoluteScale();
    col.moveTo(layer);
    col.position(absPos);
    col.rotation(absRot);
    col.scale(absScale);
    col.draggable(true);
  });

  superGroup.destroy();
  trMaster.destroy();
  attachPerColumnTransformers();

  toggleButtons(false);
  layer.batchDraw();
};

/* 8. UI helper ---------------------------------------------------------- */
function toggleButtons(isGrouped) {
  document.getElementById("groupBtn").disabled = isGrouped;
  document.getElementById("ungroupBtn").disabled = !isGrouped;
}

layer.draw();
