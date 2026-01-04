export interface GlslArgument {
  name: string;
  type: string;
}

export interface GlslFunction {
  name: string;
  returnType: string;
  args: GlslArgument[];
}

export interface GlslStructMember {
  name: string;
  type: string;
}

export interface GlslStruct {
  name: string;
  members: GlslStructMember[];
}

const QUALIFIERS = new Set(['in', 'out', 'inout', 'const', 'highp', 'mediump', 'lowp', 'uniform']);

export function stripComments(source: string): string {
  const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlock.replace(/\/\/.*$/gm, '');
}

export function parseStructs(source: string): GlslStruct[] {
  const structs: GlslStruct[] = [];
  const structRegex = /struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\};/g;
  let match: RegExpExecArray | null;

  while ((match = structRegex.exec(source))) {
    const structName = match[1];
    const body = match[2];
    const cleanedBody = stripComments(body);
    const members: GlslStructMember[] = [];
    const lines = cleanedBody.split(';');
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        continue;
      }
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) {
        continue;
      }
      const nameToken = tokens[tokens.length - 1];
      const typeToken = tokens[tokens.length - 2];
      const name = nameToken.replace(/\[.*\]$/, '');
      members.push({ name, type: typeToken });
    }
    structs.push({ name: structName, members });
  }

  return structs;
}

export function parseFunctions(source: string): GlslFunction[] {
  const functions: GlslFunction[] = [];
  const stripped = stripComments(source);
  const fnRegex = /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = fnRegex.exec(stripped))) {
    const returnType = match[1];
    const name = match[2];
    const argsSource = match[3];
    const args: GlslArgument[] = [];
    const argParts = argsSource.split(',');
    for (const argPart of argParts) {
      const trimmed = argPart.trim();
      if (!trimmed) {
        continue;
      }
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      while (tokens.length > 0 && QUALIFIERS.has(tokens[0])) {
        tokens.shift();
      }
      if (tokens.length < 2) {
        continue;
      }
      const nameToken = tokens[tokens.length - 1];
      const typeToken = tokens[tokens.length - 2];
      const nameValue = nameToken.replace(/\[.*\]$/, '');
      args.push({ name: nameValue, type: typeToken });
    }
    functions.push({ name, returnType, args });
  }
  return functions;
}
