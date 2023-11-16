import * as TS from 'typescript'
import * as acorn from 'acorn'

export function testCalls() {
  const funcString = TS.transpileModule(
    `
    function add(a: number, b: number): number {
      return a + b
    }
    `,
    { compilerOptions: { module: TS.ModuleKind.None } }
  )

  console.log('funcString', funcString)
  const ast = acorn.parse(funcString.outputText, { ecmaVersion: 2015, sourceType: 'module' })
  console.log('ast', ast)
  //@ts-ignore
  const funcBody = funcString.outputText.slice(ast.body[0].body.start + 1, ast.body[0].body.end - 1)
  console.log('funcBody', funcBody)
  const func = Function('a', 'b', funcBody)
  console.log('func', func(1, 2))
}
