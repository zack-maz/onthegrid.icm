// Query serializer: converts AST back to a display string
// Ensures round-trip: parse(serialize(parse(input))) === parse(input)

import type { QueryNode } from './queryParser';

/**
 * Serialize a QueryNode AST back to a display string.
 * Uses implicit OR (space-separated) for natural display.
 */
export function serialize(node: QueryNode | null): string {
  if (!node) return '';
  return serializeNode(node);
}

function serializeNode(node: QueryNode): string {
  switch (node.type) {
    case 'tag': {
      const val = node.value === '*' ? '' : node.value;
      return `${node.prefix}:${val}`;
    }
    case 'text':
      return node.value;
    case 'or': {
      const left = serializeNode(node.left);
      const right = serializeNode(node.right);
      return `${left} ${right}`;
    }
  }
}
