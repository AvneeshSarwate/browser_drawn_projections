import * as TS from 'typescript'
import * as acorn from 'acorn'

import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

import { channelDefs } from './chanelSrc';
import { p5defs } from './p5Defs';
import { scaleDef } from './scaleDef';
import { playbackDefs } from './playbackDefs';
import { channelExportString } from '@/channels/exports';
import { transform } from 'sucrase';


self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') {
      return new TsWorker();
    }
    return new EditorWorker();
  }
};



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


function nodeSlice(input: string, node: any): string {
  return input.substring(node.start, node.end)
}

function parseEditorVal(editor: monaco.editor.IStandaloneCodeEditor): Function | undefined {
  const editorVal = editor.getValue()
  if (editorVal) {
    const sucraseFunc = transform(editorVal, { transforms: ['typescript'] }).code
    const acParse = acorn.parse(sucraseFunc, { ecmaVersion: 2020, sourceType: 'module' })
    //@ts-ignore
    const bodyString = nodeSlice(sucraseFunc, acParse.body[0].body)

    const libAddedSrc = `
    ${channelExportString}

    ${bodyString}
    `

    return Function('chanExports', 'p5sketch', 'inst', 'scale', 'savedState', 'noteInfo', libAddedSrc)
  }
}

function createEditor(tsSource: string) {
  // validation settings
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  // compiler options
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2015,
    allowNonTsExtensions: true,
  });

  const infoSrc = channelDefs

  const channelUri = "ts:filename/channels.d.ts"
  monaco.languages.typescript.typescriptDefaults.addExtraLib(infoSrc, channelUri)
  // editorModel = monaco.editor.createModel(infoSrc, "typescript", monaco.Uri.parse(channelUri))

  const p5uri = "ts:filename/p5.d.ts"
  monaco.languages.typescript.typescriptDefaults.addExtraLib(p5defs, p5uri)
  // monaco.editor.createModel(p5defs, "typescript", monaco.Uri.parse(p5uri))

  const playbackUri = "ts:filename/playback.d.ts"
  monaco.languages.typescript.typescriptDefaults.addExtraLib(playbackDefs, playbackUri)

  const scaleUri = "ts:filename/scale.d.ts"
  monaco.languages.typescript.typescriptDefaults.addExtraLib(scaleDef, scaleUri)

  return monaco.editor.create(document.getElementById('monacoHolder')!!, {
      value: tsSource,
      language: 'typescript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: {
        enabled: true
      }
    });
}