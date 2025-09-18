import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      customElement: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    process: '{}',
  },
  build: {
    target: 'esnext',
    outDir: 'canvasImportTest',
    emptyOutDir: false,
    cssCodeSplit: false,
    copyPublicDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/canvas/web-component.ts', import.meta.url)),
      name: 'HandwritingCanvas',
      fileName: () => 'handwriting-canvas.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'handwriting-canvas.js',
        assetFileNames: 'handwriting-canvas.[ext]',
      },
    },
  },
})
