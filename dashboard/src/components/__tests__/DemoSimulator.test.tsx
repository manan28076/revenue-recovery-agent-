import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DemoSimulator } from '../DemoSimulator';

describe('DemoSimulator', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('calls the expected API endpoint with the expected payload when simulate is clicked', async () => {
    const mockOnRefresh = vi.fn();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        transactionId: 'test_txn',
        auditEntry: {
          root_cause: 'checkout_abandoned',
          action_taken: 'send_nudge',
          outcome: 'pending',
          diagnosis_confidence: 0.95,
          predicted_recovery_amount: 1000
        }
      })
    });

    render(<DemoSimulator onRefresh={mockOnRefresh} />);

    const runButton = screen.getByRole('button', { name: /Run Live Recovery Simulation/i });
    fireEvent.click(runButton);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/simulate-failure'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ failureCode: 'checkout_abandoned' })
      })
    );

    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalled();
    }, { timeout: 3500 });
  });
});
