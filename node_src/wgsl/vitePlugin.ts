import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { PluginOption } from 'vite';
import { generateShaderTypes } from './generateShaderTypes';

interface WgslPluginOptions {
  srcDir?: string;
  outputExtension?: string;
  quiet?: boolean;
}

async function findWgslFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && absolute.endsWith('.compute.wgsl')) {
        results.push(absolute);
      }
    }
  }
  await walk(root);
  return results;
}

export function wgslTypesPlugin(options: WgslPluginOptions = {}): PluginOption {
  const projectRoot = process.cwd();
  const srcDir = options.srcDir ? path.resolve(projectRoot, options.srcDir) : path.resolve(projectRoot, 'src');
  const outputExtension = options.outputExtension;
  const quiet = options.quiet ?? false;

  async function processFile(filePath: string): Promise<void> {
    try {
      await generateShaderTypes(filePath, {
        projectRoot,
        outputExtension,
        logger: quiet ? undefined : (message) => console.log(`[wgsl-types] ${message}`),
      });
    } catch (error) {
      console.error('[wgsl-types] Failed to generate types for', path.relative(projectRoot, filePath));
      console.error(error);
    }
  }

  return {
    name: 'wgsl-types-plugin',
    enforce: 'pre',
    async buildStart() {
      const files = await findWgslFiles(srcDir);
      await Promise.all(files.map((file) => processFile(file)));
    },
    configureServer(server) {
      const watcher = server.watcher;
      const handle = (filePath: string) => {
        if (!filePath.endsWith('.compute.wgsl')) return;
        processFile(filePath).then(() => {
          const generatedPath = `${filePath}${outputExtension ?? '.generated.ts'}`;
          server.ws.send({ type: 'full-reload', path: `/${path.relative(projectRoot, generatedPath)}` });
        });
      };
      watcher.on('add', handle);
      watcher.on('change', handle);
    },
  };
}
