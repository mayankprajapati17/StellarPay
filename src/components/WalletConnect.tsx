import React from 'react';

interface WalletConnectProps {
  isConnecting: boolean;
  error: string | null;
  onConnect: () => void;
  onClearError: () => void;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({
  isConnecting,
  error,
  onConnect,
  onClearError,
}) => {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 56px)',
        padding: '0 24px',
      }}
    >
      {/* Radial glow */}
      <div
        style={{
          position: 'fixed',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '480px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
        className="animate-fade-in"
      >
        {/* Icon */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #5b5ef4 0%, #7c3aed 100%)',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            boxShadow:
              '0 8px 32px rgba(99,102,241,0.35), 0 0 0 1px rgba(99,102,241,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>

        {/* Heading */}
        <h1
          style={{
            margin: '20px 0 0 0',
            fontSize: '32px',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          <span style={{ color: '#f1f0ff' }}>StellarPay </span>
          <span style={{ color: '#818cf8' }}>Link</span>
        </h1>

        {/* Subheading */}
        <p
          style={{
            margin: '8px 0 0 0',
            fontSize: '15px',
            fontWeight: 400,
            color: '#6b6a8a',
            lineHeight: 1.5,
          }}
        >
          Generate payment links on Stellar Testnet
        </p>

        {/* Feature pills — single row, no wrap */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'nowrap',
            gap: '8px',
            justifyContent: 'center',
            marginTop: '28px',
            overflow: 'visible',
          }}
        >
          {[
            { icon: '⚡', label: 'Instant payments' },
            { icon: '🔗', label: 'Shareable links' },
            { icon: '🌍', label: 'No bank needed' },
          ].map(({ icon, label }) => (
            <span
              key={label}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                padding: '7px 14px',
                fontSize: '13px',
                color: '#8b8aa8',
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {icon} {label}
            </span>
          ))}
        </div>

        {/* Connect button */}
        <button
          id="connect-wallet-btn"
          onClick={() => {
            onClearError();
            onConnect();
          }}
          disabled={isConnecting}
          style={{
            marginTop: '36px',
            width: 'fit-content',
            minWidth: '260px',
            height: '52px',
            padding: '0 40px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
            border: 'none',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            fontFamily: 'Inter, sans-serif',
            cursor: isConnecting ? 'default' : 'pointer',
            boxShadow: isConnecting
              ? 'none'
              : '0 0 0 1px rgba(99,102,241,0.5), 0 8px 24px rgba(99,102,241,0.3), 0 2px 4px rgba(0,0,0,0.3)',
            opacity: isConnecting ? 0.7 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.2s ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            if (!isConnecting) {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.boxShadow =
                '0 0 0 1px rgba(99,102,241,0.7), 0 12px 32px rgba(99,102,241,0.45), 0 2px 4px rgba(0,0,0,0.3)';
              el.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.boxShadow =
              '0 0 0 1px rgba(99,102,241,0.5), 0 8px 24px rgba(99,102,241,0.3), 0 2px 4px rgba(0,0,0,0.3)';
            el.style.transform = 'translateY(0)';
          }}
        >
          {isConnecting ? (
            <>
              {/* Spinner */}
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.25)',
                  borderTopColor: 'white',
                  display: 'inline-block',
                  animation: 'spin 0.7s linear infinite',
                  flexShrink: 0,
                }}
              />
              Connecting...
            </>
          ) : (
            'Connect Freighter Wallet'
          )}
        </button>

        {/* Error pill */}
        {error && (
          <div
            className="animate-fade-in"
            style={{ marginTop: '12px', width: '100%', display: 'flex', justifyContent: 'center' }}
          >
            <span
              style={{
                display: 'inline-block',
                background: 'var(--error-bg)',
                color: 'var(--error)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '10px',
                fontSize: '12px',
                padding: '8px 16px',
                maxWidth: '380px',
                lineHeight: 1.5,
              }}
            >
              {error}
            </span>
          </div>
        )}

        {/* Bottom text */}
        <p
          style={{
            marginTop: '20px',
            marginBottom: 0,
            fontSize: '13px',
            color: '#4a4a65',
          }}
        >
          Don&apos;t have Freighter?{' '}
          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#6366f1',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none')
            }
          >
            freighter.app →
          </a>
        </p>
      </div>
    </div>
  );
};
