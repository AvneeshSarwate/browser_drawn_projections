import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { PluginOption } from 'vite';

import { readTextFile, writeFileIfChanged } from './codegen/codegenIO';

import {
  RAW_SUFFIX as WGSL_MATERIAL_SUFFIX,
  OUTPUT_SUFFIX as WGSL_MATERIAL_OUTPUT_SUFFIX,
  generateMaterialTypesSource,
} from './wgsl/generateMaterialTypesCore';
import {
  RAW_SUFFIX as WGSL_STROKE_SUFFIX,
  OUTPUT_SUFFIX as WGSL_STROKE_OUTPUT_SUFFIX,
  generateStrokeMaterialTypesSource,
} from './wgsl/generateStrokeMaterialTypesCore';
import {
  RAW_SUFFIX as WGSL_FRAG_SUFFIX,
  TYPES_SUFFIX as WGSL_FRAG_TYPES_SUFFIX,
  buildFragmentShaderErrorArtifactSource,
  generateFragmentShaderArtifactsSource,
  getFragmentShaderNaming,
} from './wgsl/generateFragmentShaderCore';
import {
  DEFAULT_COMPUTE_OUTPUT_SUFFIX as WGSL_COMPUTE_DEFAULT_SUFFIX,
  RAW_SUFFIX as WGSL_COMPUTE_SUFFIX,
  generateComputeShaderTypesSource,
} from './wgsl/generateComputeShaderTypesCore';

import {
  RAW_SUFFIX as GLSL_MATERIAL_SUFFIX,
  OUTPUT_SUFFIX as GLSL_MATERIAL_OUTPUT_SUFFIX,
  generateMaterialTypesSource as generateMaterialTypesSource_GL,
} from './glsl/generateMaterialTypesCore_GL';
import {
  RAW_SUFFIX as GLSL_STROKE_SUFFIX,
  OUTPUT_SUFFIX as GLSL_STROKE_OUTPUT_SUFFIX,
  generateStrokeMaterialTypesSource as generateStrokeMaterialTypesSource_GL,
} from './glsl/generateStrokeMaterialTypesCore_GL';
import {
  RAW_SUFFIX as GLSL_FRAG_SUFFIX,
  TYPES_SUFFIX as GLSL_FRAG_TYPES_SUFFIX,
  generateFragmentShaderArtifactsSource as generateFragmentShaderArtifactsSource_GL,
} from './glsl/generateFragmentShaderCore_GL';

export type ShaderGeneratorId =
  | 'wgsl-compute'
  | 'wgsl-fragment'
  | 'wgsl-material'
  | 'wgsl-stroke-material'
  | 'glsl-fragment'
  | 'glsl-material'
  | 'glsl-stroke-material';

export interface ShaderCodegenPluginOptions {
  srcDir?: string;
  quiet?: boolean;
  computeOutputExtension?: string;
  include?: ShaderGeneratorId[];
  exclude?: ShaderGeneratorId[];
}

interface GeneratorContext {
  projectRoot: string;
  computeOutputExtension?: string;
  quiet: boolean;
}

interface TransformInput {
  filePath: string;
  shaderCode: string;
  context: GeneratorContext;
}

interface GeneratorDefinition {
  id: ShaderGeneratorId;
  inputSuffix: string;
  logPrefix: string;
  errorMessage: string;
  outputPath: (filePath: string, context: GeneratorContext) => string;
  successMessage: (relativePath: string) => string;
  transform: (input: TransformInput) => string;
  onError?: (error: unknown, input: TransformInput, outputPath: string) => string;
  errorArtifactMessage?: (relativePath: string, updated: boolean) => string;
}

const GENERATORS: GeneratorDefinition[] = [
  {
    id: 'wgsl-compute',
    inputSuffix: WGSL_COMPUTE_SUFFIX,
    logPrefix: 'wgsl-types',
    errorMessage: 'Failed to generate types for',
    outputPath: (filePath, context) => `${filePath}${context.computeOutputExtension ?? WGSL_COMPUTE_DEFAULT_SUFFIX}`,
    successMessage: (relativePath) => `Updated ${relativePath}`,
    transform: ({ filePath, shaderCode }) => {
      const shaderFileName = path.basename(filePath);
      const shaderStem = path.basename(filePath, path.extname(filePath));
      return generateComputeShaderTypesSource({
        shaderCode,
        shaderFileName,
        shaderStem,
      }).typesSource;
    },
  },
  {
    id: 'wgsl-fragment',
    inputSuffix: WGSL_FRAG_SUFFIX,
    logPrefix: 'wgsl-frag',
    errorMessage: 'Failed to generate fragment shader for',
    outputPath: (filePath) => `${filePath.slice(0, -WGSL_FRAG_SUFFIX.length)}${WGSL_FRAG_TYPES_SUFFIX}`,
    successMessage: (relativePath) => `Updated ${relativePath}`,
    transform: ({ filePath, shaderCode, context }) => {
      const shaderBaseName = path.basename(filePath, WGSL_FRAG_SUFFIX);
      const shaderDirectory = path.dirname(filePath);
      const shaderFxAbsolute = path.join(context.projectRoot, 'src/rendering/shaderFXBabylon.ts');
      let shaderFxImportPath = path.relative(shaderDirectory, shaderFxAbsolute).replace(/\\/g, '/');
      if (!shaderFxImportPath.startsWith('.')) {
        shaderFxImportPath = `./${shaderFxImportPath}`;
      }
      shaderFxImportPath = shaderFxImportPath.replace(/\.ts$/, '');
      return generateFragmentShaderArtifactsSource({
        shaderCode,
        shaderBaseName,
        shaderFxImportPath,
      }).typesSource;
    },
    onError: (error, input) => {
      const shaderBaseName = path.basename(input.filePath, WGSL_FRAG_SUFFIX);
      const naming = getFragmentShaderNaming(shaderBaseName);
      const relativeSource = path
        .relative(input.context.projectRoot, input.filePath)
        .replace(/\\/g, '/');
      const message = error instanceof Error ? error.message : String(error);
      return buildFragmentShaderErrorArtifactSource({
        effectClassName: naming.effectClassName,
        uniformInterfaceName: naming.defaultUniformInterfaceName,
        shaderPrefix: naming.shaderPrefix,
        relativeSourcePath: relativeSource,
        errorMessage: message,
      });
    },
    errorArtifactMessage: (relativePath, updated) => `${updated ? 'Updated' : 'Retained'} error artifact for ${relativePath}`,
  },
  {
    id: 'wgsl-material',
    inputSuffix: WGSL_MATERIAL_SUFFIX,
    logPrefix: 'wgsl-material',
    errorMessage: 'Failed:',
    outputPath: (filePath) => `${filePath}${WGSL_MATERIAL_OUTPUT_SUFFIX}`,
    successMessage: (relativePath) => `Updated ${relativePath}`,
    transform: ({ filePath, shaderCode }) => {
      const shaderBaseName = path.basename(filePath, WGSL_MATERIAL_SUFFIX);
      return generateMaterialTypesSource(shaderCode, shaderBaseName).typesSource;
    },
  },
  {
    id: 'wgsl-stroke-material',
    inputSuffix: WGSL_STROKE_SUFFIX,
    logPrefix: 'wgsl-stroke',
    errorMessage: 'Failed:',
    outputPath: (filePath) => `${filePath}${WGSL_STROKE_OUTPUT_SUFFIX}`,
    successMessage: (relativePath) => `Updated ${relativePath}`,
    transform: ({ filePath, shaderCode }) => {
      const shaderBaseName = path.basename(filePath, WGSL_STROKE_SUFFIX);
      return generateStrokeMaterialTypesSource(shaderCode, shaderBaseName).typesSource;
    },
  },
  {
    id: 'glsl-fragment',
    inputSuffix: GLSL_FRAG_SUFFIX,
    logPrefix: 'glsl-frag',
    errorMessage: 'Failed to generate fragment shader for',
    outputPath: (filePath) => `${filePath.slice(0, -GLSL_FRAG_SUFFIX.length)}${GLSL_FRAG_TYPES_SUFFIX}`,
    successMessage: (relativePath) => `Updated ${relativePath}`,
    transform: ({ filePath, shaderCode, context }) => {
      const shaderBaseName = path.basename(filePath, GLSL_FRAG_SUFFIX);
      const shaderFxAbsolute = path.join(context.projectRoot, 'src/rendering/babylonGL/shaderFXBabylon_GL');
      let shaderFxImportPath = path.relative(path.dirname(filePath), shaderFxAbsolute).replace(/\\/g, '/');
      if (!shaderFxImportPath.startsWith('.')) {
        shaderFxImportPath = `./${shaderFxImportPath}`;
      }
      return generateFragmentShaderArtifactsSource_GL({
        shaderCode,
        shaderBaseName,
        shaderFxImportPath,
      }).typesSource;
    },
  },
  {
    id: 'glsl-material',
    inputSuffix: GLSL_MATERIAL_SUFFIX,
    logPrefix: 'glsl-material',
    errorMessage: 'Failed:',
    outputPath: (filePath) => `${filePath.slice(0, -GLSL_MATERIAL_SUFFIX.length)}${GLSL_MATERIAL_OUTPUT_SUFFIX}`,
    successMessage: (relativePath) => `Updated ${relativePath}`,
    transform: ({ filePath, shaderCode }) => {
      const shaderBaseName = path.basename(filePath, GLSL_MATERIAL_SUFFIX);
      return generateMaterialTypesSource_GL(shaderCode, shaderBaseName).typesSource;
    },
  },
  {
    id: 'glsl-stroke-material',
    inputSuffix: GLSL_STROKE_SUFFIX,
    logPrefix: 'glsl-stroke',
    errorMessage: 'Failed:',
    outputPath: (filePath) => `${filePath.slice(0, -GLSL_STROKE_SUFFIX.length)}${GLSL_STROKE_OUTPUT_SUFFIX}`,
    successMessage: (relativePath) => `Updated ${relativePath}`,
    transform: ({ filePath, shaderCode }) => {
      const shaderBaseName = path.basename(filePath, GLSL_STROKE_SUFFIX);
      return generateStrokeMaterialTypesSource_GL(shaderCode, shaderBaseName).typesSource;
    },
  },
];

function createLogger(prefix: string, quiet: boolean): ((message: string) => void) | undefined {
  if (quiet) {
    return undefined;
  }
  return (message) => console.log(`[${prefix}] ${message}`);
}

function filterGenerators(options: ShaderCodegenPluginOptions): GeneratorDefinition[] {
  const include = options.include ? new Set(options.include) : null;
  const exclude = options.exclude ? new Set(options.exclude) : null;
  return GENERATORS.filter((generator) => {
    if (include && !include.has(generator.id)) {
      return false;
    }
    if (exclude && exclude.has(generator.id)) {
      return false;
    }
    return true;
  });
}

async function findFilesBySuffixes(root: string, suffixes: string[]): Promise<string[]> {
  const results: string[] = [];
  const suffixSet = new Set(suffixes);
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        for (const suffix of suffixSet) {
          if (absolute.endsWith(suffix)) {
            results.push(absolute);
            break;
          }
        }
      }
    }
  }
  await walk(root);
  return results;
}

function matchGenerator(filePath: string, generators: GeneratorDefinition[]): GeneratorDefinition | null {
  for (const generator of generators) {
    if (filePath.endsWith(generator.inputSuffix)) {
      return generator;
    }
  }
  return null;
}

export function shaderCodegenPlugin(options: ShaderCodegenPluginOptions = {}): PluginOption {
  const projectRoot = process.cwd();
  const srcDir = options.srcDir ? path.resolve(projectRoot, options.srcDir) : path.resolve(projectRoot, 'src');
  const quiet = options.quiet ?? false;
  const computeOutputExtension = options.computeOutputExtension;

  const activeGenerators = filterGenerators(options);
  if (!activeGenerators.length) {
    return { name: 'shader-codegen-plugin' };
  }

  const orderedGenerators = [...activeGenerators].sort((a, b) => b.inputSuffix.length - a.inputSuffix.length);
  const suffixes = orderedGenerators.map((generator) => generator.inputSuffix);

  const context: GeneratorContext = {
    projectRoot,
    computeOutputExtension,
    quiet,
  };

  async function processFile(filePath: string): Promise<void> {
    const generator = matchGenerator(filePath, orderedGenerators);
    if (!generator) {
      return;
    }
    const logger = createLogger(generator.logPrefix, quiet);
    const outputPath = generator.outputPath(filePath, context);
    const relativeOutput = path.relative(projectRoot, outputPath);
    try {
      const shaderCode = await readTextFile(filePath);
      const content = generator.transform({ filePath, shaderCode, context });
      const updated = await writeFileIfChanged(outputPath, content);
      if (updated) {
        logger?.(generator.successMessage(relativeOutput));
      }
    } catch (error) {
      if (generator.onError) {
        try {
          const shaderCode = await readTextFile(filePath);
          const errorContent = generator.onError(error, { filePath, shaderCode, context }, outputPath);
          const updated = await writeFileIfChanged(outputPath, errorContent);
          if (generator.errorArtifactMessage) {
            logger?.(generator.errorArtifactMessage(relativeOutput, updated));
          }
        } catch (writeError) {
          console.error(`[${generator.logPrefix}] Failed to write error artifact for`, relativeOutput);
          console.error(writeError);
        }
      }
      console.error(`[${generator.logPrefix}] ${generator.errorMessage}`, path.relative(projectRoot, filePath));
      console.error(error);
    }
  }

  async function removeArtifacts(filePath: string): Promise<void> {
    const generator = matchGenerator(filePath, orderedGenerators);
    if (!generator) {
      return;
    }
    const generatedPath = generator.outputPath(filePath, context);
    await fs.unlink(generatedPath).catch(() => {});
  }

  return {
    name: 'shader-codegen-plugin',
    enforce: 'pre',
    async buildStart() {
      const files = await findFilesBySuffixes(srcDir, suffixes);
      await Promise.all(files.map((file) => processFile(file)));
    },
    configureServer(server) {
      const watcher = server.watcher;
      const handle = (filePath: string) => {
        const generator = matchGenerator(filePath, orderedGenerators);
        if (!generator) return;
        processFile(filePath).then(() => {
          const generatedPath = generator.outputPath(filePath, context);
          server.ws.send({
            type: 'full-reload',
            path: `/${path.relative(projectRoot, generatedPath)}`,
          });
        });
      };
      watcher.on('add', handle);
      watcher.on('change', handle);
      watcher.on('unlink', (filePath) => {
        const generator = matchGenerator(filePath, orderedGenerators);
        if (!generator) return;
        removeArtifacts(filePath);
      });
    },
  };
}
