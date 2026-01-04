import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { PluginOption } from 'vite';
import { generateMaterialTypes_GL } from './generateMaterialTypes_GL';
import { generateStrokeMaterialTypes_GL } from './generateStrokeMaterialTypes_GL';

interface MaterialPluginOptions {
  srcDir?: string;
  quiet?: boolean;
}

async function findFiles(root: string, suffix: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile() && absolute.endsWith(suffix)) {
        results.push(absolute);
      }
    }
  }
  await walk(root);
  return results;
}

export function glslMaterialPlugin(options: MaterialPluginOptions = {}): PluginOption {
  const projectRoot = process.cwd();
  const srcDir = options.srcDir ? path.resolve(projectRoot, options.srcDir) : path.resolve(projectRoot, 'src');
  const quiet = options.quiet ?? false;

  async function processFile(filePath: string): Promise<void> {
    try {
      await generateMaterialTypes_GL(filePath, {
        projectRoot,
        logger: quiet ? undefined : (message) => console.log(`[glsl-material] ${message}`),
      });
    } catch (error) {
      console.error('[glsl-material] Failed:', path.relative(projectRoot, filePath));
      console.error(error);
    }
  }

  async function removeArtifacts(filePath: string): Promise<void> {
    const baseName = path.basename(filePath, '.material.glsl');
    const dir = path.dirname(filePath);
    const generatedPath = path.join(dir, `${baseName}.material.gl.generated.ts`);
    await fs.unlink(generatedPath).catch(() => {});
  }

  return {
    name: 'glsl-material-plugin',
    enforce: 'pre',
    async buildStart() {
      const files = await findFiles(srcDir, '.material.glsl');
      await Promise.all(files.map(processFile));
    },
    configureServer(server) {
      const watcher = server.watcher;
      const handle = (filePath: string) => {
        if (!filePath.endsWith('.material.glsl')) return;
        processFile(filePath).then(() => {
          const baseName = path.basename(filePath, '.material.glsl');
          const generatedPath = path.join(path.dirname(filePath), `${baseName}.material.gl.generated.ts`);
          server.ws.send({
            type: 'full-reload',
            path: `/${path.relative(projectRoot, generatedPath)}`,
          });
        });
      };
      watcher.on('add', handle);
      watcher.on('change', handle);
      watcher.on('unlink', (filePath) => {
        if (!filePath.endsWith('.material.glsl')) return;
        removeArtifacts(filePath);
      });
    },
  };
}

export function glslStrokeMaterialPlugin(options: MaterialPluginOptions = {}): PluginOption {
  const projectRoot = process.cwd();
  const srcDir = options.srcDir ? path.resolve(projectRoot, options.srcDir) : path.resolve(projectRoot, 'src');
  const quiet = options.quiet ?? false;

  async function processFile(filePath: string): Promise<void> {
    try {
      await generateStrokeMaterialTypes_GL(filePath, {
        projectRoot,
        logger: quiet ? undefined : (message) => console.log(`[glsl-stroke] ${message}`),
      });
    } catch (error) {
      console.error('[glsl-stroke] Failed:', path.relative(projectRoot, filePath));
      console.error(error);
    }
  }

  async function removeArtifacts(filePath: string): Promise<void> {
    const baseName = path.basename(filePath, '.strokeMaterial.glsl');
    const dir = path.dirname(filePath);
    const generatedPath = path.join(dir, `${baseName}.strokeMaterial.gl.generated.ts`);
    await fs.unlink(generatedPath).catch(() => {});
  }

  return {
    name: 'glsl-stroke-material-plugin',
    enforce: 'pre',
    async buildStart() {
      const files = await findFiles(srcDir, '.strokeMaterial.glsl');
      await Promise.all(files.map(processFile));
    },
    configureServer(server) {
      const watcher = server.watcher;
      const handle = (filePath: string) => {
        if (!filePath.endsWith('.strokeMaterial.glsl')) return;
        processFile(filePath).then(() => {
          const baseName = path.basename(filePath, '.strokeMaterial.glsl');
          const generatedPath = path.join(path.dirname(filePath), `${baseName}.strokeMaterial.gl.generated.ts`);
          server.ws.send({
            type: 'full-reload',
            path: `/${path.relative(projectRoot, generatedPath)}`,
          });
        });
      };
      watcher.on('add', handle);
      watcher.on('change', handle);
      watcher.on('unlink', (filePath) => {
        if (!filePath.endsWith('.strokeMaterial.glsl')) return;
        removeArtifacts(filePath);
      });
    },
  };
}
