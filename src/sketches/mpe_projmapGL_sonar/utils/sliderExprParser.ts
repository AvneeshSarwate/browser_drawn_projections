// parser for arithmetic expressions with variables, no spaces

// ---------------------------------------------------------------------
// AST node definitions
// ---------------------------------------------------------------------
type NumNode   = { type: 'NumberLiteral';   value: number };
type VarNode   = { type: 'Variable';        name: string };
type UnaryNode = { type: 'UnaryExpression'; operator: '+' | '-'; argument: Node };
type BinNode   = {
  type: 'BinaryExpression';
  operator: '+' | '-' | '*' | '/' | '^';
  left: Node;
  right: Node;
};
type Node = NumNode | VarNode | UnaryNode | BinNode;

// ---------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------
type Operator = '+' | '-' | '*' | '/' | '^' | '(' | ')';
type Token =
  | { kind: 'num'; value: number }
  | { kind: 'id'; name: string }
  | { kind: 'op'; op: Operator };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isAlpha = (c: string) =>
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';

  while (i < src.length) {
    const ch = src[i];

    // number (int or float)
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1]))) {
      let num = '';
      while (i < src.length && (isDigit(src[i]) || src[i] === '.')) num += src[i++];
      tokens.push({ kind: 'num', value: Number(num) });
      continue;
    }

    // identifier
    if (isAlpha(ch)) {
      let id = '';
      while (i < src.length && (isAlpha(src[i]) || isDigit(src[i]))) id += src[i++];
      tokens.push({ kind: 'id', name: id });
      continue;
    }

    // operator / paren
    if ('+-*/^()'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch as Operator });
      i++;
      continue;
    }

    throw new SyntaxError(`Unexpected character “${ch}” at ${i}`);
  }
  return tokens;
}

// ---------------------------------------------------------------------
// Recursive-descent parser
// Grammar (highest precedence at the bottom):
//
// expression  := term (('+' | '-') term)*
// term        := power (('*' | '/') power)*
// power       := unary ('^' power)?             // right-associative
// unary       := ('+' | '-') unary | primary
// primary     := number | identifier | '(' expression ')'
// ---------------------------------------------------------------------
class Parser {
  private pos = 0;
  constructor(private readonly toks: Token[]) {}

  parse(): Node {
    const node = this.parseExpression();
    if (this.pos !== this.toks.length) throw new SyntaxError('Extra tokens');
    return node;
  }

  private parseExpression(): Node {
    let node = this.parseTerm();
    while (this.peekOp('+', '-')) {
      const op = this.consumeOp() as '+' | '-';
      node = { type: 'BinaryExpression', operator: op, left: node, right: this.parseTerm() };
    }
    return node;
  }

  private parseTerm(): Node {
    let node = this.parsePower();
    while (this.peekOp('*', '/')) {
      const op = this.consumeOp() as '*' | '/';
      node = { type: 'BinaryExpression', operator: op, left: node, right: this.parsePower() };
    }
    return node;
  }

  private parsePower(): Node {
    const left = this.parseUnary();
    if (this.peekOp('^')) {
      this.consumeOp(); // '^'
      const right = this.parsePower();            // -- right-assoc!
      return { type: 'BinaryExpression', operator: '^', left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.peekOp('+', '-')) {
      const op = this.consumeOp() as '+' | '-';
      return { type: 'UnaryExpression', operator: op, argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const tok = this.consume();
    if (!tok) throw new SyntaxError('Unexpected end');

    if (tok.kind === 'num') return { type: 'NumberLiteral', value: tok.value };
    if (tok.kind === 'id')  return { type: 'Variable',      name: tok.name };
    if (tok.kind === 'op' && tok.op === '(') {
      const node = this.parseExpression();
      if (!this.peekOp(')')) throw new SyntaxError('Missing “)”');
      this.consumeOp(); // ')'
      return node;
    }
    throw new SyntaxError(`Unexpected token ${JSON.stringify(tok)}`);
  }

  // helpers ------------------------------------------------------------
  private peekOp(...ops: Operator[]): boolean {
    const tok = this.toks[this.pos];
    return tok?.kind === 'op' && ops.includes(tok.op);
  }
  private consumeOp(): Operator {
    const tok = this.toks[this.pos++];
    if (tok?.kind !== 'op') throw new SyntaxError('Expected operator');
    return tok.op;
  }
  private consume(): Token | undefined {
    return this.toks[this.pos++];
  }
}

// ---------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------
function evaluateAST(node: Node, vars: Record<string, number>): number {
  switch (node.type) {
    case 'NumberLiteral':   return node.value;
    case 'Variable': {
      if (!(node.name in vars))
        throw new ReferenceError(`Variable “${node.name}” not supplied`);
      return vars[node.name];
    }
    case 'UnaryExpression': {
      const v = evaluateAST(node.argument, vars);
      return node.operator === '-' ? -v : v;
    }
    case 'BinaryExpression': {
      const l = evaluateAST(node.left, vars);
      const r = evaluateAST(node.right, vars);
      switch (node.operator) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
      }
    }
  }
}

// ---------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------
export function evaluate(expr: string, vars: Record<string, number> = {}): number {
  const ast = new Parser(tokenize(expr)).parse();
  return evaluateAST(ast, vars);
}

// ---------------------------------------------------------------------
// Quick demo / sanity tests
// ---------------------------------------------------------------------
/* eslint-disable no-console */
// if (require.main === module) {
//   console.log(evaluate('-2^2'));                     // -4
//   console.log(evaluate('2^3^2'));                    // 512  (right-assoc)
//   console.log(evaluate('fee*(-x+1)^2', { fee: 2, x: 5 })); // 32
// }
