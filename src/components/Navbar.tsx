import React, { useState } from 'react';
import { truncateAddress } from '../utils/stellar';

interface NavbarProps {
  isConnected: boolean;
  publicKey: string | null;
  onDisconnect: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isConnected, publicKey, onDisconnect }) => {
  const [showAddress, setShowAddress] = useState(false);

  return (
    <>
      {/* Responsive overrides injected once */}
      <style>{`
        @media (max-width: 480px) {
          .nav-wallet-addr { display: none !important; }
          .nav-badge-testnet { display: none !important; }
          .nav-brand-full { display: none !important; }
          .nav-brand-short { display: inline !important; }
          .nav-disconnect-label { display: none; }
        }
        .nav-brand-short { display: none; }
      `}</style>

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
              {/* Full brand — hidden on very small screens */}
              <span className="nav-brand-full">
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>StellarPay</span>
                <span style={{ fontWeight: 600, color: 'var(--brand-primary)', letterSpacing: '-0.02em' }}>{' '}Link</span>
              </span>
              {/* Short brand — shown on very small screens */}
              <span className="nav-brand-short" style={{ fontWeight: 600, color: 'var(--brand-primary)', letterSpacing: '-0.02em' }}>SP</span>
            </span>
          </div>

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Testnet badge — hidden on very small screens */}
            <span className="badge-testnet nav-badge-testnet">Testnet</span>

            {isConnected && publicKey && (
              <>
                {/* Wallet pill — address text hidden on mobile, only green dot shown */}
                <button
                  id="wallet-pill-btn"
                  onClick={() => setShowAddress((v) => !v)}
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
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  title={publicKey}
                >
                  {/* Green online dot — always visible */}
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--success)',
                      flexShrink: 0,
                    }}
                  />
                  {/* Address text — hidden on mobile */}
                  <span className="nav-wallet-addr">{truncateAddress(publicKey)}</span>
                </button>

                {/* Disconnect */}
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
                  title="Disconnect wallet"
                >
                  {/* On mobile show X icon; on desktop show text */}
                  <span className="nav-disconnect-label">Disconnect</span>
                  <span style={{ display: 'none' }} className="nav-disconnect-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </span>
                  <span
                    style={{ display: 'none' }}
                    className="nav-disconnect-icon-mobile"
                  >×</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile address tooltip (toggled on pill click) */}
        {showAddress && publicKey && (
          <div
            onClick={() => setShowAddress(false)}
            style={{
              position: 'fixed',
              top: '56px',
              left: 0,
              right: 0,
              zIndex: 100,
              padding: '10px 16px',
              background: 'rgba(19,19,26,0.96)',
              borderBottom: '1px solid var(--surface-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all', textAlign: 'center' }}>
              {publicKey}
            </span>
          </div>
        )}
      </nav>
    </>
  );
};
