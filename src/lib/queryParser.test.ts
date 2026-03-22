import { describe, it, expect } from 'vitest';
import { tokenize, parse, type Token, type QueryNode } from './queryParser';

describe('tokenize', () => {
  it('tokenizes a single TAG token', () => {
    const tokens = tokenize('type:flight');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: 'TAG',
      prefix: 'type',
      tagValue: 'flight',
      negated: false,
    });
    expect(tokens[0].start).toBe(0);
    expect(tokens[0].end).toBe(11);
  });

  it('tokenizes a negated TAG token', () => {
    const tokens = tokenize('!country:iran');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: 'TAG',
      prefix: 'country',
      tagValue: 'iran',
      negated: true,
    });
  });

  it('tokenizes AND keyword between tags', () => {
    const tokens = tokenize('type:flight AND country:iran');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].type).toBe('TAG');
    expect(tokens[1]).toMatchObject({ type: 'AND' });
    expect(tokens[2].type).toBe('TAG');
  });

  it('tokenizes OR keyword between tags', () => {
    const tokens = tokenize('type:flight OR type:ship');
    expect(tokens).toHaveLength(3);
    expect(tokens[1]).toMatchObject({ type: 'OR' });
  });

  it('tokenizes implicit AND (adjacent tags with no operator)', () => {
    const tokens = tokenize('type:flight country:iran');
    expect(tokens).toHaveLength(2);
    expect(tokens[0].type).toBe('TAG');
    expect(tokens[1].type).toBe('TAG');
  });

  it('tokenizes parentheses', () => {
    const tokens = tokenize('(a OR b)');
    expect(tokens).toHaveLength(5);
    expect(tokens[0]).toMatchObject({ type: 'LPAREN' });
    expect(tokens[4]).toMatchObject({ type: 'RPAREN' });
  });

  it('tokenizes plain text words', () => {
    const tokens = tokenize('boeing 747');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ type: 'TEXT', value: 'boeing' });
    expect(tokens[1]).toMatchObject({ type: 'TEXT', value: '747' });
  });

  it('tokenizes negated freeform text', () => {
    const tokens = tokenize('!boeing');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: 'TEXT', value: 'boeing', negated: true });
  });

  it('preserves range operators in tag values', () => {
    const tokens = tokenize('altitude:>30000');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: 'TAG',
      prefix: 'altitude',
      tagValue: '>30000',
    });
  });

  it('tracks start/end positions', () => {
    const tokens = tokenize('type:flight AND speed:>500');
    expect(tokens[0].start).toBe(0);
    expect(tokens[0].end).toBe(11);
    expect(tokens[1].start).toBe(12);
    expect(tokens[1].end).toBe(15);
    expect(tokens[2].start).toBe(16);
    expect(tokens[2].end).toBe(26);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });

  it('handles tag with range value containing dash', () => {
    const tokens = tokenize('altitude:30000-40000');
    expect(tokens[0]).toMatchObject({
      type: 'TAG',
      prefix: 'altitude',
      tagValue: '30000-40000',
    });
  });
});

describe('parse', () => {
  it('returns null for empty input', () => {
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
  });

  it('parses a single tag to a TagNode', () => {
    const ast = parse('type:flight');
    expect(ast).toEqual({
      type: 'tag',
      prefix: 'type',
      value: 'flight',
      negated: false,
    });
  });

  it('parses AND expression', () => {
    const ast = parse('type:flight AND country:iran');
    expect(ast).toEqual({
      type: 'and',
      left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
      right: { type: 'tag', prefix: 'country', value: 'iran', negated: false },
    });
  });

  it('parses OR expression', () => {
    const ast = parse('type:flight OR type:ship');
    expect(ast).toEqual({
      type: 'or',
      left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
      right: { type: 'tag', prefix: 'type', value: 'ship', negated: false },
    });
  });

  it('AND binds tighter than OR (standard precedence)', () => {
    // a AND b OR c should be (a AND b) OR c
    const ast = parse('type:flight AND country:iran OR type:ship');
    expect(ast).toEqual({
      type: 'or',
      left: {
        type: 'and',
        left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
        right: { type: 'tag', prefix: 'country', value: 'iran', negated: false },
      },
      right: { type: 'tag', prefix: 'type', value: 'ship', negated: false },
    });
  });

  it('parses parenthesized expressions to override precedence', () => {
    // (type:flight OR type:ship) AND country:iran
    const ast = parse('(type:flight OR type:ship) AND country:iran');
    expect(ast).toEqual({
      type: 'and',
      left: {
        type: 'or',
        left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
        right: { type: 'tag', prefix: 'type', value: 'ship', negated: false },
      },
      right: { type: 'tag', prefix: 'country', value: 'iran', negated: false },
    });
  });

  it('parses negated tag', () => {
    const ast = parse('!country:iran');
    expect(ast).toEqual({
      type: 'tag',
      prefix: 'country',
      value: 'iran',
      negated: true,
    });
  });

  it('parses plain text to TextNode', () => {
    const ast = parse('boeing');
    expect(ast).toEqual({ type: 'text', value: 'boeing' });
  });

  it('parses negated freeform text to NotNode(TextNode)', () => {
    const ast = parse('!boeing');
    expect(ast).toEqual({
      type: 'not',
      child: { type: 'text', value: 'boeing' },
    });
  });

  it('parses implicit AND (adjacent terms)', () => {
    const ast = parse('boeing 747');
    expect(ast).toEqual({
      type: 'and',
      left: { type: 'text', value: 'boeing' },
      right: { type: 'text', value: '747' },
    });
  });

  it('parses implicit AND with tags', () => {
    const ast = parse('type:flight country:iran');
    expect(ast).toEqual({
      type: 'and',
      left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
      right: { type: 'tag', prefix: 'country', value: 'iran', negated: false },
    });
  });

  it('chains multiple implicit AND terms correctly', () => {
    const ast = parse('type:flight country:iran altitude:>30000');
    // Should be AND(AND(tag, tag), tag) - left-associative
    expect(ast).toEqual({
      type: 'and',
      left: {
        type: 'and',
        left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
        right: { type: 'tag', prefix: 'country', value: 'iran', negated: false },
      },
      right: { type: 'tag', prefix: 'altitude', value: '>30000', negated: false },
    });
  });

  it('handles trailing operator gracefully', () => {
    const ast = parse('type:flight AND');
    // Should parse as just the tag (trailing operator ignored)
    expect(ast).toEqual({
      type: 'tag',
      prefix: 'type',
      value: 'flight',
      negated: false,
    });
  });

  it('handles unclosed parentheses gracefully', () => {
    const ast = parse('(type:flight OR type:ship');
    // Should treat as if closed
    expect(ast).toEqual({
      type: 'or',
      left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
      right: { type: 'tag', prefix: 'type', value: 'ship', negated: false },
    });
  });

  it('handles empty tag value as text', () => {
    const ast = parse('type:');
    expect(ast).toEqual({ type: 'text', value: 'type:' });
  });
});
