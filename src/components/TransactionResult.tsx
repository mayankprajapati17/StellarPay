import React from 'react';
import { truncateAddress } from '../utils/stellar';
import type { TransactionResult } from '../types';

interface TransactionResultProps {
  result: TransactionResult;
  onDismiss: () => void;
}

export const TransactionResultCard: React.FC<TransactionResultProps> = ({
  result,
  onDismiss,
}) => {
  if (result.success) {
    return (
      <div
        className="animate-slide-up"
        style={{
          background: 'var(--success-bg)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: '16px',
          padding: '24px',
        }}
      >
        {/* Checkmark */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div
            className="animate-scale-in"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '2px solid var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2
            style={{
              margin: '12px 0 0 0',
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--success)',
              letterSpacing: '-0.01em',
            }}
          >
            Transaction Sent!
          </h2>
        </div>

        {/* Details */}
        <div
          style={{
            marginTop: '16px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {result.amount && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 500,
                }}
              >
                Amount
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {parseFloat(result.amount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 7,
                })}{' '}
                XLM
              </span>
            </div>
          )}

          {result.destination && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                To
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'monospace', wordBreak: 'break-all', textAlign: 'right' }}>
                {truncateAddress(result.destination)}
              </span>
            </div>
          )}

          {result.hash && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                Hash
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  textAlign: 'right',
                }}
                title={result.hash}
              >
                {truncateAddress(result.hash)}
              </span>
            </div>
          )}
        </div>

        {/* Explorer link */}
        {result.hash && (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${result.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            id="view-explorer-link"
            className="btn-outline"
            style={{ marginTop: '16px', textDecoration: 'none' }}
          >
            View on Stellar Explorer ↗
          </a>
        )}

        {/* Send Another */}
        <button
          id="send-another-btn"
          onClick={onDismiss}
          className="btn-cta"
          style={{ marginTop: '8px' }}
        >
          Send Another
        </button>
      </div>
    );
  }

  // Failure state
  return (
    <div
      className="animate-slide-up"
      style={{
        background: 'var(--error-bg)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: '16px',
        padding: '24px',
      }}
    >
      {/* X icon */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div
          className="animate-scale-in"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '2px solid var(--error)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2
          style={{
            margin: '12px 0 0 0',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--error)',
            letterSpacing: '-0.01em',
          }}
        >
          Transaction Failed
        </h2>
      </div>

      {/* Error message */}
      {result.error && (
        <div
          style={{
            marginTop: '16px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '10px',
            padding: '14px',
          }}
        >
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
            {result.error}
          </p>
        </div>
      )}

      {/* Try Again */}
      <button
        id="try-again-btn"
        onClick={onDismiss}
        className="btn-cta"
        style={{ marginTop: '16px' }}
      >
        Try Again
      </button>
    </div>
  );
};
