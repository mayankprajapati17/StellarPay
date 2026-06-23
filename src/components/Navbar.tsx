import React from 'react';
import { truncateAddress } from '../utils/stellar';

interface NavbarProps {
  isConnected: boolean;
  publicKey: string | null;
  onDisconnect: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isConnected, publicKey, onDisconnect }) => {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(19,19,26,0.85)',
        borderBottom: '1px solid var(--surface-border-soft)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          maxWidth: '672px',
          margin: '0 auto',
          width: '100%',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span style={{ fontSize: '15px', lineHeight: 1 }}>
            <span
              style={{
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              StellarPay
            </span>
            <span
              style={{
                fontWeight: 600,
                color: 'var(--brand-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {' '}Link
            </span>
          </span>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Testnet badge — always visible */}
          <span className="badge-testnet">Testnet</span>

          {isConnected && publicKey && (
            <>
              {/* Wallet pill */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--surface-border)',
                  borderRadius: '20px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  fontFamily: 'monospace',
                }}
              >
                {/* Green online dot */}
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--success)',
                    flexShrink: 0,
                  }}
                />
                {truncateAddress(publicKey)}
              </span>

              {/* Disconnect — text only */}
              <button
                id="disconnect-btn"
                onClick={onDisconnect}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  padding: '4px 2px',
                  transition: 'color 0.15s',
                  fontFamily: 'Inter, sans-serif',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.color = 'var(--error)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)')
                }
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
