import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuditLogTable } from '../AuditLogTable';
import type { AuditLogRow } from '../../types';

describe('AuditLogTable', () => {
  it('renders the correct number of rows for a given audit log array', () => {
    const mockRows: AuditLogRow[] = [
      {
        transactionId: 'txn_1',
        rootCause: 'card_decline',
        diagnosisConfidence: 0.9,
        recoveryProbability: 0.5,
        classifierReasoning: 'test',
        actionTaken: 'retry_payment',
        strategyReasoning: 'test',
        outcome: 'pending',
        amountRecovered: 0,
        predictedRecoveryAmount: 1000,
        recoverySource: null,
        expectedRecoveryValue: null,
        interventionCost: null,
        expectedNetValue: null,
        recoveryLinkUrl: null,
        aiSource: null,
        paymentEvent: {
          transactionId: 'txn_1',
          amount: 1000,
          currency: 'INR',
          status: 'failed',
          failureCode: 'card_declined',
          isRealRazorpayObject: false,
        }
      },
      {
        transactionId: 'txn_2',
        rootCause: 'insufficient_funds',
        diagnosisConfidence: 0.8,
        recoveryProbability: 0.4,
        classifierReasoning: 'test',
        actionTaken: 'send_nudge',
        strategyReasoning: 'test',
        outcome: 'failed',
        amountRecovered: 0,
        predictedRecoveryAmount: 0,
        recoverySource: null,
        expectedRecoveryValue: null,
        interventionCost: null,
        expectedNetValue: null,
        recoveryLinkUrl: null,
        aiSource: null,
        paymentEvent: {
          transactionId: 'txn_2',
          amount: 2000,
          currency: 'INR',
          status: 'failed',
          failureCode: 'insufficient_funds',
          isRealRazorpayObject: true,
        }
      }
    ];

    render(<AuditLogTable rows={mockRows} />);

    expect(screen.getByText('txn_1')).toBeInTheDocument();
    expect(screen.getByText('txn_2')).toBeInTheDocument();
    // Two rows of data + 1 header row (if rendered as a standard table)
    const tableRows = document.querySelectorAll('tr.audit-row');
    expect(tableRows.length).toBe(2);
  });
});
