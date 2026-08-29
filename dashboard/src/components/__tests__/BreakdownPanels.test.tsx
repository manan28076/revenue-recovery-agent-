import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BreakdownPanels } from '../BreakdownPanels';

describe('BreakdownPanels', () => {
  it('renders correct numbers and sums match input data', () => {
    const outcomes = { pending: 5, recovered: 10 };
    const rootCauses = { card_decline: 7, insufficient_funds: 8 };
    const actions = { send_nudge: 15 };

    render(
      <BreakdownPanels
        outcomes={outcomes}
        rootCauses={rootCauses}
        actions={actions}
      />
    );

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });
});
