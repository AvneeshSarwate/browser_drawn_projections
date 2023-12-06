export const p5defs = `
type CHORD = 'chord';
type PIE = 'pie';
type OPEN = 'open';
type ARC_MODE = CHORD | PIE | OPEN;

type POINTS = 0x0000;
type LINES = 0x0001;
type TRIANGLES = 0x0004;
type TRIANGLE_FAN = 0x0006;
type TRIANGLE_STRIP = 0x0005;
type QUADS = 'quads';
type QUAD_STRIP = 'quad_strip';
type TESS = 'tess';
type BEGIN_KIND = POINTS | LINES | TRIANGLES | TRIANGLE_FAN | TRIANGLE_STRIP | QUADS | QUAD_STRIP | TESS;

type CLOSE = 'close';
type END_MODE = CLOSE;


declare class Vector {
  /**
   *   A class to describe a two or three-dimensional
   *   vector, specifically a Euclidean (also known as
   *   geometric) vector. A vector is an entity that has
   *   both magnitude and direction. The datatype,
   *   however, stores the components of the vector (x, y
   *   for 2D; or x, y, z for 3D). The magnitude and
   *   direction can be accessed via the methods
   *   p5.Vector.mag() and heading(). In many of the
   *   p5.js examples, you will see p5.Vector used to
   *   describe a position, velocity, or acceleration.
   *   For example, if you consider a rectangle moving
   *   across the screen, at any given instant it has a
   *   position (a vector that points from the origin to
   *   its location), a velocity (the rate at which the
   *   object's position changes per time unit, expressed
   *   as a vector), and acceleration (the rate at which
   *   the object's velocity changes per time unit,
   *   expressed as a vector).
   *
   *   Since vectors represent groupings of values, we
   *   cannot simply use traditional
   *   addition/multiplication/etc. Instead, we'll need
   *   to do some "vector" math, which is made easy by
   *   the methods inside the p5.Vector class.
   *
   *   @param [x] x component of the vector
   *   @param [y] y component of the vector
   *   @param [z] z component of the vector
   */
  constructor(x?: number, y?: number, z?: number);

  /**
   *   Gets a copy of the vector, returns a p5.Vector
   *   object.
   *   @param v the p5.Vector to create a copy of
   *   @return the copy of the p5.Vector object
   */
  static copy(v: Vector): Vector;

  /**
   *   Adds x, y, and z components to a vector, adds one
   *   vector to another, or adds two independent vectors
   *   together. The version of the method that adds two
   *   vectors together is a static method and returns a
   *   p5.Vector, the others act directly on the vector.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param v1 A p5.Vector to add
   *   @param v2 A p5.Vector to add
   *   @param [target] The vector to receive the result
   *   @return The resulting p5.Vector
   */
  static add(v1: Vector, v2: Vector, target?: Vector): Vector;

  /**
   *   Gives the remainder of a vector when it is divided
   *   by another vector. See examples for more context.
   *   @param v1 The dividend p5.Vector
   *   @param v2 The divisor p5.Vector
   */
  static rem(v1: Vector, v2: Vector): void;

  /**
   *   Gives the remainder of a vector when it is divided
   *   by another vector. See examples for more context.
   *   @param v1 The dividend p5.Vector
   *   @param v2 The divisor p5.Vector
   *   @return The resulting p5.Vector
   */
  static rem(v1: Vector, v2: Vector): Vector;

  /**
   *   Subtracts x, y, and z components from a vector,
   *   subtracts one vector from another, or subtracts
   *   two independent vectors. The version of the method
   *   that subtracts two vectors is a static method and
   *   returns a p5.Vector, the others act directly on
   *   the vector. Additionally, you may provide
   *   arguments to this method as an array. See the
   *   examples for more context.
   *   @param v1 A p5.Vector to subtract from
   *   @param v2 A p5.Vector to subtract
   *   @param [target] The vector to receive the result
   *   @return The resulting p5.Vector
   */
  static sub(v1: Vector, v2: Vector, target?: Vector): Vector;

  /**
   *   Multiplies the vector by a scalar, multiplies the
   *   x, y, and z components from a vector, or
   *   multiplies the x, y, and z components of two
   *   independent vectors. When multiplying a vector by
   *   a scalar, the x, y, and z components of the vector
   *   are all multiplied by the scalar. When multiplying
   *   a vector by a vector, the x, y, z components of
   *   both vectors are multiplied by each other (for
   *   example, with two vectors a and b: a.x * b.x, a.y
   *   * b.y, a.z * b.z). The static version of this
   *   method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   function as an array. See the examples for more
   *   context.
   *   @param x The number to multiply with the x
   *   component of the vector
   *   @param y The number to multiply with the y
   *   component of the vector
   *   @param [z] The number to multiply with the z
   *   component of the vector
   *   @return The resulting new p5.Vector
   */
  static mult(x: number, y: number, z?: number): Vector;

  /**
   *   Multiplies the vector by a scalar, multiplies the
   *   x, y, and z components from a vector, or
   *   multiplies the x, y, and z components of two
   *   independent vectors. When multiplying a vector by
   *   a scalar, the x, y, and z components of the vector
   *   are all multiplied by the scalar. When multiplying
   *   a vector by a vector, the x, y, z components of
   *   both vectors are multiplied by each other (for
   *   example, with two vectors a and b: a.x * b.x, a.y
   *   * b.y, a.z * b.z). The static version of this
   *   method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   function as an array. See the examples for more
   *   context.
   *   @param v The vector to multiply with the
   *   components of the original vector
   *   @param n The number to multiply with the vector
   *   @param [target] the vector to receive the result
   */
  static mult(v: Vector, n: number, target?: Vector): void;

  /**
   *   Multiplies the vector by a scalar, multiplies the
   *   x, y, and z components from a vector, or
   *   multiplies the x, y, and z components of two
   *   independent vectors. When multiplying a vector by
   *   a scalar, the x, y, and z components of the vector
   *   are all multiplied by the scalar. When multiplying
   *   a vector by a vector, the x, y, z components of
   *   both vectors are multiplied by each other (for
   *   example, with two vectors a and b: a.x * b.x, a.y
   *   * b.y, a.z * b.z). The static version of this
   *   method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   function as an array. See the examples for more
   *   context.
   *   @param [target] the vector to receive the result
   */
  static mult(v0: Vector, v1: Vector, target?: Vector): void;

  /**
   *   Multiplies the vector by a scalar, multiplies the
   *   x, y, and z components from a vector, or
   *   multiplies the x, y, and z components of two
   *   independent vectors. When multiplying a vector by
   *   a scalar, the x, y, and z components of the vector
   *   are all multiplied by the scalar. When multiplying
   *   a vector by a vector, the x, y, z components of
   *   both vectors are multiplied by each other (for
   *   example, with two vectors a and b: a.x * b.x, a.y
   *   * b.y, a.z * b.z). The static version of this
   *   method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   function as an array. See the examples for more
   *   context.
   *   @param arr The array to multiply with the
   *   components of the vector
   *   @param [target] the vector to receive the result
   */
  static mult(v0: Vector, arr: number[], target?: Vector): void;

  /**
   *   Divides the vector by a scalar, divides a vector
   *   by the x, y, and z arguments, or divides the x, y,
   *   and z components of two vectors against each
   *   other. When dividing a vector by a scalar, the x,
   *   y, and z components of the vector are all divided
   *   by the scalar. When dividing a vector by a vector,
   *   the x, y, z components of the source vector are
   *   treated as the dividend, and the x, y, z
   *   components of the argument is treated as the
   *   divisor. (For example, with two vectors a and b:
   *   a.x / b.x, a.y / b.y, a.z / b.z.) If any component
   *   of the second vector is 0, a division by 0 error
   *   will be logged, unless both two vectors have 0 in
   *   their z components, in which case only the x and y
   *   components will be divided. The static version of
   *   this method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param x The number to divide with the x component
   *   of the vector
   *   @param y The number to divide with the y component
   *   of the vector
   *   @param [z] The number to divide with the z
   *   component of the vector
   *   @return The resulting new p5.Vector
   */
  static div(x: number, y: number, z?: number): Vector;

  /**
   *   Divides the vector by a scalar, divides a vector
   *   by the x, y, and z arguments, or divides the x, y,
   *   and z components of two vectors against each
   *   other. When dividing a vector by a scalar, the x,
   *   y, and z components of the vector are all divided
   *   by the scalar. When dividing a vector by a vector,
   *   the x, y, z components of the source vector are
   *   treated as the dividend, and the x, y, z
   *   components of the argument is treated as the
   *   divisor. (For example, with two vectors a and b:
   *   a.x / b.x, a.y / b.y, a.z / b.z.) If any component
   *   of the second vector is 0, a division by 0 error
   *   will be logged, unless both two vectors have 0 in
   *   their z components, in which case only the x and y
   *   components will be divided. The static version of
   *   this method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param v The vector to divide the components of
   *   the original vector by
   *   @param n The number to divide the vector by
   *   @param [target] The vector to receive the result
   */
  static div(v: Vector, n: number, target?: Vector): void;

  /**
   *   Divides the vector by a scalar, divides a vector
   *   by the x, y, and z arguments, or divides the x, y,
   *   and z components of two vectors against each
   *   other. When dividing a vector by a scalar, the x,
   *   y, and z components of the vector are all divided
   *   by the scalar. When dividing a vector by a vector,
   *   the x, y, z components of the source vector are
   *   treated as the dividend, and the x, y, z
   *   components of the argument is treated as the
   *   divisor. (For example, with two vectors a and b:
   *   a.x / b.x, a.y / b.y, a.z / b.z.) If any component
   *   of the second vector is 0, a division by 0 error
   *   will be logged, unless both two vectors have 0 in
   *   their z components, in which case only the x and y
   *   components will be divided. The static version of
   *   this method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param [target] The vector to receive the result
   */
  static div(v0: Vector, v1: Vector, target?: Vector): void;

  /**
   *   Divides the vector by a scalar, divides a vector
   *   by the x, y, and z arguments, or divides the x, y,
   *   and z components of two vectors against each
   *   other. When dividing a vector by a scalar, the x,
   *   y, and z components of the vector are all divided
   *   by the scalar. When dividing a vector by a vector,
   *   the x, y, z components of the source vector are
   *   treated as the dividend, and the x, y, z
   *   components of the argument is treated as the
   *   divisor. (For example, with two vectors a and b:
   *   a.x / b.x, a.y / b.y, a.z / b.z.) If any component
   *   of the second vector is 0, a division by 0 error
   *   will be logged, unless both two vectors have 0 in
   *   their z components, in which case only the x and y
   *   components will be divided. The static version of
   *   this method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param arr The array to divide the components of
   *   the vector by
   *   @param [target] The vector to receive the result
   */
  static div(v0: Vector, arr: number[], target?: Vector): void;

  /**
   *   Calculates the magnitude (length) of the vector
   *   and returns the result as a float. (This is simply
   *   the equation sqrt(x*x + y*y + z*z).)
   *   @param vecT The vector to return the magnitude of
   *   @return The magnitude of vecT
   */
  static mag(vecT: Vector): number;

  /**
   *   Calculates the squared magnitude of the vector and
   *   returns the result as a float. (This is simply the
   *   equation x*x + y*y + z*z.) Faster if the real
   *   length is not required in the case of comparing
   *   vectors, etc.
   *   @param vecT the vector to return the squared
   *   magnitude of
   *   @return the squared magnitude of vecT
   */
  static magSq(vecT: Vector): number;

  /**
   *   Calculates the dot product of two vectors. The
   *   version of the method that computes the dot
   *   product of two independent vectors is a static
   *   method. See the examples for more context.
   *   @param v1 The first p5.Vector
   *   @param v2 The second p5.Vector
   *   @return The dot product
   */
  static dot(v1: Vector, v2: Vector): number;

  /**
   *   Calculates and returns a vector composed of the
   *   cross product between two vectors. Both the static
   *   and non-static methods return a new p5.Vector. See
   *   the examples for more context.
   *   @param v1 The first p5.Vector
   *   @param v2 The second p5.Vector
   *   @return The cross product
   */
  static cross(v1: Vector, v2: Vector): number;

  /**
   *   Calculates the Euclidean distance between two
   *   points (considering a point as a vector object).
   *   If you are looking to calculate distance between 2
   *   points see dist()
   *   @param v1 The first p5.Vector
   *   @param v2 The second p5.Vector
   *   @return The distance
   */
  static dist(v1: Vector, v2: Vector): number;

  /**
   *   Normalize the vector to length 1 (make it a unit
   *   vector).
   *   @param v The vector to normalize
   *   @param [target] The vector to receive the result
   *   @return The vector v, normalized to a length of 1
   */
  static normalize(v: Vector, target?: Vector): Vector;

  /**
   *   Limit the magnitude of this vector to the value
   *   used for the max parameter.
   *   @param v the vector to limit
   *   @param max The maximum magnitude for the vector
   *   @param [target] the vector to receive the result
   *   (Optional)
   *   @return v with a magnitude limited to max
   */
  static limit(v: Vector, max: number, target?: Vector): Vector;

  /**
   *   Set the magnitude of this vector to the value used
   *   for the len parameter.
   *   @param v the vector to set the magnitude of
   *   @param len The new length for this vector
   *   @param [target] the vector to receive the result
   *   (Optional)
   *   @return v with a magnitude set to len
   */
  static setMag(v: Vector, len: number, target?: Vector): Vector;

  /**
   *   Calculate the angle of rotation for this vector
   *   (only 2D vectors). p5.Vectors created using
   *   createVector() will take the current angleMode()
   *   into consideration, and give the angle in radians
   *   or degrees accordingly.
   *   @param v the vector to find the angle of
   *   @return the angle of rotation
   */
  static heading(v: Vector): number;

  /**
   *   Rotate the vector by an angle (only 2D vectors);
   *   magnitude remains the same.
   *   @param angle The angle of rotation
   *   @param [target] The vector to receive the result
   */
  static rotate(v: Vector, angle: number, target?: Vector): void;

  /**
   *   Calculates and returns the angle between two
   *   vectors. This method will take the current
   *   angleMode into consideration, and give the angle
   *   in radians or degrees accordingly.
   *   @param v1 the first vector
   *   @param v2 the second vector
   *   @return the angle between the two vectors
   */
  static angleBetween(v1: Vector, v2: Vector): number;

  /**
   *   Linear interpolate the vector to another vector.
   *   @param amt The amount of interpolation; some value
   *   between 0.0 (old vector) and 1.0 (new vector). 0.9
   *   is very near the new vector. 0.5 is halfway in
   *   between.
   *   @param [target] The vector to receive the result
   *   @return The lerped value
   */
  static lerp(v1: Vector, v2: Vector, amt: number, target?: Vector): Vector;

  /**
   *   Performs spherical linear interpolation with the
   *   other vector and returns the resulting vector.
   *   This works in both 3D and 2D. As for 2D, the
   *   result of slerping between 2D vectors is always a
   *   2D vector.
   *   @param v1 old vector
   *   @param v2 new vectpr
   *   @param amt The amount of interpolation. some value
   *   between 0.0 (old vector) and 1.0 (new vector). 0.9
   *   is very near the new vector. 0.5 is halfway in
   *   between.
   *   @param [target] The vector to receive the result
   *   @return slerped vector between v1 and v2
   */
  static slerp(v1: Vector, v2: Vector, amt: number, target?: Vector): Vector;

  /**
   *   Reflect a vector about a normal to a line in 2D,
   *   or about a normal to a plane in 3D.
   *   @param incidentVector vector to be reflected
   *   @param surfaceNormal the p5.Vector to reflect
   *   about.
   *   @param [target] the vector to receive the result
   *   (Optional)
   *   @return the reflected vector
   */
  static reflect(incidentVector: Vector, surfaceNormal: Vector, target?: Vector): Vector;

  /**
   *   Return a representation of this vector as a float
   *   array. This is only for temporary use. If used in
   *   any other fashion, the contents should be copied
   *   by using the p5.Vector.copy() method to copy into
   *   your own vector.
   *   @param v the vector to convert to an array
   *   @return an Array with the 3 values
   */
  static array(v: Vector): number[];

  /**
   *   Equality check against a p5.Vector.
   *   @param v1 the first vector to compare
   *   @param v2 the second vector to compare
   */
  static equals(v1: Vector | any[], v2: Vector | any[]): boolean;

  /**
   *   Make a new 2D vector from an angle.
   *   @param angle The desired angle, in radians
   *   (unaffected by angleMode)
   *   @param [length] The length of the new vector
   *   (defaults to 1)
   *   @return The new p5.Vector object
   */
  static fromAngle(angle: number, length?: number): Vector;

  /**
   *   Make a new 3D vector from a pair of ISO spherical
   *   angles.
   *   @param theta The polar angle, in radians (zero is
   *   up)
   *   @param phi The azimuthal angle, in radians (zero
   *   is out of the screen)
   *   @param [length] The length of the new vector
   *   (defaults to 1)
   *   @return A new p5.Vector object
   */
  static fromAngles(theta: number, phi: number, length?: number): Vector;

  /**
   *   Make a new 2D unit vector from a random angle.
   *   @return A new p5.Vector object
   */
  static random2D(): Vector;

  /**
   *   Make a new random 3D unit vector.
   *   @return A new p5.Vector object
   */
  static random3D(): Vector;

  /**
   *   Returns a string representation of a vector v by
   *   calling String(v) or v.toString(). This method is
   *   useful for logging vectors in the console.
   */
  toString(): string;

  /**
   *   Sets the x, y, and z components of the vector
   *   using two or three separate variables, the data
   *   from a p5.Vector, or the values from a float
   *   array.
   *   @param [x] The x component of the vector
   *   @param [y] The y component of the vector
   *   @param [z] The z component of the vector
   *   @chainable
   */
  set(x?: number, y?: number, z?: number): Vector;

  /**
   *   Sets the x, y, and z components of the vector
   *   using two or three separate variables, the data
   *   from a p5.Vector, or the values from a float
   *   array.
   *   @param value The vector to set
   *   @chainable
   */
  set(value: Vector | number[]): Vector;

  /**
   *   Gets a copy of the vector, returns a p5.Vector
   *   object.
   *   @return A copy of the p5.Vector object
   */
  copy(): Vector;

  /**
   *   Adds x, y, and z components to a vector, adds one
   *   vector to another, or adds two independent vectors
   *   together. The version of the method that adds two
   *   vectors together is a static method and returns a
   *   p5.Vector, the others act directly on the vector.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param x The x component of the vector to be added
   *   @param [y] The y component of the vector to be
   *   added
   *   @param [z] The z component of the vector to be
   *   added
   *   @chainable
   */
  add(x: number, y?: number, z?: number): Vector;

  /**
   *   Adds x, y, and z components to a vector, adds one
   *   vector to another, or adds two independent vectors
   *   together. The version of the method that adds two
   *   vectors together is a static method and returns a
   *   p5.Vector, the others act directly on the vector.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param value The vector to add
   *   @chainable
   */
  add(value: Vector | number[]): Vector;

  /**
   *   Gives the remainder of a vector when it is divided
   *   by another vector. See examples for more context.
   *   @param x The x component of divisor vector
   *   @param y The y component of divisor vector
   *   @param z The z component of divisor vector
   *   @chainable
   */
  rem(x: number, y: number, z: number): Vector;

  /**
   *   Gives the remainder of a vector when it is divided
   *   by another vector. See examples for more context.
   *   @param value The divisor vector
   *   @chainable
   */
  rem(value: Vector | number[]): Vector;

  /**
   *   Subtracts x, y, and z components from a vector,
   *   subtracts one vector from another, or subtracts
   *   two independent vectors. The version of the method
   *   that subtracts two vectors is a static method and
   *   returns a p5.Vector, the others act directly on
   *   the vector. Additionally, you may provide
   *   arguments to this method as an array. See the
   *   examples for more context.
   *   @param x The x component of the vector to subtract
   *   @param [y] The y component of the vector to
   *   subtract
   *   @param [z] The z component of the vector to
   *   subtract
   *   @chainable
   */
  sub(x: number, y?: number, z?: number): Vector;

  /**
   *   Subtracts x, y, and z components from a vector,
   *   subtracts one vector from another, or subtracts
   *   two independent vectors. The version of the method
   *   that subtracts two vectors is a static method and
   *   returns a p5.Vector, the others act directly on
   *   the vector. Additionally, you may provide
   *   arguments to this method as an array. See the
   *   examples for more context.
   *   @param value the vector to subtract
   *   @chainable
   */
  sub(value: Vector | number[]): Vector;

  /**
   *   Multiplies the vector by a scalar, multiplies the
   *   x, y, and z components from a vector, or
   *   multiplies the x, y, and z components of two
   *   independent vectors. When multiplying a vector by
   *   a scalar, the x, y, and z components of the vector
   *   are all multiplied by the scalar. When multiplying
   *   a vector by a vector, the x, y, z components of
   *   both vectors are multiplied by each other (for
   *   example, with two vectors a and b: a.x * b.x, a.y
   *   * b.y, a.z * b.z). The static version of this
   *   method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   function as an array. See the examples for more
   *   context.
   *   @param n The number to multiply with the vector
   *   @chainable
   */
  mult(n: number): Vector;

  /**
   *   Multiplies the vector by a scalar, multiplies the
   *   x, y, and z components from a vector, or
   *   multiplies the x, y, and z components of two
   *   independent vectors. When multiplying a vector by
   *   a scalar, the x, y, and z components of the vector
   *   are all multiplied by the scalar. When multiplying
   *   a vector by a vector, the x, y, z components of
   *   both vectors are multiplied by each other (for
   *   example, with two vectors a and b: a.x * b.x, a.y
   *   * b.y, a.z * b.z). The static version of this
   *   method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   function as an array. See the examples for more
   *   context.
   *   @param x The number to multiply with the x
   *   component of the vector
   *   @param y The number to multiply with the y
   *   component of the vector
   *   @param [z] The number to multiply with the z
   *   component of the vector
   *   @chainable
   */
  mult(x: number, y: number, z?: number): Vector;

  /**
   *   Multiplies the vector by a scalar, multiplies the
   *   x, y, and z components from a vector, or
   *   multiplies the x, y, and z components of two
   *   independent vectors. When multiplying a vector by
   *   a scalar, the x, y, and z components of the vector
   *   are all multiplied by the scalar. When multiplying
   *   a vector by a vector, the x, y, z components of
   *   both vectors are multiplied by each other (for
   *   example, with two vectors a and b: a.x * b.x, a.y
   *   * b.y, a.z * b.z). The static version of this
   *   method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   function as an array. See the examples for more
   *   context.
   *   @param arr The array to multiply with the
   *   components of the vector
   *   @chainable
   */
  mult(arr: number[]): Vector;

  /**
   *   Multiplies the vector by a scalar, multiplies the
   *   x, y, and z components from a vector, or
   *   multiplies the x, y, and z components of two
   *   independent vectors. When multiplying a vector by
   *   a scalar, the x, y, and z components of the vector
   *   are all multiplied by the scalar. When multiplying
   *   a vector by a vector, the x, y, z components of
   *   both vectors are multiplied by each other (for
   *   example, with two vectors a and b: a.x * b.x, a.y
   *   * b.y, a.z * b.z). The static version of this
   *   method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   function as an array. See the examples for more
   *   context.
   *   @param v The vector to multiply with the
   *   components of the original vector
   *   @chainable
   */
  mult(v: Vector): Vector;

  /**
   *   Divides the vector by a scalar, divides a vector
   *   by the x, y, and z arguments, or divides the x, y,
   *   and z components of two vectors against each
   *   other. When dividing a vector by a scalar, the x,
   *   y, and z components of the vector are all divided
   *   by the scalar. When dividing a vector by a vector,
   *   the x, y, z components of the source vector are
   *   treated as the dividend, and the x, y, z
   *   components of the argument is treated as the
   *   divisor. (For example, with two vectors a and b:
   *   a.x / b.x, a.y / b.y, a.z / b.z.) If any component
   *   of the second vector is 0, a division by 0 error
   *   will be logged, unless both two vectors have 0 in
   *   their z components, in which case only the x and y
   *   components will be divided. The static version of
   *   this method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param n The number to divide the vector by
   *   @chainable
   */
  div(n: number): Vector;

  /**
   *   Divides the vector by a scalar, divides a vector
   *   by the x, y, and z arguments, or divides the x, y,
   *   and z components of two vectors against each
   *   other. When dividing a vector by a scalar, the x,
   *   y, and z components of the vector are all divided
   *   by the scalar. When dividing a vector by a vector,
   *   the x, y, z components of the source vector are
   *   treated as the dividend, and the x, y, z
   *   components of the argument is treated as the
   *   divisor. (For example, with two vectors a and b:
   *   a.x / b.x, a.y / b.y, a.z / b.z.) If any component
   *   of the second vector is 0, a division by 0 error
   *   will be logged, unless both two vectors have 0 in
   *   their z components, in which case only the x and y
   *   components will be divided. The static version of
   *   this method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param x The number to divide with the x component
   *   of the vector
   *   @param y The number to divide with the y component
   *   of the vector
   *   @param [z] The number to divide with the z
   *   component of the vector
   *   @chainable
   */
  div(x: number, y: number, z?: number): Vector;

  /**
   *   Divides the vector by a scalar, divides a vector
   *   by the x, y, and z arguments, or divides the x, y,
   *   and z components of two vectors against each
   *   other. When dividing a vector by a scalar, the x,
   *   y, and z components of the vector are all divided
   *   by the scalar. When dividing a vector by a vector,
   *   the x, y, z components of the source vector are
   *   treated as the dividend, and the x, y, z
   *   components of the argument is treated as the
   *   divisor. (For example, with two vectors a and b:
   *   a.x / b.x, a.y / b.y, a.z / b.z.) If any component
   *   of the second vector is 0, a division by 0 error
   *   will be logged, unless both two vectors have 0 in
   *   their z components, in which case only the x and y
   *   components will be divided. The static version of
   *   this method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param arr The array to divide the components of
   *   the vector by
   *   @chainable
   */
  div(arr: number[]): Vector;

  /**
   *   Divides the vector by a scalar, divides a vector
   *   by the x, y, and z arguments, or divides the x, y,
   *   and z components of two vectors against each
   *   other. When dividing a vector by a scalar, the x,
   *   y, and z components of the vector are all divided
   *   by the scalar. When dividing a vector by a vector,
   *   the x, y, z components of the source vector are
   *   treated as the dividend, and the x, y, z
   *   components of the argument is treated as the
   *   divisor. (For example, with two vectors a and b:
   *   a.x / b.x, a.y / b.y, a.z / b.z.) If any component
   *   of the second vector is 0, a division by 0 error
   *   will be logged, unless both two vectors have 0 in
   *   their z components, in which case only the x and y
   *   components will be divided. The static version of
   *   this method creates a new p5.Vector while the
   *   non-static version acts on the vector directly.
   *   Additionally, you may provide arguments to this
   *   method as an array. See the examples for more
   *   context.
   *   @param v The vector to divide the components of
   *   the original vector by
   *   @chainable
   */
  div(v: Vector): Vector;

  /**
   *   Calculates the magnitude (length) of the vector
   *   and returns the result as a float. (This is simply
   *   the equation sqrt(x*x + y*y + z*z).)
   *   @return The magnitude of the vector
   */
  mag(): number;

  /**
   *   Calculates the squared magnitude of the vector and
   *   returns the result as a float. (This is simply the
   *   equation x*x + y*y + z*z.) Faster if the real
   *   length is not required in the case of comparing
   *   vectors, etc.
   *   @return The squared magnitude of the vector
   */
  magSq(): number;

  /**
   *   Calculates the dot product of two vectors. The
   *   version of the method that computes the dot
   *   product of two independent vectors is a static
   *   method. See the examples for more context.
   *   @param x The x component of the vector
   *   @param [y] The y component of the vector
   *   @param [z] The z component of the vector
   *   @return The dot product
   */
  dot(x: number, y?: number, z?: number): number;

  /**
   *   Calculates the dot product of two vectors. The
   *   version of the method that computes the dot
   *   product of two independent vectors is a static
   *   method. See the examples for more context.
   *   @param value value component of the vector or a
   *   p5.Vector
   */
  dot(value: Vector): number;

  /**
   *   Calculates and returns a vector composed of the
   *   cross product between two vectors. Both the static
   *   and non-static methods return a new p5.Vector. See
   *   the examples for more context.
   *   @param v p5.Vector to be crossed
   *   @return p5.Vector composed of cross product
   */
  cross(v: Vector): Vector;

  /**
   *   Calculates the Euclidean distance between two
   *   points (considering a point as a vector object).
   *   If you are looking to calculate distance between 2
   *   points see dist()
   *   @param v The x, y, and z coordinates of a
   *   p5.Vector
   *   @return The distance
   */
  dist(v: Vector): number;

  /**
   *   Normalize the vector to length 1 (make it a unit
   *   vector).
   *   @return The normalized p5.Vector
   */
  normalize(): Vector;

  /**
   *   Limit the magnitude of this vector to the value
   *   used for the max parameter.
   *   @param max The maximum magnitude for the vector
   *   @chainable
   */
  limit(max: number): Vector;

  /**
   *   Set the magnitude of this vector to the value used
   *   for the len parameter.
   *   @param len The new length for this vector
   *   @chainable
   */
  setMag(len: number): Vector;

  /**
   *   Calculate the angle of rotation for this vector
   *   (only 2D vectors). p5.Vectors created using
   *   createVector() will take the current angleMode()
   *   into consideration, and give the angle in radians
   *   or degrees accordingly.
   *   @return The angle of rotation
   */
  heading(): number;

  /**
   *   Rotate the vector to a specific angle (only 2D
   *   vectors); magnitude remains the same.
   *   @param angle The angle of rotation
   *   @chainable
   */
  setHeading(angle: number): Vector;

  /**
   *   Rotate the vector by an angle (only 2D vectors);
   *   magnitude remains the same.
   *   @param angle The angle of rotation
   *   @chainable
   */
  rotate(angle: number): Vector;

  /**
   *   Calculates and returns the angle between two
   *   vectors. This method will take the current
   *   angleMode into consideration, and give the angle
   *   in radians or degrees accordingly.
   *   @param value The x, y, and z components of a
   *   p5.Vector
   *   @return The angle between
   */
  angleBetween(value: Vector): number;

  /**
   *   Linear interpolate the vector to another vector.
   *   @param x The x component
   *   @param y The y component
   *   @param z The z component
   *   @param amt The amount of interpolation; some value
   *   between 0.0 (old vector) and 1.0 (new vector). 0.9
   *   is very near the new vector. 0.5 is halfway in
   *   between.
   *   @chainable
   */
  lerp(x: number, y: number, z: number, amt: number): Vector;

  /**
   *   Linear interpolate the vector to another vector.
   *   @param v The p5.Vector to lerp to
   *   @param amt The amount of interpolation; some value
   *   between 0.0 (old vector) and 1.0 (new vector). 0.9
   *   is very near the new vector. 0.5 is halfway in
   *   between.
   *   @chainable
   */
  lerp(v: Vector, amt: number): Vector;

  /**
   *   Performs spherical linear interpolation with the
   *   other vector and returns the resulting vector.
   *   This works in both 3D and 2D. As for 2D, the
   *   result of slerping between 2D vectors is always a
   *   2D vector.
   *   @param v the p5.Vector to slerp to
   *   @param amt The amount of interpolation. some value
   *   between 0.0 (old vector) and 1.0 (new vector). 0.9
   *   is very near the new vector. 0.5 is halfway in
   *   between.
   */
  slerp(v: Vector, amt: number): Vector;

  /**
   *   Reflect a vector about a normal to a line in 2D,
   *   or about a normal to a plane in 3D.
   *   @param surfaceNormal the p5.Vector to reflect
   *   about.
   *   @chainable
   */
  reflect(surfaceNormal: Vector): Vector;

  /**
   *   Return a representation of this vector as a float
   *   array. This is only for temporary use. If used in
   *   any other fashion, the contents should be copied
   *   by using the p5.Vector.copy() method to copy into
   *   your own vector.
   *   @return An Array with the 3 values
   */
  array(): number[];

  /**
   *   Equality check against a p5.Vector.
   *   @param [x] The x component of the vector
   *   @param [y] The y component of the vector
   *   @param [z] The z component of the vector
   *   @return Whether the vectors are equal
   */
  equals(x?: number, y?: number, z?: number): boolean;

  /**
   *   Equality check against a p5.Vector.
   *   @param value The vector to compare
   */
  equals(value: Vector | any[]): boolean;

  /**
   *   The x component of the vector
   */
  x: number;

  /**
   *   The y component of the vector
   */
  y: number;

  /**
   *   The z component of the vector
   */
  z: number;
}


declare class p5 {
  /**
         *   Draws an arc to the canvas. Arcs are drawn along
         *   the outer edge of an ellipse (oval) defined by the
         *   x, y, w, and h parameters. Use the start and stop
         *   parameters to specify the angles (in radians) at
         *   which to draw the arc. Arcs are always drawn
         *   clockwise from start to stop. The origin of the
         *   arc's ellipse may be changed with the
         *   ellipseMode() function. The optional mode
         *   parameter determines the arc's fill style. The
         *   fill modes are a semi-circle (OPEN), a closed
         *   semi-circle (CHORD), or a closed pie segment
         *   (PIE).
         *   @param x x-coordinate of the arc's ellipse.
         *   @param y y-coordinate of the arc's ellipse.
         *   @param w width of the arc's ellipse by default.
         *   @param h height of the arc's ellipse by default.
         *   @param start angle to start the arc, specified in
         *   radians.
         *   @param stop angle to stop the arc, specified in
         *   radians.
         *   @param [mode] optional parameter to determine the
         *   way of drawing the arc. either CHORD, PIE, or
         *   OPEN.
         *   @param [detail] optional parameter for WebGL mode
         *   only. This is to specify the number of vertices
         *   that makes up the perimeter of the arc. Default
         *   value is 25. Won't draw a stroke for a detail of
         *   more than 50.
         *   @chainable
         */
  arc(
    x: number,
    y: number,
    w: number,
    h: number,
    start: number,
    stop: number,
    mode?: ARC_MODE,
    detail?: number
  ): p5;

  /**
   *   Draws an ellipse (oval) to the canvas. An ellipse
   *   with equal width and height is a circle. By
   *   default, the first two parameters set the location
   *   of the center of the ellipse. The third and fourth
   *   parameters set the shape's width and height,
   *   respectively. The origin may be changed with the
   *   ellipseMode() function. If no height is specified,
   *   the value of width is used for both the width and
   *   height. If a negative height or width is
   *   specified, the absolute value is taken.
   *   @param x x-coordinate of the center of the
   *   ellipse.
   *   @param y y-coordinate of the center of the
   *   ellipse.
   *   @param w width of the ellipse.
   *   @param [h] height of the ellipse.
   *   @chainable
   */
  ellipse(x: number, y: number, w: number, h?: number): p5;

  /**
   *   Draws an ellipse (oval) to the canvas. An ellipse
   *   with equal width and height is a circle. By
   *   default, the first two parameters set the location
   *   of the center of the ellipse. The third and fourth
   *   parameters set the shape's width and height,
   *   respectively. The origin may be changed with the
   *   ellipseMode() function. If no height is specified,
   *   the value of width is used for both the width and
   *   height. If a negative height or width is
   *   specified, the absolute value is taken.
   *   @param x x-coordinate of the center of the
   *   ellipse.
   *   @param y y-coordinate of the center of the
   *   ellipse.
   *   @param w width of the ellipse.
   *   @param h height of the ellipse.
   *   @param [detail] optional parameter for WebGL mode
   *   only. This is to specify the number of vertices
   *   that makes up the perimeter of the ellipse.
   *   Default value is 25. Won't draw a stroke for a
   *   detail of more than 50.
   */
  ellipse(x: number, y: number, w: number, h: number, detail?: number): void;

  /**
   *   Draws a circle to the canvas. A circle is a round
   *   shape. Every point on the edge of a circle is the
   *   same distance from its center. By default, the
   *   first two parameters set the location of the
   *   center of the circle. The third parameter sets the
   *   shape's width and height (diameter). The origin
   *   may be changed with the ellipseMode() function.
   *   @param x x-coordinate of the center of the circle.
   *   @param y y-coordinate of the center of the circle.
   *   @param d diameter of the circle.
   *   @chainable
   */
  circle(x: number, y: number, d: number): p5;

  /**
   *   Draws a line, a straight path between two points.
   *   Its default width is one pixel. The version of
   *   line() with four parameters draws the line in 2D.
   *   To color a line, use the stroke() function. To
   *   change its width, use the strokeWeight() function.
   *   A line can't be filled, so the fill() function
   *   won't affect the color of a line. The version of
   *   line() with six parameters allows the line to be
   *   drawn in 3D space. Doing so requires adding the
   *   WEBGL argument to createCanvas().
   *   @param x1 the x-coordinate of the first point.
   *   @param y1 the y-coordinate of the first point.
   *   @param x2 the x-coordinate of the second point.
   *   @param y2 the y-coordinate of the second point.
   *   @chainable
   */
  line(x1: number, y1: number, x2: number, y2: number): p5;

  /**
   *   Draws a line, a straight path between two points.
   *   Its default width is one pixel. The version of
   *   line() with four parameters draws the line in 2D.
   *   To color a line, use the stroke() function. To
   *   change its width, use the strokeWeight() function.
   *   A line can't be filled, so the fill() function
   *   won't affect the color of a line. The version of
   *   line() with six parameters allows the line to be
   *   drawn in 3D space. Doing so requires adding the
   *   WEBGL argument to createCanvas().
   *   @param x1 the x-coordinate of the first point.
   *   @param y1 the y-coordinate of the first point.
   *   @param z1 the z-coordinate of the first point.
   *   @param x2 the x-coordinate of the second point.
   *   @param y2 the y-coordinate of the second point.
   *   @param z2 the z-coordinate of the second point.
   *   @chainable
   */
  line(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): p5;

  /**
   *   Draws a point, a single coordinate in space. Its
   *   default size is one pixel. The first two
   *   parameters are the point's x- and y-coordinates,
   *   respectively. To color a point, use the stroke()
   *   function. To change its size, use the
   *   strokeWeight() function. The version of point()
   *   with three parameters allows the point to be drawn
   *   in 3D space. Doing so requires adding the WEBGL
   *   argument to createCanvas().
   *
   *   The version of point() with one parameter allows
   *   the point's location to be set with a p5.Vector
   *   object.
   *   @param x the x-coordinate.
   *   @param y the y-coordinate.
   *   @param [z] the z-coordinate (for WebGL mode).
   *   @chainable
   */
  point(x: number, y: number, z?: number): p5;

  /**
   *   Draws a point, a single coordinate in space. Its
   *   default size is one pixel. The first two
   *   parameters are the point's x- and y-coordinates,
   *   respectively. To color a point, use the stroke()
   *   function. To change its size, use the
   *   strokeWeight() function. The version of point()
   *   with three parameters allows the point to be drawn
   *   in 3D space. Doing so requires adding the WEBGL
   *   argument to createCanvas().
   *
   *   The version of point() with one parameter allows
   *   the point's location to be set with a p5.Vector
   *   object.
   *   @param coordinateVector the coordinate vector.
   *   @chainable
   */
  point(coordinateVector: Vector): p5;

  /**
   *   Draws a quad to the canvas. A quad is a
   *   quadrilateral, a four-sided polygon. Some examples
   *   of quads include rectangles, squares, rhombuses,
   *   and trapezoids. The first pair of parameters
   *   (x1,y1) sets the quad's first point. The following
   *   pairs of parameters set the coordinates for its
   *   next three points. Parameters should proceed
   *   clockwise or counter-clockwise around the shape.
   *   The version of quad() with twelve parameters
   *   allows the quad to be drawn in 3D space. Doing so
   *   requires adding the WEBGL argument to
   *   createCanvas().
   *   @param x1 the x-coordinate of the first point.
   *   @param y1 the y-coordinate of the first point.
   *   @param x2 the x-coordinate of the second point.
   *   @param y2 the y-coordinate of the second point.
   *   @param x3 the x-coordinate of the third point.
   *   @param y3 the y-coordinate of the third point.
   *   @param x4 the x-coordinate of the fourth point.
   *   @param y4 the y-coordinate of the fourth point.
   *   @param [detailX] number of segments in the
   *   x-direction.
   *   @param [detailY] number of segments in the
   *   y-direction.
   *   @chainable
   */
  quad(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number,
    detailX?: number,
    detailY?: number
  ): p5;

  /**
   *   Draws a quad to the canvas. A quad is a
   *   quadrilateral, a four-sided polygon. Some examples
   *   of quads include rectangles, squares, rhombuses,
   *   and trapezoids. The first pair of parameters
   *   (x1,y1) sets the quad's first point. The following
   *   pairs of parameters set the coordinates for its
   *   next three points. Parameters should proceed
   *   clockwise or counter-clockwise around the shape.
   *   The version of quad() with twelve parameters
   *   allows the quad to be drawn in 3D space. Doing so
   *   requires adding the WEBGL argument to
   *   createCanvas().
   *   @param x1 the x-coordinate of the first point.
   *   @param y1 the y-coordinate of the first point.
   *   @param z1 the z-coordinate of the first point.
   *   @param x2 the x-coordinate of the second point.
   *   @param y2 the y-coordinate of the second point.
   *   @param z2 the z-coordinate of the second point.
   *   @param x3 the x-coordinate of the third point.
   *   @param y3 the y-coordinate of the third point.
   *   @param z3 the z-coordinate of the third point.
   *   @param x4 the x-coordinate of the fourth point.
   *   @param y4 the y-coordinate of the fourth point.
   *   @param z4 the z-coordinate of the fourth point.
   *   @param [detailX] number of segments in the
   *   x-direction.
   *   @param [detailY] number of segments in the
   *   y-direction.
   *   @chainable
   */
  quad(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    x3: number,
    y3: number,
    z3: number,
    x4: number,
    y4: number,
    z4: number,
    detailX?: number,
    detailY?: number
  ): p5;

  /**
   *   Draws a rectangle to the canvas. A rectangle is a
   *   four-sided polygon with every angle at ninety
   *   degrees. By default, the first two parameters set
   *   the location of the rectangle's upper-left corner.
   *   The third and fourth set the shape's the width and
   *   height, respectively. The way these parameters are
   *   interpreted may be changed with the rectMode()
   *   function. The version of rect() with five
   *   parameters creates a rounded rectangle. The fifth
   *   parameter is used as the radius value for all four
   *   corners.
   *
   *   The version of rect() with eight parameters also
   *   creates a rounded rectangle. When using eight
   *   parameters, the latter four set the radius of the
   *   arc at each corner separately. The radii start
   *   with the top-left corner and move clockwise around
   *   the rectangle. If any of these parameters are
   *   omitted, they are set to the value of the last
   *   specified corner radius.
   *   @param x x-coordinate of the rectangle.
   *   @param y y-coordinate of the rectangle.
   *   @param w width of the rectangle.
   *   @param [h] height of the rectangle.
   *   @param [tl] optional radius of top-left corner.
   *   @param [tr] optional radius of top-right corner.
   *   @param [br] optional radius of bottom-right
   *   corner.
   *   @param [bl] optional radius of bottom-left corner.
   *   @chainable
   */
  rect(x: number, y: number, w: number, h?: number, tl?: number, tr?: number, br?: number, bl?: number): p5;

  /**
   *   Draws a rectangle to the canvas. A rectangle is a
   *   four-sided polygon with every angle at ninety
   *   degrees. By default, the first two parameters set
   *   the location of the rectangle's upper-left corner.
   *   The third and fourth set the shape's the width and
   *   height, respectively. The way these parameters are
   *   interpreted may be changed with the rectMode()
   *   function. The version of rect() with five
   *   parameters creates a rounded rectangle. The fifth
   *   parameter is used as the radius value for all four
   *   corners.
   *
   *   The version of rect() with eight parameters also
   *   creates a rounded rectangle. When using eight
   *   parameters, the latter four set the radius of the
   *   arc at each corner separately. The radii start
   *   with the top-left corner and move clockwise around
   *   the rectangle. If any of these parameters are
   *   omitted, they are set to the value of the last
   *   specified corner radius.
   *   @param x x-coordinate of the rectangle.
   *   @param y y-coordinate of the rectangle.
   *   @param w width of the rectangle.
   *   @param h height of the rectangle.
   *   @param [detailX] number of segments in the
   *   x-direction (for WebGL mode).
   *   @param [detailY] number of segments in the
   *   y-direction (for WebGL mode).
   *   @chainable
   */
  rect(x: number, y: number, w: number, h: number, detailX?: number, detailY?: number): p5;

  /**
   *   Draws a square to the canvas. A square is a
   *   four-sided polygon with every angle at ninety
   *   degrees and equal side lengths. By default, the
   *   first two parameters set the location of the
   *   square's upper-left corner. The third parameter
   *   sets its side size. The way these parameters are
   *   interpreted may be changed with the rectMode()
   *   function. The version of square() with four
   *   parameters creates a rounded square. The fourth
   *   parameter is used as the radius value for all four
   *   corners.
   *
   *   The version of square() with seven parameters also
   *   creates a rounded square. When using seven
   *   parameters, the latter four set the radius of the
   *   arc at each corner separately. The radii start
   *   with the top-left corner and move clockwise around
   *   the square. If any of these parameters are
   *   omitted, they are set to the value of the last
   *   specified corner radius.
   *   @param x x-coordinate of the square.
   *   @param y y-coordinate of the square.
   *   @param s side size of the square.
   *   @param [tl] optional radius of top-left corner.
   *   @param [tr] optional radius of top-right corner.
   *   @param [br] optional radius of bottom-right
   *   corner.
   *   @param [bl] optional radius of bottom-left corner.
   *   @chainable
   */
  square(x: number, y: number, s: number, tl?: number, tr?: number, br?: number, bl?: number): p5;

  /**
   *   Draws a triangle to the canvas. A triangle is a
   *   three-sided polygon. The first two parameters
   *   specify the triangle's first point (x1,y1). The
   *   middle two parameters specify its second point
   *   (x2,y2). And the last two parameters specify its
   *   third point (x3, y3).
   *   @param x1 x-coordinate of the first point.
   *   @param y1 y-coordinate of the first point.
   *   @param x2 x-coordinate of the second point.
   *   @param y2 y-coordinate of the second point.
   *   @param x3 x-coordinate of the third point.
   *   @param y3 y-coordinate of the third point.
   *   @chainable
   */
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): p5;

  /**
         *   Draws a cubic Bezier curve on the screen. These
         *   curves are defined by a series of anchor and
         *   control points. The first two parameters specify
         *   the first anchor point and the last two parameters
         *   specify the other anchor point, which become the
         *   first and last points on the curve. The middle
         *   parameters specify the two control points which
         *   define the shape of the curve. Approximately
         *   speaking, control points "pull" the curve towards
         *   them. Bezier curves were developed by French
         *   automotive engineer Pierre Bezier, and are
         *   commonly used in computer graphics to define
         *   gently sloping curves. See also curve().
         *   @param x1 x-coordinate for the first anchor point
         *   @param y1 y-coordinate for the first anchor point
         *   @param x2 x-coordinate for the first control point
         *   @param y2 y-coordinate for the first control point
         *   @param x3 x-coordinate for the second control
         *   point
         *   @param y3 y-coordinate for the second control
         *   point
         *   @param x4 x-coordinate for the second anchor point
         *   @param y4 y-coordinate for the second anchor point
         *   @chainable
         */
  bezier(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): p5;

  /**
   *   Draws a cubic Bezier curve on the screen. These
   *   curves are defined by a series of anchor and
   *   control points. The first two parameters specify
   *   the first anchor point and the last two parameters
   *   specify the other anchor point, which become the
   *   first and last points on the curve. The middle
   *   parameters specify the two control points which
   *   define the shape of the curve. Approximately
   *   speaking, control points "pull" the curve towards
   *   them. Bezier curves were developed by French
   *   automotive engineer Pierre Bezier, and are
   *   commonly used in computer graphics to define
   *   gently sloping curves. See also curve().
   *   @param x1 x-coordinate for the first anchor point
   *   @param y1 y-coordinate for the first anchor point
   *   @param z1 z-coordinate for the first anchor point
   *   @param x2 x-coordinate for the first control point
   *   @param y2 y-coordinate for the first control point
   *   @param z2 z-coordinate for the first control point
   *   @param x3 x-coordinate for the second control
   *   point
   *   @param y3 y-coordinate for the second control
   *   point
   *   @param z3 z-coordinate for the second control
   *   point
   *   @param x4 x-coordinate for the second anchor point
   *   @param y4 y-coordinate for the second anchor point
   *   @param z4 z-coordinate for the second anchor point
   *   @chainable
   */
  bezier(
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      x3: number,
      y3: number,
      z3: number,
      x4: number,
      y4: number,
      z4: number
  ): p5;

  /**
   *   Sets the resolution at which Bezier's curve is
   *   displayed. The default value is 20. Note, This
   *   function is only useful when using the WEBGL
   *   renderer as the default canvas renderer does not
   *   use this information.
   *   @param detail resolution of the curves
   *   @chainable
   */
  bezierDetail(detail: number): p5;

  /**
   *   Given the x or y co-ordinate values of control and
   *   anchor points of a bezier curve, it evaluates the
   *   x or y coordinate of the bezier at position t. The
   *   parameters a and d are the x or y coordinates of
   *   first and last points on the curve while b and c
   *   are of the control points.The final parameter t is
   *   the position of the resultant point which is given
   *   between 0 and 1. This can be done once with the x
   *   coordinates and a second time with the y
   *   coordinates to get the location of a bezier curve
   *   at t.
   *   @param a coordinate of first point on the curve
   *   @param b coordinate of first control point
   *   @param c coordinate of second control point
   *   @param d coordinate of second point on the curve
   *   @param t value between 0 and 1
   *   @return the value of the Bezier at position t
   */
  bezierPoint(a: number, b: number, c: number, d: number, t: number): number;

  /**
   *   Evaluates the tangent to the Bezier at position t
   *   for points a, b, c, d. The parameters a and d are
   *   the first and last points on the curve, and b and
   *   c are the control points. The final parameter t
   *   varies between 0 and 1.
   *   @param a coordinate of first point on the curve
   *   @param b coordinate of first control point
   *   @param c coordinate of second control point
   *   @param d coordinate of second point on the curve
   *   @param t value between 0 and 1
   *   @return the tangent at position t
   */
  bezierTangent(a: number, b: number, c: number, d: number, t: number): number;

  /**
   *   Draws a curved line on the screen between two
   *   points, given as the middle four parameters. The
   *   first two parameters are a control point, as if
   *   the curve came from this point even though it's
   *   not drawn. The last two parameters similarly
   *   describe the other control point.  Longer curves
   *   can be created by putting a series of curve()
   *   functions together or using curveVertex(). An
   *   additional function called curveTightness()
   *   provides control for the visual quality of the
   *   curve. The curve() function is an implementation
   *   of Catmull-Rom splines.
   *   @param x1 x-coordinate for the beginning control
   *   point
   *   @param y1 y-coordinate for the beginning control
   *   point
   *   @param x2 x-coordinate for the first point
   *   @param y2 y-coordinate for the first point
   *   @param x3 x-coordinate for the second point
   *   @param y3 y-coordinate for the second point
   *   @param x4 x-coordinate for the ending control
   *   point
   *   @param y4 y-coordinate for the ending control
   *   point
   *   @chainable
   */
  curve(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): p5;

  /**
   *   Draws a curved line on the screen between two
   *   points, given as the middle four parameters. The
   *   first two parameters are a control point, as if
   *   the curve came from this point even though it's
   *   not drawn. The last two parameters similarly
   *   describe the other control point.  Longer curves
   *   can be created by putting a series of curve()
   *   functions together or using curveVertex(). An
   *   additional function called curveTightness()
   *   provides control for the visual quality of the
   *   curve. The curve() function is an implementation
   *   of Catmull-Rom splines.
   *   @param x1 x-coordinate for the beginning control
   *   point
   *   @param y1 y-coordinate for the beginning control
   *   point
   *   @param z1 z-coordinate for the beginning control
   *   point
   *   @param x2 x-coordinate for the first point
   *   @param y2 y-coordinate for the first point
   *   @param z2 z-coordinate for the first point
   *   @param x3 x-coordinate for the second point
   *   @param y3 y-coordinate for the second point
   *   @param z3 z-coordinate for the second point
   *   @param x4 x-coordinate for the ending control
   *   point
   *   @param y4 y-coordinate for the ending control
   *   point
   *   @param z4 z-coordinate for the ending control
   *   point
   *   @chainable
   */
  curve(
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      x3: number,
      y3: number,
      z3: number,
      x4: number,
      y4: number,
      z4: number
  ): p5;

  /**
   *   Sets the resolution at which curves display. The
   *   default value is 20 while the minimum value is 3.
   *   This function is only useful when using the WEBGL
   *   renderer as the default canvas renderer does not
   *   use this information.
   *   @param resolution resolution of the curves
   *   @chainable
   */
  curveDetail(resolution: number): p5;

  /**
   *   Modifies the quality of forms created with curve()
   *   and curveVertex().The parameter tightness
   *   determines how the curve fits to the vertex
   *   points. The value 0.0 is the default value for
   *   tightness (this value defines the curves to be
   *   Catmull-Rom splines) and the value 1.0 connects
   *   all the points with straight lines. Values within
   *   the range -5.0 and 5.0 will deform the curves but
   *   will leave them recognizable and as values
   *   increase in magnitude, they will continue to
   *   deform.
   *   @param amount amount of deformation from the
   *   original vertices
   *   @chainable
   */
  curveTightness(amount: number): p5;

  /**
   *   Evaluates the curve at position t for points a, b,
   *   c, d. The parameter t varies between 0 and 1, a
   *   and d are control points of the curve, and b and c
   *   are the start and end points of the curve. This
   *   can be done once with the x coordinates and a
   *   second time with the y coordinates to get the
   *   location of a curve at t.
   *   @param a coordinate of first control point of the
   *   curve
   *   @param b coordinate of first point
   *   @param c coordinate of second point
   *   @param d coordinate of second control point
   *   @param t value between 0 and 1
   *   @return Curve value at position t
   */
  curvePoint(a: number, b: number, c: number, d: number, t: number): number;

  /**
   *   Evaluates the tangent to the curve at position t
   *   for points a, b, c, d. The parameter t varies
   *   between 0 and 1, a and d are points on the curve,
   *   and b and c are the control points.
   *   @param a coordinate of first control point
   *   @param b coordinate of first point on the curve
   *   @param c coordinate of second point on the curve
   *   @param d coordinate of second conrol point
   *   @param t value between 0 and 1
   *   @return the tangent at position t
   */
  curveTangent(a: number, b: number, c: number, d: number, t: number): number;

  /**
         *   Use the beginContour() and endContour() functions
         *   to create negative shapes within shapes such as
         *   the center of the letter 'O'. beginContour()
         *   begins recording vertices for the shape and
         *   endContour() stops recording. The vertices that
         *   define a negative shape must "wind" in the
         *   opposite direction from the exterior shape. First
         *   draw vertices for the exterior clockwise order,
         *   then for internal shapes, draw vertices shape in
         *   counter-clockwise. These functions can only be
         *   used within a beginShape()/endShape() pair and
         *   transformations such as translate(), rotate(), and
         *   scale() do not work within a
         *   beginContour()/endContour() pair. It is also not
         *   possible to use other shapes, such as ellipse() or
         *   rect() within.
         *   @chainable
         */
  beginContour(): p5;

  /**
   *   Using the beginShape() and endShape() functions
   *   allow creating more complex forms. beginShape()
   *   begins recording vertices for a shape and
   *   endShape() stops recording. The value of the kind
   *   parameter tells it which types of shapes to create
   *   from the provided vertices. With no mode
   *   specified, the shape can be any irregular polygon.
   *   The parameters available for beginShape() are:
   *
   *   POINTS Draw a series of points
   *
   *   LINES Draw a series of unconnected line segments
   *   (individual lines)
   *
   *   TRIANGLES Draw a series of separate triangles
   *
   *   TRIANGLE_FAN Draw a series of connected triangles
   *   sharing the first vertex in a fan-like fashion
   *
   *   TRIANGLE_STRIP Draw a series of connected
   *   triangles in strip fashion
   *
   *   QUADS Draw a series of separate quads
   *
   *   QUAD_STRIP Draw quad strip using adjacent edges to
   *   form the next quad
   *
   *   TESS (WEBGL only) Handle irregular polygon for
   *   filling curve by explicit tessellation
   *
   *   After calling the beginShape() function, a series
   *   of vertex() commands must follow. To stop drawing
   *   the shape, call endShape(). Each shape will be
   *   outlined with the current stroke color and filled
   *   with the fill color.
   *
   *   Transformations such as translate(), rotate(), and
   *   scale() do not work within beginShape(). It is
   *   also not possible to use other shapes, such as
   *   ellipse() or rect() within beginShape().
   *   @param [kind] either POINTS, LINES, TRIANGLES,
   *   TRIANGLE_FAN TRIANGLE_STRIP, QUADS, QUAD_STRIP or
   *   TESS
   *   @chainable
   */
  beginShape(kind?: BEGIN_KIND): p5;

  /**
   *   Specifies vertex coordinates for Bezier curves.
   *   Each call to bezierVertex() defines the position
   *   of two control points and one anchor point of a
   *   Bezier curve, adding a new segment to a line or
   *   shape. For WebGL mode bezierVertex() can be used
   *   in 2D as well as 3D mode. 2D mode expects 6
   *   parameters, while 3D mode expects 9 parameters
   *   (including z coordinates). The first time
   *   bezierVertex() is used within a beginShape() call,
   *   it must be prefaced with a call to vertex() to set
   *   the first anchor point. This function must be used
   *   between beginShape() and endShape() and only when
   *   there is no MODE or POINTS parameter specified to
   *   beginShape().
   *   @param x2 x-coordinate for the first control point
   *   @param y2 y-coordinate for the first control point
   *   @param x3 x-coordinate for the second control
   *   point
   *   @param y3 y-coordinate for the second control
   *   point
   *   @param x4 x-coordinate for the anchor point
   *   @param y4 y-coordinate for the anchor point
   *   @chainable
   */
  bezierVertex(x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): p5;

  /**
   *   Specifies vertex coordinates for Bezier curves.
   *   Each call to bezierVertex() defines the position
   *   of two control points and one anchor point of a
   *   Bezier curve, adding a new segment to a line or
   *   shape. For WebGL mode bezierVertex() can be used
   *   in 2D as well as 3D mode. 2D mode expects 6
   *   parameters, while 3D mode expects 9 parameters
   *   (including z coordinates). The first time
   *   bezierVertex() is used within a beginShape() call,
   *   it must be prefaced with a call to vertex() to set
   *   the first anchor point. This function must be used
   *   between beginShape() and endShape() and only when
   *   there is no MODE or POINTS parameter specified to
   *   beginShape().
   *   @param x2 x-coordinate for the first control point
   *   @param y2 y-coordinate for the first control point
   *   @param z2 z-coordinate for the first control point
   *   (for WebGL mode)
   *   @param x3 x-coordinate for the second control
   *   point
   *   @param y3 y-coordinate for the second control
   *   point
   *   @param z3 z-coordinate for the second control
   *   point (for WebGL mode)
   *   @param x4 x-coordinate for the anchor point
   *   @param y4 y-coordinate for the anchor point
   *   @param z4 z-coordinate for the anchor point (for
   *   WebGL mode)
   *   @chainable
   */
  bezierVertex(
      x2: number,
      y2: number,
      z2: number,
      x3: number,
      y3: number,
      z3: number,
      x4: number,
      y4: number,
      z4: number
  ): p5;

  /**
   *   Specifies vertex coordinates for curves. This
   *   function may only be used between beginShape() and
   *   endShape() and only when there is no MODE
   *   parameter specified to beginShape(). For WebGL
   *   mode curveVertex() can be used in 2D as well as 3D
   *   mode. 2D mode expects 2 parameters, while 3D mode
   *   expects 3 parameters. The first and last points in
   *   a series of curveVertex() lines will be used to
   *   guide the beginning and end of the curve. A
   *   minimum of four points is required to draw a tiny
   *   curve between the second and third points. Adding
   *   a fifth point with curveVertex() will draw the
   *   curve between the second, third, and fourth
   *   points. The curveVertex() function is an
   *   implementation of Catmull-Rom splines.
   *   @param x x-coordinate of the vertex
   *   @param y y-coordinate of the vertex
   *   @chainable
   */
  curveVertex(x: number, y: number): p5;

  /**
   *   Specifies vertex coordinates for curves. This
   *   function may only be used between beginShape() and
   *   endShape() and only when there is no MODE
   *   parameter specified to beginShape(). For WebGL
   *   mode curveVertex() can be used in 2D as well as 3D
   *   mode. 2D mode expects 2 parameters, while 3D mode
   *   expects 3 parameters. The first and last points in
   *   a series of curveVertex() lines will be used to
   *   guide the beginning and end of the curve. A
   *   minimum of four points is required to draw a tiny
   *   curve between the second and third points. Adding
   *   a fifth point with curveVertex() will draw the
   *   curve between the second, third, and fourth
   *   points. The curveVertex() function is an
   *   implementation of Catmull-Rom splines.
   *   @param x x-coordinate of the vertex
   *   @param y y-coordinate of the vertex
   *   @param [z] z-coordinate of the vertex (for WebGL
   *   mode)
   *   @chainable
   */
  curveVertex(x: number, y: number, z?: number): p5;

  /**
   *   Use the beginContour() and endContour() functions
   *   to create negative shapes within shapes such as
   *   the center of the letter 'O'. beginContour()
   *   begins recording vertices for the shape and
   *   endContour() stops recording. The vertices that
   *   define a negative shape must "wind" in the
   *   opposite direction from the exterior shape. First
   *   draw vertices for the exterior clockwise order,
   *   then for internal shapes, draw vertices shape in
   *   counter-clockwise. These functions can only be
   *   used within a beginShape()/endShape() pair and
   *   transformations such as translate(), rotate(), and
   *   scale() do not work within a
   *   beginContour()/endContour() pair. It is also not
   *   possible to use other shapes, such as ellipse() or
   *   rect() within.
   *   @chainable
   */
  endContour(): p5;

  /**
   *   The endShape() function is the companion to
   *   beginShape() and may only be called after
   *   beginShape(). When endShape() is called, all of
   *   the image data defined since the previous call to
   *   beginShape() is written into the image buffer. The
   *   constant CLOSE as the value for the mode parameter
   *   to close the shape (to connect the beginning and
   *   the end).
   *   @param [mode] use CLOSE to close the shape
   *   @chainable
   */
  endShape(mode?: END_MODE): p5;

  /**
   *   Specifies vertex coordinates for quadratic Bezier
   *   curves. Each call to quadraticVertex() defines the
   *   position of one control points and one anchor
   *   point of a Bezier curve, adding a new segment to a
   *   line or shape. The first time quadraticVertex() is
   *   used within a beginShape() call, it must be
   *   prefaced with a call to vertex() to set the first
   *   anchor point. For WebGL mode quadraticVertex() can
   *   be used in 2D as well as 3D mode. 2D mode expects
   *   4 parameters, while 3D mode expects 6 parameters
   *   (including z coordinates). This function must be
   *   used between beginShape() and endShape() and only
   *   when there is no MODE or POINTS parameter
   *   specified to beginShape().
   *   @param cx x-coordinate for the control point
   *   @param cy y-coordinate for the control point
   *   @param x3 x-coordinate for the anchor point
   *   @param y3 y-coordinate for the anchor point
   *   @chainable
   */
  quadraticVertex(cx: number, cy: number, x3: number, y3: number): p5;

  /**
   *   Specifies vertex coordinates for quadratic Bezier
   *   curves. Each call to quadraticVertex() defines the
   *   position of one control points and one anchor
   *   point of a Bezier curve, adding a new segment to a
   *   line or shape. The first time quadraticVertex() is
   *   used within a beginShape() call, it must be
   *   prefaced with a call to vertex() to set the first
   *   anchor point. For WebGL mode quadraticVertex() can
   *   be used in 2D as well as 3D mode. 2D mode expects
   *   4 parameters, while 3D mode expects 6 parameters
   *   (including z coordinates). This function must be
   *   used between beginShape() and endShape() and only
   *   when there is no MODE or POINTS parameter
   *   specified to beginShape().
   *   @param cx x-coordinate for the control point
   *   @param cy y-coordinate for the control point
   *   @param cz z-coordinate for the control point (for
   *   WebGL mode)
   *   @param x3 x-coordinate for the anchor point
   *   @param y3 y-coordinate for the anchor point
   *   @param z3 z-coordinate for the anchor point (for
   *   WebGL mode)
   *   @chainable
   */
  quadraticVertex(cx: number, cy: number, cz: number, x3: number, y3: number, z3: number): p5;

  /**
   *   All shapes are constructed by connecting a series
   *   of vertices. vertex() is used to specify the
   *   vertex coordinates for points, lines, triangles,
   *   quads, and polygons. It is used exclusively within
   *   the beginShape() and endShape() functions.
   *   @param x x-coordinate of the vertex
   *   @param y y-coordinate of the vertex
   *   @chainable
   */
  vertex(x: number, y: number): p5;

  /**
   *   All shapes are constructed by connecting a series
   *   of vertices. vertex() is used to specify the
   *   vertex coordinates for points, lines, triangles,
   *   quads, and polygons. It is used exclusively within
   *   the beginShape() and endShape() functions.
   *   @param x x-coordinate of the vertex
   *   @param y y-coordinate of the vertex
   *   @param [z] z-coordinate of the vertex. Defaults to
   *   0 if not specified.
   *   @chainable
   */
  vertex(x: number, y: number, z?: number): p5;

  /**
   *   All shapes are constructed by connecting a series
   *   of vertices. vertex() is used to specify the
   *   vertex coordinates for points, lines, triangles,
   *   quads, and polygons. It is used exclusively within
   *   the beginShape() and endShape() functions.
   *   @param x x-coordinate of the vertex
   *   @param y y-coordinate of the vertex
   *   @param [z] z-coordinate of the vertex. Defaults to
   *   0 if not specified.
   *   @param [u] the vertex's texture u-coordinate
   *   @param [v] the vertex's texture v-coordinate
   *   @chainable
   */
  vertex(x: number, y: number, z?: number, u?: number, v?: number): p5;

  /**
   *   Sets the 3d vertex normal to use for subsequent
   *   vertices drawn with vertex(). A normal is a vector
   *   that is generally nearly perpendicular to a
   *   shape's surface which controls how much light will
   *   be reflected from that part of the surface.
   *   @param vector A p5.Vector representing the vertex
   *   normal.
   *   @chainable
   */
  // normal(vector: Vector): p5Simple;

  /**
   *   Sets the 3d vertex normal to use for subsequent
   *   vertices drawn with vertex(). A normal is a vector
   *   that is generally nearly perpendicular to a
   *   shape's surface which controls how much light will
   *   be reflected from that part of the surface.
   *   @param x The x component of the vertex normal.
   *   @param y The y component of the vertex normal.
   *   @param z The z component of the vertex normal.
   *   @chainable
   */
  normal(x: number, y: number, z: number): p5;

  /**
         *   Multiplies the current matrix by the one specified
         *   through the parameters. This is a powerful
         *   operation that can perform the equivalent of
         *   translate, scale, shear and rotate all at once.
         *   You can learn more about transformation matrices
         *   on  Wikipedia. The naming of the arguments here
         *   follows the naming of the  WHATWG specification
         *   and corresponds to a transformation matrix of the
         *   form:
         *   @param arr an array of numbers - should be 6 or 16
         *   length (2×3 or 4×4 matrix values)
         *   @chainable
         */
  applyMatrix(arr: any[]): p5;

  /**
   *   Multiplies the current matrix by the one specified
   *   through the parameters. This is a powerful
   *   operation that can perform the equivalent of
   *   translate, scale, shear and rotate all at once.
   *   You can learn more about transformation matrices
   *   on  Wikipedia. The naming of the arguments here
   *   follows the naming of the  WHATWG specification
   *   and corresponds to a transformation matrix of the
   *   form:
   *   @param a numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param b numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param c numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param d numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param e numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param f numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @chainable
   */
  applyMatrix(a: number, b: number, c: number, d: number, e: number, f: number): p5;

  /**
   *   Multiplies the current matrix by the one specified
   *   through the parameters. This is a powerful
   *   operation that can perform the equivalent of
   *   translate, scale, shear and rotate all at once.
   *   You can learn more about transformation matrices
   *   on  Wikipedia. The naming of the arguments here
   *   follows the naming of the  WHATWG specification
   *   and corresponds to a transformation matrix of the
   *   form:
   *   @param a numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param b numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param c numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param d numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param e numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param f numbers which define the 2×3 or 4×4
   *   matrix to be multiplied
   *   @param g numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param h numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param i numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param j numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param k numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param l numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param m numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param n numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param o numbers which define the 4×4 matrix to be
   *   multiplied
   *   @param p numbers which define the 4×4 matrix to be
   *   multiplied
   *   @chainable
   */
  applyMatrix(
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
      g: number,
      h: number,
      i: number,
      j: number,
      k: number,
      l: number,
      m: number,
      n: number,
      o: number,
      p: number
  ): p5;

  /**
   *   Replaces the current matrix with the identity
   *   matrix.
   *   @chainable
   */
  resetMatrix(): p5;

  /**
   *   Rotates a shape by the amount specified by the
   *   angle parameter. This function accounts for
   *   angleMode, so angles can be entered in either
   *   RADIANS or DEGREES. Objects are always rotated
   *   around their relative position to the origin and
   *   positive numbers rotate objects in a clockwise
   *   direction. Transformations apply to everything
   *   that happens after and subsequent calls to the
   *   function accumulate the effect. For example,
   *   calling rotate(HALF_PI) and then rotate(HALF_PI)
   *   is the same as rotate(PI). All transformations are
   *   reset when draw() begins again.
   *
   *   Technically, rotate() multiplies the current
   *   transformation matrix by a rotation matrix. This
   *   function can be further controlled by push() and
   *   pop().
   *   @param angle the angle of rotation, specified in
   *   radians or degrees, depending on current angleMode
   *   @param [axis] (in 3d) the axis to rotate around
   *   @chainable
   */
  rotate(angle: number, axis?: Vector | number[]): p5;

  /**
   *   Rotates a shape around X axis by the amount
   *   specified in angle parameter. The angles can be
   *   entered in either RADIANS or DEGREES. Objects are
   *   always rotated around their relative position to
   *   the origin and positive numbers rotate objects in
   *   a clockwise direction. All transformations are
   *   reset when draw() begins again.
   *   @param angle the angle of rotation, specified in
   *   radians or degrees, depending on current angleMode
   *   @chainable
   */
  rotateX(angle: number): p5;

  /**
   *   Rotates a shape around Y axis by the amount
   *   specified in angle parameter. The angles can be
   *   entered in either RADIANS or DEGREES. Objects are
   *   always rotated around their relative position to
   *   the origin and positive numbers rotate objects in
   *   a clockwise direction. All transformations are
   *   reset when draw() begins again.
   *   @param angle the angle of rotation, specified in
   *   radians or degrees, depending on current angleMode
   *   @chainable
   */
  rotateY(angle: number): p5;

  /**
   *   Rotates a shape around Z axis by the amount
   *   specified in angle parameter. The angles can be
   *   entered in either RADIANS or DEGREES. This method
   *   works in WEBGL mode only.
   *
   *   Objects are always rotated around their relative
   *   position to the origin and positive numbers rotate
   *   objects in a clockwise direction. All
   *   transformations are reset when draw() begins
   *   again.
   *   @param angle the angle of rotation, specified in
   *   radians or degrees, depending on current angleMode
   *   @chainable
   */
  rotateZ(angle: number): p5;

  /**
   *   Increases or decreases the size of a shape by
   *   expanding or contracting vertices. Objects always
   *   scale from their relative origin to the coordinate
   *   system. Scale values are specified as decimal
   *   percentages. For example, the function call
   *   scale(2.0) increases the dimension of a shape by
   *   200%. Transformations apply to everything that
   *   happens after and subsequent calls to the function
   *   multiply the effect. For example, calling
   *   scale(2.0) and then scale(1.5) is the same as
   *   scale(3.0). If scale() is called within draw(),
   *   the transformation is reset when the loop begins
   *   again.
   *
   *   Using this function with the z parameter is only
   *   available in WEBGL mode. This function can be
   *   further controlled with push() and pop().
   *   @param s percent to scale the object, or
   *   percentage to scale the object in the x-axis if
   *   multiple arguments are given
   *   @param [y] percent to scale the object in the
   *   y-axis
   *   @param [z] percent to scale the object in the
   *   z-axis (webgl only)
   *   @chainable
   */
  scale(s: number | Vector | number[], y?: number, z?: number): p5;

  /**
   *   Increases or decreases the size of a shape by
   *   expanding or contracting vertices. Objects always
   *   scale from their relative origin to the coordinate
   *   system. Scale values are specified as decimal
   *   percentages. For example, the function call
   *   scale(2.0) increases the dimension of a shape by
   *   200%. Transformations apply to everything that
   *   happens after and subsequent calls to the function
   *   multiply the effect. For example, calling
   *   scale(2.0) and then scale(1.5) is the same as
   *   scale(3.0). If scale() is called within draw(),
   *   the transformation is reset when the loop begins
   *   again.
   *
   *   Using this function with the z parameter is only
   *   available in WEBGL mode. This function can be
   *   further controlled with push() and pop().
   *   @param scales per-axis percents to scale the
   *   object
   *   @chainable
   */
  scale(scales: Vector | number[]): p5;

  /**
   *   Shears a shape around the x-axis by the amount
   *   specified by the angle parameter. Angles should be
   *   specified in the current angleMode. Objects are
   *   always sheared around their relative position to
   *   the origin and positive numbers shear objects in a
   *   clockwise direction. Transformations apply to
   *   everything that happens after and subsequent calls
   *   to the function accumulates the effect. For
   *   example, calling shearX(PI/2) and then
   *   shearX(PI/2) is the same as shearX(PI). If
   *   shearX() is called within the draw(), the
   *   transformation is reset when the loop begins
   *   again.
   *
   *   Technically, shearX() multiplies the current
   *   transformation matrix by a rotation matrix. This
   *   function can be further controlled by the push()
   *   and pop() functions.
   *   @param angle angle of shear specified in radians
   *   or degrees, depending on current angleMode
   *   @chainable
   */
  shearX(angle: number): p5;

  /**
   *   Shears a shape around the y-axis the amount
   *   specified by the angle parameter. Angles should be
   *   specified in the current angleMode. Objects are
   *   always sheared around their relative position to
   *   the origin and positive numbers shear objects in a
   *   clockwise direction. Transformations apply to
   *   everything that happens after and subsequent calls
   *   to the function accumulates the effect. For
   *   example, calling shearY(PI/2) and then
   *   shearY(PI/2) is the same as shearY(PI). If
   *   shearY() is called within the draw(), the
   *   transformation is reset when the loop begins
   *   again.
   *
   *   Technically, shearY() multiplies the current
   *   transformation matrix by a rotation matrix. This
   *   function can be further controlled by the push()
   *   and pop() functions.
   *   @param angle angle of shear specified in radians
   *   or degrees, depending on current angleMode
   *   @chainable
   */
  shearY(angle: number): p5;

  /**
   *   Specifies an amount to displace objects within the
   *   display window. The x parameter specifies
   *   left/right translation, the y parameter specifies
   *   up/down translation. Transformations are
   *   cumulative and apply to everything that happens
   *   after and subsequent calls to the function
   *   accumulates the effect. For example, calling
   *   translate(50, 0) and then translate(20, 0) is the
   *   same as translate(70, 0). If translate() is called
   *   within draw(), the transformation is reset when
   *   the loop begins again. This function can be
   *   further controlled by using push() and pop().
   *   @param x left/right translation
   *   @param y up/down translation
   *   @param [z] forward/backward translation (WEBGL
   *   only)
   *   @chainable
   */
  translate(x: number, y: number, z?: number): p5;

  /**
   *   Specifies an amount to displace objects within the
   *   display window. The x parameter specifies
   *   left/right translation, the y parameter specifies
   *   up/down translation. Transformations are
   *   cumulative and apply to everything that happens
   *   after and subsequent calls to the function
   *   accumulates the effect. For example, calling
   *   translate(50, 0) and then translate(20, 0) is the
   *   same as translate(70, 0). If translate() is called
   *   within draw(), the transformation is reset when
   *   the loop begins again. This function can be
   *   further controlled by using push() and pop().
   *   @param vector the vector to translate by
   *   @chainable
   */
  translate(vector: Vector): p5;
}
`