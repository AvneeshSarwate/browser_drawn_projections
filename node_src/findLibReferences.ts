import { Project, SourceFile } from 'ts-morph'

const project = new Project({
  tsConfigFilePath: 'tsconfig.app.json'
})

function getClassReferences() {
  for (const sourceFile of project.getSourceFiles()) {
    for (const classDeclaration of sourceFile.getClasses()) {
      console.log('---------')
      console.log('Class ', classDeclaration.getName())
      console.log('---------')
      const referencedSymbols = classDeclaration.findReferences()

      for (const referencedSymbol of referencedSymbols) {
        for (const reference of referencedSymbol.getReferences()) {
          console.log('---------')
          console.log('REFERENCE')
          console.log('---------')
          console.log('File path: ' + reference.getSourceFile().getFilePath())
          console.log('Start: ' + reference.getTextSpan().getStart())
          console.log('Length: ' + reference.getTextSpan().getLength())
          console.log('Parent kind: ' + reference.getNode().getParentOrThrow().getKindName())
          console.log('\n')
        }
      }
    }
  }
}

async function findMethodReferences(className: string, methodName: string) {

  // Iterate through each source file in the project
  project.getSourceFiles().forEach((sourceFile: SourceFile) => {
    // Find all occurrences of the method within the class
    const classDeclaration = sourceFile.getClass(className)
    if (classDeclaration) {
      const methodDeclarations = classDeclaration
        .getMethods()
        .filter((method) => method.getName() === methodName)

      // For each method declaration, find its references
      methodDeclarations.forEach((method) => {
        const references = method.findReferences()
        references.forEach((reference) => {
          reference.getReferences().forEach(referenceEntry => {
            const { line, column } = referenceEntry.getSourceFile().getLineAndColumnAtPos(referenceEntry.getTextSpan().getStart());
            console.log(`Found reference in ${referenceEntry.getSourceFile().getFilePath()} at line ${line}, column ${column}`);
          });
        })
      })
    }
  })
}

// Run the function to find method references
findMethodReferences('Scale', 'getIndFromPitch').catch((err) => console.error('Error finding method references:', err))
