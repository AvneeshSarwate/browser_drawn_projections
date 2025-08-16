import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RotateCcw, Sparkles, ClipboardCopy, Play } from "lucide-react";
import * as acorn from "acorn";
import * as walk from "acorn-walk";

// --- Transformer (browser-only, no MagicString, no sourcemaps) ---
function transformLineCalls(source) {
  const ast = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowAwaitOutsideFunction: true,
  });

  /** @type {{start:number,end:number,text:string}[]} */
  const patches = [];

  walk.simple(ast, {
    CallExpression(node) {
      if (node.callee?.type !== "Identifier" || node.callee.name !== "line") return;
      if (!node.arguments?.length) return;

      const arg0 = node.arguments[0];
      const isTemplate = arg0.type === "TemplateLiteral";
      const isStringLiteral = arg0.type === "Literal" && typeof arg0.value === "string";
      if (!isTemplate && !isStringLiteral) return; // skip non-string calls

      // Respect user's rule: no expressions allowed in template literals
      if (isTemplate && arg0.expressions && arg0.expressions.length > 0) return;

      // Preserve exact text (including quotes/backticks & newlines) for the first arg
      const arg0Text = source.slice(arg0.start, arg0.end);

      // Generate a UUID *now* and embed it as a string literal
      const id = crypto.randomUUID();

      const replacement = `line(${arg0Text}, "${id}")`;
      patches.push({ start: node.start, end: node.end, text: replacement });
    },
  });

  // Apply patches right-to-left so indexes don't shift
  patches.sort((a, b) => b.start - a.start);

  let out = source;
  for (const p of patches) {
    out = out.slice(0, p.start) + p.text + out.slice(p.end);
  }
  return { code: out, count: patches.length };
}

// --- Finder: Acorn-based reimplementation of findLineCallMatches ---
/**
 * @param {string} jsCode
 * @returns {Array<{ start:number, end:number, templateStart:number, templateEnd:number, templateStartLine:number, content:string, lines: {content:string,startIndex:number,endIndex:number}[], groups: {clipLine:string, rampLines:string[]}[] }>}
 */
function findLineCallMatches(jsCode) {
  const ast = acorn.parse(jsCode, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowAwaitOutsideFunction: true,
  });

  const matches = [];

  walk.simple(ast, {
    CallExpression(node) {
      if (node.callee?.type !== "Identifier" || node.callee.name !== "line") return;
      if (!node.arguments?.length) return;

      const arg0 = node.arguments[0];
      const isTemplate = arg0.type === "TemplateLiteral";
      const isStringLiteral = arg0.type === "Literal" && typeof arg0.value === "string";
      if (!isTemplate && !isStringLiteral) return; // skip non-string calls

      // For template literals, require no expressions to mirror original semantics
      if (isTemplate && arg0.expressions && arg0.expressions.length > 0) return;

      const start = node.start;
      const end = node.end;
      const templateStart = arg0.start; // index of opening backtick or quote
      const templateEnd = arg0.end - 1; // index of closing backtick or quote

      const content = isTemplate
        ? jsCode.slice(templateStart + 1, templateEnd)
        : String(arg0.value);

      const beforeCallText = jsCode.slice(0, start);
      // Count newlines correctly
      const templateStartLine = (beforeCallText.match(/\n/g) || []).length; // 0-based, like original

      // Parse individual lines within the template/string
      const lines = [];
      const contentLines = content.split("\n");
      let currentIndex = 0;

      contentLines.forEach((lineContent, index) => {
        const trimmedContent = lineContent.trim();
        if (trimmedContent) {
          const lineStartIndex = templateStart + 1 + currentIndex;
          const lineEndIndex = lineStartIndex + lineContent.length;
          lines.push({ content: trimmedContent, startIndex: lineStartIndex, endIndex: lineEndIndex });
        }
        currentIndex += lineContent.length + (index < contentLines.length - 1 ? 1 : 0);
      });

      // Grouping logic (clip line + optional ramp lines)
      const allLines = content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const groups = [];
      let currentClipLine = "";
      let currentRampLines = [];

      for (const l of allLines) {
        if (l.startsWith("=> ")) {
          currentRampLines.push(l);
        } else {
          if (currentClipLine) {
            groups.push({ clipLine: currentClipLine, rampLines: [...currentRampLines] });
          }
          currentClipLine = l;
          currentRampLines = [];
        }
      }
      if (currentClipLine) {
        groups.push({ clipLine: currentClipLine, rampLines: [...currentRampLines] });
      }

      matches.push({ start, end, templateStart, templateEnd, templateStartLine, content, lines, groups });
    },
  });

  return matches;
}

// --- AST-based transformToRuntime ---
/**
 * Takes visualizeCode (output of transformLineCalls) and a voiceIndex,
 * and rewrites every `line(template, "uuid")` call into:
 *   line(template, ctx, "uuid", voiceIndex)
 * It preserves all surrounding structure (no added braces or extra statements).
 * @param {string} visualizeCode
 * @param {number} voiceIndex
 * @returns {string}
 */
function transformToRuntime(visualizeCode, voiceIndex) {
  const ast = acorn.parse(visualizeCode, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowAwaitOutsideFunction: true,
  });

  /** @type {{start:number,end:number,text:string}[]} */
  const patches = [];

  // Preserve structure; only change arguments of line() calls
  walk.simple(ast, {
    CallExpression(node) {
      if (node.callee?.type !== "Identifier" || node.callee.name !== "line") return;
      const args = node.arguments || [];
      if (args.length < 2) return; // expect template + uuid from transformLineCalls

      const arg0 = args[0];
      const arg1 = args[1];
      const isTemplate = arg0.type === "TemplateLiteral";
      const isStringLit = arg0.type === "Literal" && typeof arg0.value === "string";
      if (!isTemplate && !isStringLit) return;
      if (isTemplate && arg0.expressions && arg0.expressions.length > 0) return;

      const arg0Text = visualizeCode.slice(arg0.start, arg0.end);
      const arg1Text = visualizeCode.slice(arg1.start, arg1.end);

      const replacement = `line(${arg0Text}, ctx, ${arg1Text}, ${voiceIndex})`;
      patches.push({ start: node.start, end: node.end, text: replacement });
    },
  });

  patches.sort((a, b) => b.start - a.start);
  let out = visualizeCode;
  for (const p of patches) {
    out = out.slice(0, p.start) + p.text + out.slice(p.end);
  }
  return out;
}

const SAMPLE = `// Try editing this! Then click Transform.\n\nline(` + "`" + `debug1 : seg 1 : s_tr 4 : str 1 : q 1` + "`" + `);\n\nline(` + "`" + `debug1 : seg 1 : s_tr 1 : str s1 : q 1\n       => param1 0.5 0.8` + "`" + `);\n\nline(` + "`" + `debug1 : seg 1 : s_tr 2 : str 1 : q 1\n     => param1 0.5 0.8\n     => param3 0.6 0.7` + "`" + `);\n`;

// --- Minimal test runner ---
function runTests() {
  /** @type {Array<{name:string, pass:boolean, details?:any}>} */
  const results = [];

  // 1) Simple single-line transform
  {
    const src = "line(`a`)";
    const { code, count } = transformLineCalls(src);
    const uuidLike = /line\(`a`,\s*"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\)/i.test(code);
    results.push({ name: "transform: single-line", pass: count === 1 && uuidLike, details: { code, count } });
  }

  // 2) Multi-line with ramp lines (finder groups)
  {
    const src = "line(`clip line\n=> r1\n=> r2`)";
    const found = findLineCallMatches(src);
    const ok = found.length === 1 && found[0].groups.length === 1 && found[0].groups[0].rampLines.length === 2;
    results.push({ name: "finder: groups", pass: ok, details: found[0] });
  }

  // 3) Skip non-string argument
  {
    const src = "line(42)";
    const found = findLineCallMatches(src);
    const { count } = transformLineCalls(src);
    results.push({ name: "skip: non-string arg", pass: found.length === 0 && count === 0, details: { foundLen: found.length, count } });
  }

  // 4) Skip template with expressions (finder)
  {
    const src = "line(`a ${'$'}{x}`)";
    const found = findLineCallMatches(src);
    results.push({ name: "skip: template with expressions (finder)", pass: found.length === 0, details: found });
  }

  // 4b) Skip template with expressions (transformer)
  {
    const src = "line(`a ${'$'}{x}`)";
    const { code, count } = transformLineCalls(src);
    results.push({ name: "skip: template with expressions (transformer)", pass: count === 0 && code === src, details: { code, count } });
  }

  // 5) templateStartLine counting
  {
    const src = "const z=0;\n\nline(`x`)";
    const found = findLineCallMatches(src);
    const ok = found.length === 1 && found[0].templateStartLine === 2; // two newlines before call
    results.push({ name: "finder: templateStartLine", pass: ok, details: found[0]?.templateStartLine });
  }

  // 6) runtime does NOT touch legacy await runLine
  {
    const vis = `await runLine(` + "`" + `a` + "`" + `, "u")\nawait runLine(` + "`" + `b` + "`" + `, "v")`;
    const out = transformToRuntime(vis, 7);
    const ok = out === vis && !out.includes(', ctx,');
    results.push({ name: "runtime: does NOT touch legacy await runLine", pass: ok, details: out });
  }

  // 7) runtime transform from line()
  {
    const vis = `line(` + "`" + `a` + "`" + `, "u")\nline(` + "`" + `b` + "`" + `, "v")`;
    const out = transformToRuntime(vis, 3);
    const ok = out.includes('line(`a`, ctx, "u", 3)')
      && out.includes('line(`b`, ctx, "v", 3)')
      && !out.includes('hotswapCued')
      && !out.includes('await runLine(');
    results.push({ name: "runtime: transformToRuntime adds ctx & voiceIndex", pass: ok, details: out });
  }

  // 8) transform inside if without braces: if(x) line(...)
  {
    const vis = `if (x) line(` + "`" + `a` + "`" + `, "u")`;
    const out = transformToRuntime(vis, 5);
    const ok = out.includes('if (x) line(`a`, ctx, "u", 5)') && !out.includes('{\n') && !out.includes('}\n');
    results.push({ name: "runtime: if(x) line(...) keeps no braces & transforms args", pass: ok, details: out });
  }

  // 9) transform inside if with braces: if(x){ line(...) }
  {
    const vis = `if (x) {\n  line(` + "`" + `a` + "`" + `, \"u\")\n}`;
    const out = transformToRuntime(vis, 6);
    const ok = out.includes('if (x) {') && out.includes('line(`a`, ctx, "u", 6)') && out.includes('}\n');
    results.push({ name: "runtime: if(x){ line(...) } transforms args inside block", pass: ok, details: out });
  }

  // 10) transformLineCalls inside if(x) ... (UUID added)
  {
    const src = `if(x) line(` + "`" + `a` + "`" + `)`;
    const { code, count } = transformLineCalls(src);
    const ok = count === 1 && /if\(x\)\s*line\(`a`,\s*"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\)/i.test(code);
    results.push({ name: "transformLineCalls: if(x) line(...) adds UUID", pass: ok, details: code });
  }

  return results;
}

export default function AcornLineTransformerCanvas() {
  const [input, setInput] = useState(SAMPLE);
  const [output, setOutput] = useState("");
  const [count, setCount] = useState(0);
  const [matches, setMatches] = useState([]);
  const [tests, setTests] = useState([]);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [runtimeOutput, setRuntimeOutput] = useState("");

  const onTransform = () => {
    try {
      // First, find matches using Acorn
      const found = findLineCallMatches(input);
      setMatches(found);

      // Then, perform the transform to line(..., uuid)
      const { code, count } = transformLineCalls(input);
      setOutput(code);
      setCount(count);

      // Finally, transform to runtime with ctx & voiceIndex
      const runtime = transformToRuntime(code, Number(voiceIndex) || 0);
      setRuntimeOutput(runtime);
    } catch (e) {
      const msg = String(e?.message || e);
      setOutput(msg);
      setRuntimeOutput(msg);
      setCount(0);
      setMatches([]);
    }
  };

  const onReset = () => {
    setInput(SAMPLE);
    setOutput("");
    setRuntimeOutput("");
    setCount(0);
    setMatches([]);
    setTests([]);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
    } catch {}
  };

  const onRunTests = () => {
    try {
      setTests(runTests());
    } catch (e) {
      setTests([{ name: "test runner crashed", pass: false, details: String(e?.message || e) }]);
    }
  };

  const passed = tests.filter(t => t.pass).length;

  return (
    <div className="p-6 grid gap-6 lg:grid-cols-2">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Input (JavaScript)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            className="min-h-[360px] font-mono text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your JS here..."
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={onTransform} className="gap-2">
              <Sparkles className="h-4 w-4" /> Transform
            </Button>
            <Button onClick={onReset} variant="secondary" className="gap-2">
              <RotateCcw className="h-4 w-4" /> Reset demo
            </Button>
            <Button onClick={onRunTests} variant="outline" className="gap-2">
              <Play className="h-4 w-4" /> Run tests
            </Button>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">voiceIndex</label>
              <Input type="number" className="w-24" value={voiceIndex} onChange={(e) => setVoiceIndex(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Output {count ? `(transformed ${count} call${count===1?"":"s"})` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            readOnly
            className="min-h-[360px] font-mono text-sm"
            value={output}
            placeholder="Result will appear here after you click Transform."
          />
          <div className="flex items-center gap-2">
            <Button onClick={onCopy} variant="outline" className="gap-2" disabled={!output}>
              <ClipboardCopy className="h-4 w-4" /> Copy output
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The transformer keeps <code>line()</code> and appends a UUID; no <code>await</code> is added.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-lg lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-xl">Runtime Output (transformToRuntime)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            className="min-h-[220px] font-mono text-sm"
            value={runtimeOutput}
            placeholder="Runtime code (with ctx & voiceIndex) will appear here after Transform."
          />
        </CardContent>
      </Card>

      <Card className="shadow-lg lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-xl">Matches (Acorn) {matches?.length ? `- ${matches.length} found` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs overflow-auto max-h-[420px] p-3 bg-muted rounded-xl">{JSON.stringify(matches, null, 2)}</pre>
        </CardContent>
      </Card>

      <Card className="shadow-lg lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-xl">Tests {tests.length ? `- ${passed}/${tests.length} passed` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {tests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Click <em>Run tests</em> to validate the finder & transformer.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {tests.map((t, i) => (
                <li key={i} className={`p-2 rounded-xl border ${t.pass ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                  <div className="font-medium">{t.pass ? '✅' : '❌'} {t.name}</div>
                  {t.details !== undefined && (
                    <pre className="mt-1 text-xs overflow-auto max-h-48">{typeof t.details === 'string' ? t.details : JSON.stringify(t.details, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
