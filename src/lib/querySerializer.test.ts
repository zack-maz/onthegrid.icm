import { describe, it, expect } from 'vitest';
import { serialize } from './querySerializer';
import { parse } from './queryParser';
import type { QueryNode } from './queryParser';

describe('serialize', () => {
  it('returns empty string for null', () => {
    expect(serialize(null)).toBe('');
  });

  it('serializes a TagNode', () => {
    const node: QueryNode = { type: 'tag', prefix: 'type', value: 'flight', negated: false };
    expect(serialize(node)).toBe('type:flight');
  });

  it('serializes a negated TagNode', () => {
    const node: QueryNode = { type: 'tag', prefix: 'country', value: 'iran', negated: true };
    expect(serialize(node)).toBe('!country:iran');
  });

  it('serializes a TextNode', () => {
    const node: QueryNode = { type: 'text', value: 'boeing' };
    expect(serialize(node)).toBe('boeing');
  });

  it('serializes a NotNode (negated freeform text)', () => {
    const node: QueryNode = { type: 'not', child: { type: 'text', value: 'boeing' } };
    expect(serialize(node)).toBe('!boeing');
  });

  it('serializes an AndNode with implicit AND', () => {
    const node: QueryNode = {
      type: 'and',
      left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
      right: { type: 'tag', prefix: 'country', value: 'iran', negated: false },
    };
    expect(serialize(node)).toBe('type:flight country:iran');
  });

  it('serializes an OrNode', () => {
    const node: QueryNode = {
      type: 'or',
      left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
      right: { type: 'tag', prefix: 'type', value: 'ship', negated: false },
    };
    expect(serialize(node)).toBe('type:flight OR type:ship');
  });

  it('adds parentheses around OR children of AND nodes', () => {
    const node: QueryNode = {
      type: 'and',
      left: {
        type: 'or',
        left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
        right: { type: 'tag', prefix: 'type', value: 'ship', negated: false },
      },
      right: { type: 'tag', prefix: 'country', value: 'iran', negated: false },
    };
    expect(serialize(node)).toBe('(type:flight OR type:ship) country:iran');
  });

  it('does not add unnecessary parentheses for simple AND', () => {
    const node: QueryNode = {
      type: 'and',
      left: { type: 'tag', prefix: 'type', value: 'flight', negated: false },
      right: { type: 'tag', prefix: 'type', value: 'ship', negated: false },
    };
    expect(serialize(node)).toBe('type:flight type:ship');
  });
});

describe('round-trip', () => {
  const cases = [
    'type:flight',
    'type:flight country:iran',
    'type:flight OR type:ship',
    '(type:flight OR type:ship) country:iran',
    '!country:iran',
    'boeing',
    '!boeing',
    'type:flight country:iran altitude:>30000',
  ];

  for (const input of cases) {
    it(`round-trips: "${input}"`, () => {
      const ast1 = parse(input);
      const serialized = serialize(ast1);
      const ast2 = parse(serialized);
      // ASTs should be structurally equivalent
      expect(ast2).toEqual(ast1);
    });
  }

  it('serialize(parse(input)) produces valid re-parseable string', () => {
    const input = '(type:flight OR type:ship) AND !country:turkey';
    const ast1 = parse(input);
    const serialized = serialize(ast1);
    const ast2 = parse(serialized);
    expect(ast2).toEqual(ast1);
  });
});
