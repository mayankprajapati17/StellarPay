import React, { useState, useEffect, useCallback } from 'react';
import { FREIGHTER_ID, LOBSTR_ID, XBULL_ID } from '../hooks/useWallet';

interface WalletOption {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  iconBg: string;
}

interface WalletModalProps {
  isOpen: boolean;
  connectingWalletId: string | null;
  error: string | null;
  onConnect: (walletId: string) => void;
  onClose: () => void;
  onClearError: () => void;
}

// SVG icons for each wallet
const FreighterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
  </svg>
);

const LobstrIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const XBullIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
  </svg>
);

const WALLETS: WalletOption[] = [
  {
    id: FREIGHTER_ID,
    name: 'Freighter',
    description: 'Browser Extension',
    url: 'https://freighter.app',
    icon: <FreighterIcon />,
    iconBg: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  },
  {
    id: LOBSTR_ID,
    name: 'LOBSTR',
    description: 'Mobile & Web',
    url: 'https://lobstr.co/wallet',
    icon: <LobstrIcon />,
    iconBg: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
  },
  {
    id: XBULL_ID,
    name: 'xBull',
    description: 'Browser Extension',
    url: 'https://xbull.app',
    icon: <XBullIcon />,
    iconBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  },
];

function getErrorType(
  error: string | null
): { type: 'not_installed' | 'rejected' | 'unknown' | null; url?: string } {
  if (!error) return { type: null };
  const msg = error.toLowerCase();
  if (msg.includes('not installed') || msg.includes('download it at')) {
    const urlMatch = error.match(/https?:\/\/\S+/);
    return { type: 'not_installed', url: urlMatch?.[0] };
  }
  if (msg.includes('cancelled') || msg.includes('rejected')) {
    return { type: 'rejected' };
  }
  return { type: 'unknown' };
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  connectingWalletId,
  error,
  onConnect,
  onClose,
  onClearError,
}) => {
  const [visible, setVisible] = useState(false);

  // Animate in/out
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!visible) return null;

  const errorInfo = getErrorType(error);

  return (
    <div
      id="wallet-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div
        id="wallet-modal-card"
        style={{
          background: '#13131a',
          border: '1px solid #2a2a38',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '380px',
          position: 'relative',
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.08)',
        }}
      >
        {/* Close button */}
        <button
          id="wallet-modal-close"
          onClick={onClose}
          aria-label="Close wallet selector"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: '#4a4a65',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = '#ef4444')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = '#4a4a65')
          }
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ marginBottom: '20px', paddingRight: '32px' }}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#f1f0ff',
              letterSpacing: '-0.01em',
            }}
          >
            Select Wallet
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#8b8aa8' }}>
            Connect to StellarPay Link
          </p>
        </div>

        {/* Error pill */}
        {error && (
          <div
            className="animate-fade-in"
            style={{
              marginBottom: '16px',
              padding: '10px 14px',
              borderRadius: '10px',
              background:
                errorInfo.type === 'rejected'
                  ? 'rgba(245,158,11,0.1)'
                  : 'rgba(239,68,68,0.1)',
              border: `1px solid ${
                errorInfo.type === 'rejected'
                  ? 'rgba(245,158,11,0.25)'
                  : 'rgba(239,68,68,0.25)'
              }`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '12px',
                  lineHeight: 1.5,
                  color:
                    errorInfo.type === 'rejected' ? '#f59e0b' : '#ef4444',
                }}
              >
                {error}
              </p>
              {errorInfo.type === 'not_installed' && errorInfo.url && (
                <a
                  href={errorInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    fontSize: '11px',
                    color: '#6366f1',
                    textDecoration: 'underline',
                  }}
                >
                  Download →
                </a>
              )}
            </div>
            <button
              onClick={onClearError}
              aria-label="Dismiss error"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                flexShrink: 0,
                color: errorInfo.type === 'rejected' ? '#f59e0b' : '#ef4444',
                opacity: 0.7,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Wallet list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {WALLETS.map((wallet) => {
            const isThisConnecting = connectingWalletId === wallet.id;
            const isAnyConnecting = connectingWalletId !== null;

            return (
              <button
                key={wallet.id}
                id={`wallet-option-${wallet.id}`}
                onClick={() => {
                  if (!isAnyConnecting) {
                    onClearError();
                    onConnect(wallet.id);
                  }
                }}
                disabled={isAnyConnecting}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '12px',
                  background: '#1a1a24',
                  border: `1px solid ${isThisConnecting ? '#6366f1' : '#2a2a38'}`,
                  borderRadius: '12px',
                  padding: '16px',
                  cursor: isAnyConnecting ? 'default' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.15s ease',
                  opacity: isAnyConnecting && !isThisConnecting ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isAnyConnecting) {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = '#6366f1';
                    el.style.background = 'rgba(99,102,241,0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAnyConnecting) {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = '#2a2a38';
                    el.style.background = '#1a1a24';
                  }
                }}
              >
                {/* Wallet icon */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: wallet.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {wallet.icon}
                </div>

                {/* Wallet info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: '0 0 2px 0',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#f1f0ff',
                    }}
                  >
                    {wallet.name}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      color: '#8b8aa8',
                    }}
                  >
                    {wallet.description}
                  </p>
                </div>

                {/* Arrow or spinner */}
                <div style={{ flexShrink: 0 }}>
                  {isThisConnecting ? (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: '2px solid rgba(99,102,241,0.25)',
                        borderTopColor: '#6366f1',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    />
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#4a4a65"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <p
          style={{
            margin: '20px 0 0 0',
            fontSize: '12px',
            color: '#4a4a65',
            textAlign: 'center',
          }}
        >
          By connecting, you agree to use StellarPay Link on Testnet only.
        </p>
      </div>
    </div>
  );
};
