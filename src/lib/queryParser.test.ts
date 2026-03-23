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
    });
    expect(tokens[0].start).toBe(0);
    expect(tokens[0].end).toBe(11);
  });

  it('tokenizes OR keyword between tags', () => {
    const tokens = tokenize('type:flight OR type:ship');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].type).toBe('TAG');
    expect(tokens[1]).toMatchObject({ type: 'OR' });
    expect(tokens[2].type).toBe('TAG');
  });

  it('tokenizes adjacent tags (implicit OR)', () => {
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
    const tokens = tokenize('type:flight country:iran');
    expect(tokens[0].start).toBe(0);
    expect(tokens[0].end).toBe(11);
    expect(tokens[1].start).toBe(12);
    expect(tokens[1].end).toBe(24);
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
    });
  });

  it('parses OR expression', () => {
    const ast = parse('type:flight OR type:ship');
    expect(ast).toEqual({
      type: 'or',
      left: { type: 'tag', prefix: 'type', value: 'flight' },
      right: { type: 'tag', prefix: 'type', value: 'ship' },
    });
  });

  it('parses implicit OR (adjacent terms)', () => {
    const ast = parse('boeing 747');
    expect(ast).toEqual({
      type: 'or',
      left: { type: 'text', value: 'boeing' },
      right: { type: 'text', value: '747' },
    });
  });

  it('parses implicit OR with tags', () => {
    const ast = parse('type:flight country:iran');
    expect(ast).toEqual({
      type: 'or',
      left: { type: 'tag', prefix: 'type', value: 'flight' },
      right: { type: 'tag', prefix: 'country', value: 'iran' },
    });
  });

  it('chains multiple implicit OR terms correctly', () => {
    const ast = parse('type:flight country:iran altitude:>30000');
    // Should be OR(OR(tag, tag), tag) - left-associative
    expect(ast).toEqual({
      type: 'or',
      left: {
        type: 'or',
        left: { type: 'tag', prefix: 'type', value: 'flight' },
        right: { type: 'tag', prefix: 'country', value: 'iran' },
      },
      right: { type: 'tag', prefix: 'altitude', value: '>30000' },
    });
  });

  it('parses plain text to TextNode', () => {
    const ast = parse('boeing');
    expect(ast).toEqual({ type: 'text', value: 'boeing' });
  });

  it('handles trailing OR gracefully', () => {
    const ast = parse('type:flight OR');
    // Should parse as just the tag (trailing operator ignored)
    expect(ast).toEqual({
      type: 'tag',
      prefix: 'type',
      value: 'flight',
    });
  });

  it('handles unclosed parentheses gracefully', () => {
    const ast = parse('(type:flight OR type:ship');
    // Should treat as if closed
    expect(ast).toEqual({
      type: 'or',
      left: { type: 'tag', prefix: 'type', value: 'flight' },
      right: { type: 'tag', prefix: 'type', value: 'ship' },
    });
  });

  it('handles empty tag value as wildcard tag', () => {
    const ast = parse('type:');
    expect(ast).toEqual({ type: 'tag', prefix: 'type', value: '*' });
  });

  it('OR-only: "type:flight type:ship" parses as OR chain', () => {
    const ast = parse('type:flight type:ship');
    expect(ast).toEqual({
      type: 'or',
      left: { type: 'tag', prefix: 'type', value: 'flight' },
      right: { type: 'tag', prefix: 'type', value: 'ship' },
    });
  });
});
