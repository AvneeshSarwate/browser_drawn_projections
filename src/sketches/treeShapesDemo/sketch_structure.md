# TreeShapes Demo

This sketch demonstrates the TreeShapes implementation, which provides a framework for folding/unfolding hierarchical shapes.

## Key Features

1. **Hierarchical Shapes**: Creates multiple layers of shapes that can be folded/unfolded together
2. **Three Fold Modes**:
   - `outline`: Maps child points to parent outline
   - `shrink`: Shrinks the child toward its parent point
   - `segment`: Maps child points to segments on either side of parent point
3. **Adjustable Parameters**:
   - Folding depth: How many layers to fold at once (1-3)
   - Animation speed: How quickly folding occurs
   - Fold mode: How shapes fold into their parent

## Controls

- `1-3`: Select different root shapes
- `F`: Start folding animation with current shape
- `R`: Reverse fold animation in progress
- `D`: Cycle through folding depths (1-3)
- `M`: Cycle through fold modes (outline, shrink, segment)
- `Up/Down arrows`: Adjust animation speed

## Demo Structure

The demo showcases three different root shapes:
1. A square with 3 levels of hierarchy (64 total shapes)
2. A circle with child circles (demonstrates shrink folding)
3. A triangle with custom child shapes (demonstrates segment folding)

## Implementation Notes

- Each shape maintains its own fold state and animation
- The animation system works by incrementally updating the fold progress
- The demo supports folding multiple levels at once
- All shape points are drawn using p5's beginShape/endShape functionality