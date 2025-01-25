export function logisticSigmoid(x: number, sharpness: number): number {
  // n.b.: this Logistic Sigmoid has been normalized.
  let a = sharpness;
  const epsilon = 0.0001;
  const minParamA = 0.0 + epsilon;
  const maxParamA = 1.0 - epsilon;
  a = Math.max(minParamA, Math.min(maxParamA, a));
  a = (1.0 / (1.0 - a) - 1.0);
  const A = 1.0 / (1.0 + Math.exp(0.0 - (x - 0.5) * a * 2.0));
  const B = 1.0 / (1.0 + Math.exp(a));
  const C = 1.0 / (1.0 + Math.exp(0.0 - a));
  return (A - B) / (C - B);
}