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


/*
input:

line(`debug1 : seg 1 : s_tr 4 : str 1 : q 1`);

line(`debug1 : seg 1 : s_tr 1 : str s1 : q 1
       => param1 0.5 0.8`);

line(`debug1 : seg 1 : s_tr 2 : str 1 : q 1
     => param1 0.5 0.8
     => param3 0.6 0.7`);


visualizeCode output:

line(`debug1 : seg 1 : s_tr 4 : str 1 : q 1`, "5ecb166a-20d7-4611-b084-aab19715e501");

line(`debug1 : seg 1 : s_tr 1 : str s1 : q 1
       => param1 0.5 0.8`, "d7f09931-27e4-4203-98a1-28b16576fed2");

line(`debug1 : seg 1 : s_tr 2 : str 1 : q 1
     => param1 0.5 0.8
     => param3 0.6 0.7`, "e3682f44-5ace-45af-81b4-c3f2c2b8e9a3");


runtimeCode output:

line(`debug1 : seg 1 : s_tr 4 : str 1 : q 1`, ctx, "5ecb166a-20d7-4611-b084-aab19715e501", 0);

line(`debug1 : seg 1 : s_tr 1 : str s1 : q 1
       => param1 0.5 0.8`, ctx, "d7f09931-27e4-4203-98a1-28b16576fed2", 0);

line(`debug1 : seg 1 : s_tr 2 : str 1 : q 1
     => param1 0.5 0.8
     => param3 0.6 0.7`, ctx, "e3682f44-5ace-45af-81b4-c3f2c2b8e9a3", 0);



metadata output:

*/