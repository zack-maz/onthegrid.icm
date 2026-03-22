// Query serializer: converts AST back to a display string
// Ensures round-trip: parse(serialize(parse(input))) === parse(input)

import type { QueryNode } from './queryParser';

/**
 * Serialize a QueryNode AST back to a display string.
 * Uses implicit AND (space-separated) for natural display.
 * Adds parentheses around OR nodes that are children of AND nodes
 * to preserve precedence.
 */
export function serialize(node: QueryNode | null): string {
  if (!node) return '';
  return serializeNode(node, null);
}

function serializeNode(node: QueryNode, parent: QueryNode | null): string {
  switch (node.type) {
    case 'tag':
      return `${node.negated ? '!' : ''}${node.prefix}:${node.value}`;

    case 'text':
      return node.value;

    case 'not':
      return `!${serializeNode(node.child, node)}`;

    case 'and': {
      const left = serializeNode(node.left, node);
      const right = serializeNode(node.right, node);
      return `${left} ${right}`;
    }

    case 'or': {
      const left = serializeNode(node.left, node);
      const right = serializeNode(node.right, node);
      const inner = `${left} OR ${right}`;
      // Wrap in parens if parent is AND (to preserve precedence)
      if (parent?.type === 'and') {
        return `(${inner})`;
      }
      return inner;
    }
  }
}
