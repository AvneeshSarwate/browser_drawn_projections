import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { PluginOption } from 'vite'
import { generateFragmentShaderArtifacts } from './generateFragmentShader_GL'

interface FragmentPluginOptions {
  srcDir?: string
  quiet?: boolean
}

async function findFragmentShaders(root: string): Promise<string[]> {
  const results: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
        continue
      }
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
      } else if (entry.isFile() && absolute.endsWith('.fragFunc.glsl')) {
        results.push(absolute)
      }
    }
  }
  await walk(root)
  return results
}

export function glslFragmentPlugin(options: FragmentPluginOptions = {}): PluginOption {
  const projectRoot = process.cwd()
  const srcDir = options.srcDir ? path.resolve(projectRoot, options.srcDir) : path.resolve(projectRoot, 'src')
  const quiet = options.quiet ?? false

  async function processFile(filePath: string): Promise<void> {
    try {
      await generateFragmentShaderArtifacts(filePath, {
        projectRoot,
        logger: quiet ? undefined : (message) => console.log(`[glsl-frag] ${message}`),
      })
    } catch (error) {
      console.error('[glsl-frag] Failed to generate fragment shader for', path.relative(projectRoot, filePath))
      console.error(error)
    }
  }

  async function removeArtifacts(filePath: string): Promise<void> {
    const baseName = path.basename(filePath, '.fragFunc.glsl')
    const dir = path.dirname(filePath)
    const typesPath = path.join(dir, `${baseName}.frag.gl.generated.ts`)
    await fs.unlink(typesPath).catch(() => {})
  }

  return {
    name: 'glsl-fragment-plugin',
    enforce: 'pre',
    async buildStart() {
      const files = await findFragmentShaders(srcDir)
      await Promise.all(files.map((file) => processFile(file)))
    },
    configureServer(server) {
      const watcher = server.watcher
      const handle = (filePath: string) => {
        if (!filePath.endsWith('.fragFunc.glsl')) return
        processFile(filePath).then(() => {
          const baseName = path.basename(filePath, '.fragFunc.glsl')
          const generatedPath = path.join(path.dirname(filePath), `${baseName}.frag.gl.generated.ts`)
          server.ws.send({ type: 'full-reload', path: `/${path.relative(projectRoot, generatedPath)}` })
        })
      }
      watcher.on('add', handle)
      watcher.on('change', handle)
      watcher.on('unlink', (filePath) => {
        if (!filePath.endsWith('.fragFunc.glsl')) return
        removeArtifacts(filePath)
      })
    },
  }
}
