import { useState, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { WalletConnect } from './components/WalletConnect';
import { BalanceCard } from './components/BalanceCard';
import { SendForm } from './components/SendForm';
import { TransactionResultCard } from './components/TransactionResult';
import { useWallet } from './hooks/useWallet';
import type { TransactionResult } from './types';

function App() {
  const {
    publicKey,
    isConnected,
    isConnecting,
    balance,
    isLoadingBalance,
    error,
    connectWallet,
    disconnectWallet,
    fetchBalance,
    clearError,
  } = useWallet();

  const [txResult, setTxResult] = useState<TransactionResult | null>(null);

  const handleTransactionSuccess = useCallback(
    (result: TransactionResult) => {
      setTxResult(result);
      // Refresh balance after successful transaction
      fetchBalance();
    },
    [fetchBalance]
  );

  const handleDismissResult = useCallback(() => {
    setTxResult(null);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)', display: 'flex', flexDirection: 'column' }}>
      {/* Subtle ambient glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            left: '-80px',
            width: '360px',
            height: '360px',
            background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            right: '5%',
            width: '300px',
            height: '300px',
            background: 'radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
      </div>

      {/* Navbar */}
      <Navbar
        isConnected={isConnected}
        publicKey={publicKey}
        onDisconnect={disconnectWallet}
      />

      {/* Main content */}
      <main style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!isConnected ? (
          <WalletConnect
            isConnecting={isConnecting}
            error={error}
            onConnect={connectWallet}
            onClearError={clearError}
          />
        ) : (
          <div
            style={{
              maxWidth: '672px',
              margin: '0 auto',
              width: '100%',
              padding: '32px 16px',
            }}
          >
            {/* Dashboard header */}
            <div style={{ marginBottom: '24px' }} className="animate-fade-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: '22px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Your Payment Dashboard
                </h1>
                <span className="badge-testnet">Stellar Testnet</span>
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-tertiary)' }}>
                Connect. Send. Share.
              </p>
            </div>

            {/* Cards stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Balance Card */}
              {publicKey && (
                <BalanceCard
                  balance={balance}
                  isLoading={isLoadingBalance}
                  onRefresh={fetchBalance}
                  publicKey={publicKey}
                />
              )}

              {/* Send Form or Transaction Result */}
              {txResult ? (
                <TransactionResultCard
                  result={txResult}
                  onDismiss={handleDismissResult}
                />
              ) : (
                publicKey && (
                  <SendForm
                    fromPublicKey={publicKey}
                    onSuccess={handleTransactionSuccess}
                  />
                )
              )}
            </div>

            {/* Footer note */}
            <div style={{ marginTop: '40px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-tertiary)' }}>
                StellarPay Link · Testnet only — no real funds
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
