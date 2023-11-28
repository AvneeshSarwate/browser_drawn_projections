export const scaleDef = `
declare class Scale {
  private degrees;
  private root;
  constructor(notes?: number[], root?: number);
  cycleUp(): Scale;
  cycleDown(): Scale;
  cycle(n: number): Scale;
  invertUp(): Scale;
  invertDown(): Scale;
  invert(n: number): Scale;
  deltas(): number[];
  getByIndex(index: number): number;
  getIndFromPitch(pitch: number): number;
  getMultiple(indices: number[]): number[];
  setDegrees(degrees: number[]): void;
  getDegrees(): number[];
  setRoot(root: number): void;
}
`;