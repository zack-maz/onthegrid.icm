/**
 * Phase 39 Plan 05 Task 1 — BudgetBlock render + null-gate + band + cost coverage.
 *
 * BUDGET-01/02: the operator-facing token-budget block sources the already-polled
 * `tokenBudget` field from /api/operator-status (Plan 03). These tests pin:
 *   - degrade-open null gate (tokenBudget === null → render nothing)
 *   - per-provider proximity bar + used/cap + state word
 *   - cost-shadow USD rendered to 4 decimal places
 *   - semantic band class by `state` (ok=green / soft=yellow / hard=red)
 *   - empty providers → "No provider budget data yet"
 */
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BudgetBlock, type TokenBudgetBlock } from '@/components/ui/BudgetBlock';

afterEach(cleanup);

function makeBudget(overrides: Partial<TokenBudgetBlock> = {}): TokenBudgetBlock {
  return {
    providers: {
      nvidia_nim: {
        used: 100_000,
        cap: 1_000_000,
        soft: 800_000,
        hard: 950_000,
        state: 'ok',
      },
    },
    costShadow: { tokensIn: 1234, tokensOut: 567, usd: 0.03 },
    ...overrides,
  };
}

describe('BudgetBlock', () => {
  it('renders nothing when tokenBudget is null (degrade-open gate)', () => {
    const { container } = render(<BudgetBlock tokenBudget={null} />);
    expect(screen.queryByText('TOKEN BUDGET')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('renders the section header + provider row when present', () => {
    render(<BudgetBlock tokenBudget={makeBudget()} />);
    expect(screen.getByText('TOKEN BUDGET')).not.toBeNull();
    expect(screen.getByText('NIM')).not.toBeNull();
    // used/cap + state word
    expect(screen.getByText(/100000\/1000000/)).not.toBeNull();
    expect(screen.getByText(/\bok\b/)).not.toBeNull();
  });

  it('renders today cost-shadow USD to 4 decimal places', () => {
    render(
      <BudgetBlock
        tokenBudget={makeBudget({ costShadow: { tokensIn: 10, tokensOut: 20, usd: 0.03 } })}
      />,
    );
    expect(screen.getByText('Cost today: $0.0300')).not.toBeNull();
    // token caption
    expect(screen.getByText('10 in · 20 out')).not.toBeNull();
  });

  it('applies an accent-red band class for state=hard', () => {
    const { container } = render(
      <BudgetBlock
        tokenBudget={makeBudget({
          providers: {
            nvidia_nim: {
              used: 970_000,
              cap: 1_000_000,
              soft: 800_000,
              hard: 950_000,
              state: 'hard',
            },
          },
        })}
      />,
    );
    const bar = container.querySelector('[data-testid="budget-bar-fill-nvidia_nim"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain('bg-accent-red');
  });

  it('applies an accent-yellow band class for state=soft', () => {
    const { container } = render(
      <BudgetBlock
        tokenBudget={makeBudget({
          providers: {
            nvidia_nim: {
              used: 850_000,
              cap: 1_000_000,
              soft: 800_000,
              hard: 950_000,
              state: 'soft',
            },
          },
        })}
      />,
    );
    const bar = container.querySelector('[data-testid="budget-bar-fill-nvidia_nim"]');
    expect(bar?.className).toContain('bg-accent-yellow');
  });

  it('applies an accent-green band class for state=ok', () => {
    const { container } = render(<BudgetBlock tokenBudget={makeBudget()} />);
    const bar = container.querySelector('[data-testid="budget-bar-fill-nvidia_nim"]');
    expect(bar?.className).toContain('bg-accent-green');
  });

  it('shows an empty message when providers map has no entries', () => {
    const empty = makeBudget();
    // @ts-expect-error — intentionally empty providers map for the empty-state path
    empty.providers = {};
    render(<BudgetBlock tokenBudget={empty} />);
    expect(screen.getByText('TOKEN BUDGET')).not.toBeNull();
    expect(screen.getByText('No provider budget data yet')).not.toBeNull();
  });
});
