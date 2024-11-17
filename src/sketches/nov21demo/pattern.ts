export const dotted = (notes, mod) => notes.map((n, i) => ({...n, duration: i % mod ? 0.2 : n.duration}))

export const repeat = (notes, n) => {
    return notes.flatMap((note, index) =>
        Array.from({ length: n }, (_, i) => ({
            ...note,
            position: index * n + i
        }))
    );
  }