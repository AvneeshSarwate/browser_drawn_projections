const ts = require("typescript");
const path = require("path");
const fs = require("fs");

function generateDtsFiles(filePaths, targetFolder) {
    // Compiler options with esModuleInterop enabled
    const options = {
        declaration: true,
        emitDeclarationOnly: true,
        noEmitOnError: true,
        baseUrl: ".", // Base URL for non-absolute module names
        paths: { "@/*": ["src/*"] }, // Path alias "@" for "src"
        esModuleInterop: true
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
            console.error(diagnostic.messageText);
        });
        return;
    }

    console.log("Declaration files successfully emitted.");
}

const filePaths = [
    'src/channels/channels.ts', // Updated file path
    // ... more file paths
];

const targetFolder = 'src/assets/types'; // Target folder for .d.ts files
generateDtsFiles(filePaths, targetFolder);
