import {
  createShapeId,
  DefaultStylePanel,
  DefaultStylePanelContent,
  ShapeUtil,
  StateNode,
  StyleProp,
  T,
  useEditor,
  useRelevantStyles,
  type TLBaseShape,
  type TLHandle,
  type TLKeyboardEventInfo,
  type TLResizeInfo,
  type TLShapeId,
} from "tldraw";
import * as React from "react";

const RCE = React.createElement;

const customColorStyle = StyleProp.defineEnum("example:rating", {
  defaultValue: "red",
  values: ["red", "blue", "green"],
});

const closedStyle = StyleProp.defineEnum("example:closed", {
  defaultValue: "open",
  values: ["open", "closed"],
});

const splineStyle = StyleProp.defineEnum("example:spline", {
  defaultValue: "linear",
  values: ["linear", "spline"],
});

const boolStyle = StyleProp.define("example:bool", {
  defaultValue: false,
  type: T.boolean,
});

// [2]
type CustomColorStyle = T.TypeOf<typeof customColorStyle>;
type ClosedStyle = T.TypeOf<typeof closedStyle>;
type SplineStyle = T.TypeOf<typeof splineStyle>;
type BoolStyle = T.TypeOf<typeof boolStyle>;

export function CustomStylePanel() {
  const editor = useEditor();
  const styles = useRelevantStyles();
  if (!styles) return null;

  const color = styles.get(customColorStyle);
  const bool = styles.get(boolStyle);
  const spline = styles.get(splineStyle);

  //can use this id to add type label into style panel
  // console.log('CustomStylePanel', boolStyle, boolStyle.id, bool)

  return RCE(
    DefaultStylePanel,
    null,
    RCE(DefaultStylePanelContent, { styles: styles }),
    color !== undefined
      ? RCE(
          "div",
          null,
          RCE(
            "select",
            {
              style: { width: "100%", padding: 4 },
              value: color.type === "mixed" ? "" : color.value,
              onChange: (e: any) => {
                const value = customColorStyle.validate(e.currentTarget.value);
                editor.setStyleForSelectedShapes(customColorStyle, value);
              },
            },
            color.type === "mixed"
              ? RCE("option", { value: "" }, "Mixed")
              : null,
            RCE("option", { value: "red" }, "Red"),
            RCE("option", { value: "blue" }, "Blue"),
            RCE("option", { value: "green" }, "Green")
          )
        )
      : null,
    bool !== undefined
      ? RCE(
          "div",
          null,
          RCE("label", null, "Closed"),
          RCE("input", {
            type: "checkbox",
            checked: bool.type === "mixed" ? false : bool.value,
            onChange: (e) => {
              editor.setStyleForSelectedShapes(
                boolStyle,
                e.currentTarget.checked
              );
            },
          })
        )
      : null,
    spline !== undefined
      ? RCE(
          "div",
          null,
          RCE(
            "select",
            {
              style: { width: "100%", padding: 4 },
              value: spline.type === "mixed" ? "" : spline.value,
              onChange: (e: any) => {
                const value = splineStyle.validate(e.currentTarget.value);
                editor.setStyleForSelectedShapes(splineStyle, value);
              },
            },
            spline.type === "mixed"
              ? RCE("option", { value: "" }, "Mixed")
              : null,
            RCE("option", { value: "linear" }, "Linear"),
            RCE("option", { value: "spline" }, "Spline")
          )
        )
      : null
  );
}

// Define the shape type with props
export type MultiSegmentLineShape = TLBaseShape<
  "multiSegmentLine",
  {
    points: { x: number; y: number }[];
    color: CustomColorStyle;
    closed: BoolStyle;
    spline: SplineStyle;
  }
>;

import { Polyline2d } from "tldraw";

// Function to calculate the bounds of a polyline
function getPolylineBounds(points: { x: number; y: number }[]): Polyline2d {
  // Convert the points to Vec instances
  const vecPoints = points.map((point) => new Vec(point.x, point.y));

  // Create a Polyline2d instance which will automatically calculate the bounds
  return new Polyline2d({ points: vecPoints });
}

// Extend ShapeUtil to manage our custom shape
export class MultiSegmentLineUtil extends ShapeUtil<MultiSegmentLineShape> {
  static type = "multiSegmentLine";

  static override props = {
    points: T.arrayOf(T.object({ x: T.number, y: T.number })),
    color: customColorStyle,
    closed: boolStyle,
    spline: splineStyle,
  };

  override canEdit = () => true;

  // Default shape properties
  getDefaultProps(): MultiSegmentLineShape["props"] {
    return {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      color: "red",
      closed: false,
      spline: "linear",
    };
  }

  // Render the shape as an SVG polyline
  component(shape: MultiSegmentLineShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    console.log("component", isEditing);

    const pointsString = shape.props.points
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
    const points = shape.props.points;
    const curvePointsString =
      `M${points[0].x},${points[0].y}` +
      points
        .slice(1)
        .map((p, i) => {
          const cpX = (points[i].x + p.x) / 2;
          const cpY = (points[i].y + p.y) / 2;
          return ` S${cpX},${cpY} ${p.x},${p.y}`;
        })
        .join("");

    const closed = shape.props.closed;
    const spline = shape.props.spline;

    if (spline === "linear") {
      return RCE(
        //todo - some how add "tl-svg-container" on the svg div to get it to show up
        "svg",
        { className: "tl-svg-container" },
        null,
        RCE(closed ? "polygon" : "polyline", {
          points: pointsString,
          stroke: "black",
          strokeWidth: 3.5,
          fill: "none",
        }),
        //use drag/double-click gestures directly on points to resize/delete points?
        ...shape.props.points.map((p, i) =>
          RCE("circle", {
            cx: p.x,
            cy: p.y,
            r: 8,
            fill: shape.props.color,
            id: `point-${i}`,
          })
        )
      );
    } else {
      const splinePointsString = closed
        ? catmullRomToBezierClosed(points)
        : catmullRomToBezier(points);

      return RCE(
        "svg",
        { className: "tl-svg-container" },
        null,
        RCE("path", {
          d: splinePointsString,
          stroke: "black",
          strokeWidth: 3.5,
          fill: "none",
        }),
        ...shape.props.points.map((p, i) =>
          RCE("circle", {
            cx: p.x,
            cy: p.y,
            r: 8,
            fill: shape.props.color,
            id: `point-${i}`,
            pointerEvents: "all",
          })
        )
      );
    }
  }

  override onHandleDrag = (
    shape: MultiSegmentLineShape,
    info: {
      handle: TLHandle;
      initial?: MultiSegmentLineShape;
      isPrecise: boolean;
    }
  ) => {
    console.log("onHandleDrag", shape, info.handle);
  };
  // Get the geometry for hit detection
  getGeometry(shape: MultiSegmentLineShape) {
    const points = shape.props.points;
    return getPolylineBounds(points);
  }

  //also add resize rules - https://tldraw.dev/examples/shapes/tools/shape-with-geometry
  override canResize = () => {
    return true;
  };

  //todo - properly handle resize when multiple shapes are selected 
  //       (as simple as all points are moved by the delta of the center of the initial selection bounds vs new selection bounds? 
  //       this might stop you from having to do stuff conditionally per handle)
  override onResize = (
    shape: MultiSegmentLineShape,
    info: TLResizeInfo<MultiSegmentLineShape>
  ) => {
    const next = structuredClone(info.initialShape);
    const { minX, minY, maxX, maxY } = info.initialBounds;
    const { scaleX, scaleY, handle } = info;

    const x = handle.includes("right") ? minX : maxX;
    const y = handle.includes("bottom") ? minY : maxY;

    const scaledPoints = next.props.points.map((p) => ({
      x: x + (p.x - x) * scaleX,
      y: y + (p.y - y) * scaleY,
    }));
    next.props.points = scaledPoints;
    return next;
  };

  // Render the outline of the shape when selected
  indicator(shape: MultiSegmentLineShape) {
    const pointsString = shape.props.points
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
    return RCE("polyline", {
      points: pointsString,
      stroke: "blue",
      fill: "none",
      strokeDasharray: "4",
      strokeWidth: 3.5,
    });
  }
}

// add ways to customize shape/metadata
//https://tldraw.dev/examples/shapes/tools/selection-ui
//https://tldraw.dev/examples/shapes/tools/shape-with-tldraw-styles
//https://tldraw.dev/examples/shapes/tools/shape-with-custom-styles

import { type TLPointerEventInfo, Vec } from "tldraw";

function catmullRomToBezier(points: { x: number; y: number }[]) {
  if (!points || points.length < 2) return "";

  let d = []; // Array to collect path segments
  d.push(`M ${points[0].x} ${points[0].y}`);

  for (let i = 0; i < points.length - 1; i++) {
    let p0 = i === 0 ? points[0] : points[i - 1];
    let p1 = points[i];
    let p2 = points[i + 1];
    let p3 = i + 2 < points.length ? points[i + 2] : p2;

    // Calculate control points
    let cp1x = p1.x + (p2.x - p0.x) / 6;
    let cp1y = p1.y + (p2.y - p0.y) / 6;

    let cp2x = p2.x - (p3.x - p1.x) / 6;
    let cp2y = p2.y - (p3.y - p1.y) / 6;

    // Append the cubic Bézier curve to the path
    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }

  return d.join(" ");
}

function catmullRomToBezierClosed(points: { x: number; y: number }[]) {
  if (!points || points.length < 2) return "";

  let d = []; // Array to collect path segments

  const pts = points.slice(); // Make a copy of the points array

  // For closed paths, add the last point at the beginning and the first two points at the end
  pts.unshift(points[points.length - 1]);
  pts.push(points[0], points[1]);

  d.push(`M ${pts[1].x} ${pts[1].y}`);

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    // Calculate control points
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    // Append the cubic Bézier curve to the path
    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }

  d.push("Z"); // Close the path

  return d.join(" ");
}

export class MultiSegmentLineTool extends StateNode {
  static id = "multiSegmentLine";
  shapeId?: TLShapeId;
  isDragging = false;
  draggedPointIndex: number | null = null;
  mousePos = { x: 0, y: 0 };

  override onEnter = () => {
    //use whether a shape is selected to determine whether a click creates a new shape or adds a point to an existing shape
    const { editor } = this;
    const selectedShapes = editor.getSelectedShapes().filter(s => s.type === "multiSegmentLine");
    console.log("onEnter shapes", this, selectedShapes);
    // editor.on("event", (e) => {
    //   if (e.name === "key_down" || e.type === "keyboard") {
    //     console.log("tldraw event", e);
    //   } else {
    //     console.log("tldraw event", "other");
    //   }
    // });
    this.shapeId = selectedShapes.length > 0 ? selectedShapes[0].id : undefined;
  };

  override onKeyDown = (info: TLKeyboardEventInfo) => {
    console.log("onKeyDown", info);
    //if key is d start dragging
    if (info.key === "q") {
      this.isDragging = true;
      //find the closest point to the cursor
      const shape = this.editor.getShape<MultiSegmentLineShape>(this.shapeId!)!;

      //todo change this to closest point
      const pointIndex = shape.props.points.findIndex(
        (p) => Vec.Dist(p, this.mousePos!) < 10
      );

      if (pointIndex !== -1) {
        this.draggedPointIndex = pointIndex;
      } else {
        this.draggedPointIndex = null;
        console.log("no point found");
      }
    }
  };

  override onKeyUp = (info: TLKeyboardEventInfo) => {
    if (info.key === "q") {
      this.isDragging = false;
      this.draggedPointIndex = null;
    }
  };

  override onPointerMove = (info: TLPointerEventInfo) => {
    // console.log('onPointerMove', this.isDragging, this.draggedPointIndex)

    //convert to page coordinates
    const pagePoint = this.editor.screenToPage(info.point);
    this.mousePos = { x: pagePoint.x, y: pagePoint.y };
    if (this.isDragging && this.draggedPointIndex !== null) {
      const shape = this.editor.getShape<MultiSegmentLineShape>(this.shapeId!)!;
      const newPoints = [...shape.props.points];
      newPoints[this.draggedPointIndex] = {x: pagePoint.x, y: pagePoint.y};
      this.editor.updateShapes([{ ...shape, props: { points: newPoints } }]);
    }
  };

  // Handle pointer down to either create a new point or start dragging an existing point
  override onPointerDown = (info: TLPointerEventInfo) => {
    const { editor } = this;
    const screenPoint = { x: info.point.x, y: info.point.y };
    const pagePointObj = editor.screenToPage(screenPoint);
    const pagePoint = { x: pagePointObj.x, y: pagePointObj.y };

    const target = info.target;
    console.log("onPointerDown", info.target);

    // editor.on('event', (e) => {
    //   console.log("tldraw move", e)
    // })

    //todo wrap with editor.history.batch
    if (!this.shapeId) {
      // Create a new shape if none is active
      const newShapeId = createShapeId(`multiSegmentLine-${Date.now()}`);
      console.log(
        "multiSegmentLineTool onPointerDown creating new shape",
        newShapeId
      );
      editor.createShape({
        type: "multiSegmentLine",
        props: { points: [pagePoint] },
        id: newShapeId,
      });
      this.shapeId = newShapeId;
    } else {
      const shape = editor.getShape<MultiSegmentLineShape>(this!.shapeId);
      if (shape) {
        // Add the new point to the current shape
        editor.updateShapes([
          {
            id: shape.id,
            type: shape.type,
            props: { points: [...shape.props.points, pagePoint] },
          },
        ]);
      }
    }
  };

  // // Handle pointer move to drag points
  // onPointerMove = (info: TLPointerEventInfo) => {
  //   //todo wrap with editor.history.batch
  //   if (this.shapeId && this.isDragging && this.draggedPointIndex !== null) {
  //     const shape = this.editor.getShape<MultiSegmentLineShape>(this.shapeId)!
  //     const newPoints = [...shape.props.points]
  //     newPoints[this.draggedPointIndex] = { x: info.point.x, y: info.point.y }
  //     this.editor.updateShapes([{ ...shape, props: { points: newPoints } }])
  //   }
  // }

  onEscape() {
    this.shapeId = undefined;
    this.isDragging = false;
    this.draggedPointIndex = null;
  }
}

// Custom icon using RCE
export function MultiSegmentLineIcon() {
  return RCE(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 24,
      height: 24,
      fill: "none",
      stroke: "currentColor",
    },
    RCE("polyline", {
      points: "4,6 12,12 20,18",
      strokeWidth: 2,
      strokeLinecap: "round",
    })
  );
}

import {
  DefaultKeyboardShortcutsDialog,
  DefaultKeyboardShortcutsDialogContent,
  DefaultToolbar,
  DefaultToolbarContent,
  type TLComponents,
  type TLUiOverrides,
  TldrawUiMenuItem,
  useIsToolSelected,
  useTools,
} from "tldraw";

// Define the UI overrides for tools
export const uiOverrides: TLUiOverrides = {
  tools: function (editor, tools) {
    // Add the custom tool (Multi-Segment Line) to the toolbar
    tools.multiSegmentLine = {
      id: "multiSegmentLine",
      icon: "color",
      label: "Multi-Segment Line",
      kbd: "m",
      onSelect: function () {
        editor.setCurrentTool("multiSegmentLine");
      },
    };
    return tools;
  },
};

// Define the custom UI components (toolbar and keyboard shortcuts dialog)
export const components: TLComponents = {
  Toolbar: function (props) {
    const tools = useTools();
    const multiSegmentTool = tools["multiSegmentLine"];
    const isMultiSegmentLineSelected = multiSegmentTool
      ? useIsToolSelected(multiSegmentTool)
      : false;
    return RCE(
      DefaultToolbar,
      props,
      multiSegmentTool
        ? RCE(TldrawUiMenuItem, {
            ...multiSegmentTool,
            isSelected: isMultiSegmentLineSelected,
          })
        : null, // Only render if the tool exists
      RCE(DefaultToolbarContent, null)
    );
  },
  KeyboardShortcutsDialog: function (props) {
    const tools = useTools();
    return RCE(
      DefaultKeyboardShortcutsDialog,
      props,
      RCE(TldrawUiMenuItem, tools["multiSegmentLine"]),
      RCE(DefaultKeyboardShortcutsDialogContent, null)
    );
  },
};
