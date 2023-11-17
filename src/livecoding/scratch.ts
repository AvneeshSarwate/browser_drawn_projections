import * as TS from 'typescript'
import * as acorn from 'acorn'



// adding types to monaco editor - https://stackoverflow.com/a/52294684

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


export function buildFuncTS(tsString: string) {
  const jsSting = TS.transpileModule(tsString, { compilerOptions: { module: TS.ModuleKind.None } })

  console.log('jsString', jsSting)
  const ast = acorn.parse(jsSting.outputText, { ecmaVersion: 2015, sourceType: 'module' })
  console.log('ast', ast)
  //@ts-ignore
  const funcBody = jsSting.outputText.slice(ast.body[0].body.start + 1, ast.body[0].body.end - 1)
  console.log('funcBody', funcBody)
  const func = Function(funcBody)
  return func
}

export function buildFuncJS(jsString: string) {

  console.log('jsString', jsString)
  let ast: acorn.Program | undefined = undefined
  try {
    ast = acorn.parse(jsString, { ecmaVersion: 2020, sourceType: 'module' })
  } catch (e) {
    console.log('error parsing jsString', e)
  }
  console.log('ast', ast)
  //@ts-ignore
  const funcBody = jsString.slice(ast.body[0].body.start + 1, ast.body[0].body.end - 1)
  console.log('funcBody', funcBody)
  const func = Function('launch', funcBody)
  return func
}