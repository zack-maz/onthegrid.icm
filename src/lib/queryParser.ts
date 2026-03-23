// Query parser: tokenizer + recursive descent AST builder
// Grammar: expr = factor (OR|implicit factor)* — all terms OR together

// ─── AST Node Types ───────────────────────────────────────────

export type QueryNode =
  | TagNode
  | TextNode
  | OrNode;

export interface TagNode {
  type: 'tag';
  prefix: string;
  value: string;
}

export interface TextNode {
  type: 'text';
  value: string;
}

export interface OrNode {
  type: 'or';
  left: QueryNode;
  right: QueryNode;
}

// ─── Token Types ──────────────────────────────────────────────

export type TokenType = 'TAG' | 'TEXT' | 'OR' | 'LPAREN' | 'RPAREN';

export interface Token {
  type: TokenType;
  value: string;
  prefix?: string;
  tagValue?: string;
  start: number;
  end: number;
}

// ─── Tokenizer ────────────────────────────────────────────────

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (input[i] === ' ' || input[i] === '\t') {
      i++;
      continue;
    }

    // Parentheses
    if (input[i] === '(') {
      tokens.push({ type: 'LPAREN', value: '(', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (input[i] === ')') {
      tokens.push({ type: 'RPAREN', value: ')', start: i, end: i + 1 });
      i++;
      continue;
    }

    // Read a word (including : separator and range operators)
    const start = i;

    // Read word characters (anything except whitespace and parens)
    const wordStart = i;
    while (i < input.length && input[i] !== ' ' && input[i] !== '\t' && input[i] !== '(' && input[i] !== ')') {
      i++;
    }

    const word = input.slice(wordStart, i);

    if (!word) {
      continue;
    }

    // Check for OR keyword (uppercase only)
    if (word === 'OR') {
      tokens.push({ type: 'OR', value: 'OR', start, end: i });
      continue;
    }

    // Check for tag syntax (prefix:value)
    const colonIdx = word.indexOf(':');
    if (colonIdx > 0) {
      const prefix = word.slice(0, colonIdx);
      // Trailing colon with no value (e.g., "site:") -> wildcard TAG with value "*"
      const tagValue = colonIdx < word.length - 1 ? word.slice(colonIdx + 1) : '*';
      tokens.push({
        type: 'TAG',
        value: word,
        prefix,
        tagValue,
        start,
        end: i,
      });
      continue;
    }

    // No colon -> TEXT
    tokens.push({
      type: 'TEXT',
      value: word,
      start,
      end: i,
    });
  }

  return tokens;
}

// ─── Parser (Recursive Descent) ──────────────────────────────

export function parse(input: string): QueryNode | null {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;

  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }
  function consume(): Token { return tokens[pos++]; }
  function isAtEnd(): boolean { return pos >= tokens.length; }

  // factor = '(' expr ')' | tag | text
  function parseFactor(): QueryNode | null {
    const t = peek();
    if (!t) return null;

    if (t.type === 'LPAREN') {
      consume();
      const expr = parseExpr();
      if (!isAtEnd() && peek()?.type === 'RPAREN') consume();
      return expr;
    }

    if (t.type === 'TAG') {
      consume();
      return { type: 'tag', prefix: t.prefix!, value: t.tagValue! };
    }

    if (t.type === 'TEXT') {
      consume();
      return { type: 'text', value: t.value };
    }

    consume(); // skip unexpected
    return parseFactor();
  }

  // expr = factor (OR|implicit factor)*
  function parseExpr(): QueryNode | null {
    let left = parseFactor();
    if (!left) return null;

    while (!isAtEnd()) {
      const t = peek();
      if (!t) break;

      if (t.type === 'OR') {
        consume();
        const right = parseFactor();
        if (!right) break;
        left = { type: 'or', left, right };
      } else if (t.type === 'TAG' || t.type === 'TEXT' || t.type === 'LPAREN') {
        const right = parseFactor();
        if (!right) break;
        left = { type: 'or', left, right }; // implicit OR
      } else {
        break;
      }
    }

    return left;
  }

  return parseExpr();
}
