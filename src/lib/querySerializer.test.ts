import { describe, it, expect } from 'vitest';
import { serialize } from './querySerializer';
import { parse } from './queryParser';
import type { QueryNode } from './queryParser';

describe('serialize', () => {
  it('returns empty string for null', () => {
    expect(serialize(null)).toBe('');
  });

  it('serializes a TagNode', () => {
    const node: QueryNode = { type: 'tag', prefix: 'type', value: 'flight' };
    expect(serialize(node)).toBe('type:flight');
  });

  it('serializes a TextNode', () => {
    const node: QueryNode = { type: 'text', value: 'boeing' };
    expect(serialize(node)).toBe('boeing');
  });

  it('serializes an OrNode', () => {
    const node: QueryNode = {
      type: 'or',
      left: { type: 'tag', prefix: 'type', value: 'flight' },
      right: { type: 'tag', prefix: 'type', value: 'ship' },
    };
    expect(serialize(node)).toBe('type:flight type:ship');
  });

  it('serializes wildcard tag (value: *) with trailing colon', () => {
    const node: QueryNode = { type: 'tag', prefix: 'site', value: '*' };
    expect(serialize(node)).toBe('site:');
  });

  it('serializes nested OR chain', () => {
    const node: QueryNode = {
      type: 'or',
      left: {
        type: 'or',
        left: { type: 'tag', prefix: 'type', value: 'flight' },
        right: { type: 'tag', prefix: 'country', value: 'iran' },
      },
      right: { type: 'tag', prefix: 'altitude', value: '>30000' },
    };
    expect(serialize(node)).toBe('type:flight country:iran altitude:>30000');
  });
});

describe('round-trip', () => {
  const cases = [
    'type:flight',
    'type:flight country:iran',
    'type:flight OR type:ship',
    'boeing',
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
});
