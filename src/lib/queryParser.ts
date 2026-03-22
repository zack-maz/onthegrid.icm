// Query parser: tokenizer + recursive descent AST builder
// Grammar: expr = term (OR term)*, term = factor (AND|implicit factor)*, factor = '!' factor | '(' expr ')' | tag | text

// ─── AST Node Types ───────────────────────────────────────────

export type QueryNode =
  | TagNode
  | TextNode
  | AndNode
  | OrNode
  | NotNode;

export interface TagNode {
  type: 'tag';
  prefix: string;
  value: string;
  negated: boolean;
}

export interface TextNode {
  type: 'text';
  value: string;
}

export interface AndNode {
  type: 'and';
  left: QueryNode;
  right: QueryNode;
}

export interface OrNode {
  type: 'or';
  left: QueryNode;
  right: QueryNode;
}

export interface NotNode {
  type: 'not';
  child: QueryNode;
}

// ─── Token Types ──────────────────────────────────────────────

export type TokenType = 'TAG' | 'TEXT' | 'AND' | 'OR' | 'LPAREN' | 'RPAREN';

export interface Token {
  type: TokenType;
  value: string;
  prefix?: string;
  tagValue?: string;
  negated?: boolean;
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

    // Read a word (including ! prefix, : separator, and range operators)
    const start = i;
    let negated = false;

    // Check for ! prefix
    if (input[i] === '!') {
      negated = true;
      i++;
    }

    // Read word characters (anything except whitespace and parens)
    const wordStart = i;
    while (i < input.length && input[i] !== ' ' && input[i] !== '\t' && input[i] !== '(' && input[i] !== ')') {
      i++;
    }

    const word = input.slice(wordStart, i);
    const fullValue = input.slice(start, i);

    if (!word) {
      // Just a lone '!' - treat as text
      if (negated) {
        tokens.push({ type: 'TEXT', value: '!', start, end: i });
      }
      continue;
    }

    // Check for AND/OR keywords (uppercase only, no negation prefix)
    if (!negated && word === 'AND') {
      tokens.push({ type: 'AND', value: 'AND', start, end: i });
      continue;
    }
    if (!negated && word === 'OR') {
      tokens.push({ type: 'OR', value: 'OR', start, end: i });
      continue;
    }

    // Check for tag syntax (prefix:value)
    const colonIdx = word.indexOf(':');
    if (colonIdx > 0 && colonIdx < word.length - 1) {
      // Has colon with content on both sides -> TAG
      const prefix = word.slice(0, colonIdx);
      const tagValue = word.slice(colonIdx + 1);
      tokens.push({
        type: 'TAG',
        value: fullValue,
        prefix,
        tagValue,
        negated,
        start,
        end: i,
      });
      continue;
    }

    // Empty tag value (e.g., "type:") -> treat as TEXT
    // Or no colon -> TEXT
    tokens.push({
      type: 'TEXT',
      value: negated ? word : fullValue,
      negated: negated || undefined,
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

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    return tokens[pos++];
  }

  function isAtEnd(): boolean {
    return pos >= tokens.length;
  }

  // expr = term (OR term)*
  function parseOr(): QueryNode | null {
    let left = parseAnd();
    if (!left) return null;

    while (!isAtEnd() && peek()?.type === 'OR') {
      consume(); // eat OR
      const right = parseAnd();
      if (!right) break; // trailing OR
      left = { type: 'or', left, right };
    }

    return left;
  }

  // term = factor (AND|implicit factor)*
  function parseAnd(): QueryNode | null {
    let left = parseFactor();
    if (!left) return null;

    while (!isAtEnd()) {
      const t = peek();
      if (!t) break;

      if (t.type === 'AND') {
        consume(); // eat AND
        const right = parseFactor();
        if (!right) break; // trailing AND
        left = { type: 'and', left, right };
      } else if (t.type === 'TAG' || t.type === 'TEXT' || t.type === 'LPAREN') {
        // Implicit AND: next factor without operator
        const right = parseFactor();
        if (!right) break;
        left = { type: 'and', left, right };
      } else {
        break;
      }
    }

    return left;
  }

  // factor = '!' factor | '(' expr ')' | tag | text
  function parseFactor(): QueryNode | null {
    const t = peek();
    if (!t) return null;

    // Parenthesized expression
    if (t.type === 'LPAREN') {
      consume(); // eat (
      const expr = parseOr();
      // Consume matching RPAREN if present
      if (!isAtEnd() && peek()?.type === 'RPAREN') {
        consume(); // eat )
      }
      return expr;
    }

    // TAG token
    if (t.type === 'TAG') {
      consume();
      return {
        type: 'tag',
        prefix: t.prefix!,
        value: t.tagValue!,
        negated: t.negated ?? false,
      };
    }

    // TEXT token
    if (t.type === 'TEXT') {
      consume();
      const textNode: TextNode = { type: 'text', value: t.value };
      if (t.negated) {
        return { type: 'not', child: textNode };
      }
      return textNode;
    }

    // Skip unexpected tokens (RPAREN, stray AND/OR)
    consume();
    return parseFactor();
  }

  return parseOr();
}
