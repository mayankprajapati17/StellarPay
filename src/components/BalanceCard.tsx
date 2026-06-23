import React from 'react';

interface BalanceCardProps {
  balance: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  publicKey: string;
}

function formatBalance(balance: string | null): string {
  if (balance === null) return '—';
  const num = parseFloat(balance);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  balance,
  isLoading,
  onRefresh,
  publicKey,
}) => {
  const isZero = balance === '0' || balance === '0.00' || balance === null;
  const formattedBalance = formatBalance(balance);

  return (
    <div className="sp-card card-hover animate-slide-up">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          XLM Balance
        </span>

        {/* Refresh button */}
        <button
          id="refresh-balance-btn"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh balance"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--surface-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isLoading ? 'default' : 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!isLoading)
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-border)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-elevated)';
          }}
        >
          <svg
            className={isLoading ? 'animate-spin' : ''}
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'block' }}
          >
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Balance display */}
      <div style={{ marginTop: '12px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="skeleton" style={{ height: '44px', width: '65%' }} />
            <div className="skeleton" style={{ height: '14px', width: '40%' }} />
          </div>
        ) : (
          <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span
              style={{
                fontSize: '36px',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: 'var(--text-primary)',
                lineHeight: 1,
              }}
            >
              {formattedBalance}
            </span>
            <span
              style={{
                fontSize: '16px',
                fontWeight: 400,
                color: 'var(--text-tertiary)',
              }}
            >
              XLM
            </span>
          </div>
        )}
      </div>

      {/* Fund banner */}
      {isZero && !isLoading && (
        <div
          className="animate-fade-in"
          style={{
            marginTop: '16px',
            background: 'var(--surface-elevated)',
            borderLeft: '3px solid var(--warning)',
            borderRadius: '8px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '14px', lineHeight: 1 }}>⚠️</span>
          <div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Fund your wallet to start sending.{' '}
              <a
                href="https://laboratory.stellar.org/#account-creator"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--warning)',
                  textDecoration: 'none',
                  fontSize: '13px',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none')
                }
              >
                Open Stellar Lab →
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Address section */}
      <div
        style={{
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid var(--surface-border-soft)',
        }}
      >
        <p
          style={{
            margin: '0 0 6px 0',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Wallet
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            wordBreak: 'break-all',
            lineHeight: 1.6,
          }}
          title={publicKey}
        >
          {publicKey}
        </p>
      </div>
    </div>
  );
};
