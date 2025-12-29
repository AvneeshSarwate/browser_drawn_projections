import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { PluginOption } from 'vite';
import { generateMaterialTypes } from './generateMaterialTypes';
import { generateStrokeMaterialTypes } from './generateStrokeMaterialTypes';

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

export function wgslMaterialPlugin(options: MaterialPluginOptions = {}): PluginOption {
  const projectRoot = process.cwd();
  const srcDir = options.srcDir ? path.resolve(projectRoot, options.srcDir) : path.resolve(projectRoot, 'src');
  const quiet = options.quiet ?? false;

  async function processFile(filePath: string): Promise<void> {
    try {
      await generateMaterialTypes(filePath, {
        projectRoot,
        logger: quiet ? undefined : (message) => console.log(`[wgsl-material] ${message}`),
      });
    } catch (error) {
      console.error('[wgsl-material] Failed:', path.relative(projectRoot, filePath));
      console.error(error);
    }
  }

  async function removeArtifacts(filePath: string): Promise<void> {
    const generatedPath = `${filePath}.generated.ts`;
    await fs.unlink(generatedPath).catch(() => {});
  }

  return {
    name: 'wgsl-material-plugin',
    enforce: 'pre',
    async buildStart() {
      const files = await findFiles(srcDir, '.material.wgsl');
      await Promise.all(files.map(processFile));
    },
    configureServer(server) {
      const watcher = server.watcher;
      const handle = (filePath: string) => {
        if (!filePath.endsWith('.material.wgsl')) return;
        processFile(filePath).then(() => {
          const generatedPath = `${filePath}.generated.ts`;
          server.ws.send({
            type: 'full-reload',
            path: `/${path.relative(projectRoot, generatedPath)}`,
          });
        });
      };
      watcher.on('add', handle);
      watcher.on('change', handle);
      watcher.on('unlink', (filePath) => {
        if (!filePath.endsWith('.material.wgsl')) return;
        removeArtifacts(filePath);
      });
    },
  };
}

export function wgslStrokeMaterialPlugin(options: MaterialPluginOptions = {}): PluginOption {
  const projectRoot = process.cwd();
  const srcDir = options.srcDir ? path.resolve(projectRoot, options.srcDir) : path.resolve(projectRoot, 'src');
  const quiet = options.quiet ?? false;

  async function processFile(filePath: string): Promise<void> {
    try {
      await generateStrokeMaterialTypes(filePath, {
        projectRoot,
        logger: quiet ? undefined : (message) => console.log(`[wgsl-stroke] ${message}`),
      });
    } catch (error) {
      console.error('[wgsl-stroke] Failed:', path.relative(projectRoot, filePath));
      console.error(error);
    }
  }

  async function removeArtifacts(filePath: string): Promise<void> {
    const generatedPath = `${filePath}.generated.ts`;
    await fs.unlink(generatedPath).catch(() => {});
  }

  return {
    name: 'wgsl-stroke-material-plugin',
    enforce: 'pre',
    async buildStart() {
      const files = await findFiles(srcDir, '.strokeMaterial.wgsl');
      await Promise.all(files.map(processFile));
    },
    configureServer(server) {
      const watcher = server.watcher;
      const handle = (filePath: string) => {
        if (!filePath.endsWith('.strokeMaterial.wgsl')) return;
        processFile(filePath).then(() => {
          const generatedPath = `${filePath}.generated.ts`;
          server.ws.send({
            type: 'full-reload',
            path: `/${path.relative(projectRoot, generatedPath)}`,
          });
        });
      };
      watcher.on('add', handle);
      watcher.on('change', handle);
      watcher.on('unlink', (filePath) => {
        if (!filePath.endsWith('.strokeMaterial.wgsl')) return;
        removeArtifacts(filePath);
      });
    },
  };
}
