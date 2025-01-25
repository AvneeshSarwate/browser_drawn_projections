import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// import vueJsx from '@vitejs/plugin-vue-jsx'
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { vitePluginTypescriptTransform } from 'vite-plugin-typescript-transform';

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  plugins: [
    vue(), 
    react(),
    // vueJsx()
    vitePluginTypescriptTransform({
      enforce: 'pre',
      filter: {
        files: {
          include: /\.ts$/,
        },
      },
      tsconfig: {
        override: {
          target: ts.ScriptTarget.ES2021,
        },
      },
    })
  ],
  // build: {
  //   sourcemap: true,
  // },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    minify: false, //enabling this breaks the faust wasm module
    rollupOptions: {
      output: {
        format: 'es', // Use ES module format
      },
    },
  },
  esbuild: {
    target: 'esnext', // Ensure esbuild doesn't transpile TLA
  },
})
