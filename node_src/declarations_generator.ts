//run with npx ts-node declarations_generator.ts

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";

function generateDtsFiles(filePaths: string[], targetFolder: string): void {
  const options: ts.CompilerOptions = {
    declaration: true,
    emitDeclarationOnly: true,
    noEmitOnError: true,
    baseUrl: ".",
    paths: { "@/*": ["src/*"] },
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2015,
    downlevelIteration: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler
  };

  const resolvedFilePaths = filePaths.map(fp => path.resolve(fp));
  const resolvedTargetFolder = path.resolve(targetFolder);

  if (!fs.existsSync(resolvedTargetFolder)) {
    fs.mkdirSync(resolvedTargetFolder, { recursive: true });
  }

  const host = ts.createCompilerHost(options);

  host.writeFile = (fileName, contents) => {
    const declarationFileName = path.basename(fileName);
    const targetPath = path.join(resolvedTargetFolder, declarationFileName);
    fs.writeFileSync(targetPath, contents);
  };

  const program = ts.createProgram(resolvedFilePaths, options, host);
  const emitResult = program.emit();

  if (emitResult.emitSkipped) {
    console.error("Emitting declarations was skipped due to errors.");
    emitResult.diagnostics.forEach(diagnostic => {
      console.error(diagnostic.messageText as string);
    });
    return;
  }

  console.log("Declaration files successfully emitted.");
}

const filePaths = [
  'src/channels/channels.ts', // Updated file path
  'src/io/keyboardAndMouse.ts',
  'src/io/midi.ts',
  'src/music/clipPlayback.ts',
  'src/music/pianoRoll.ts',
  'src/music/scale.ts',
  'src/music/synths.ts',
  'src/rendering/shaderFX.ts',
  'src/rendering/customFX.ts',
  'src/rendering/three5.ts',
  'src/rendering/three5Style.ts',
];

const targetFolder = 'src/assets/types';
generateDtsFiles(filePaths, targetFolder);
