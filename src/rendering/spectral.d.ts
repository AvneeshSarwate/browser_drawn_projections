// spectral.d.ts
declare module 'spectral.js' {
  export interface Spectral {
    mix: (col1: string, col2: string, ratio: number, format: number) => { r: number; g: number; b: number; a: number };
    palette: (col1: string, col2: string, count: number, format: number) => { r: number; g: number; b: number; a: number }[];
    RGBA: number = 0
  }
  const spectral: Spectral;
  export default spectral;
}
