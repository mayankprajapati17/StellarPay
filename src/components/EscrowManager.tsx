import React, { useState } from 'react';
import { getEscrowStatus, releaseEscrow, refundEscrow, listenForContractEvents } from '../utils/contract';
import { signWithKit } from '../hooks/useWallet';
import * as StellarSdk from '@stellar/stellar-sdk';

interface EscrowManagerProps {
  publicKey: string;
  onRefreshBalance: () => void;
}

type EscrowStatus = 'Pending' | 'Released' | 'Refunded' | 'Disputed';
type ActionState = 'idle' | 'checking' | 'acting' | 'success' | 'failed';

interface EscrowDetails {
  escrowId: string;
  payer: string;
  merchant: string;
  amount: bigint;
  linkSlug: string;
  status: EscrowStatus;
}

const ESCROW_BADGE: Record<EscrowStatus, { bg: string; border: string; color: string; dot: string }> = {
  Pending:  { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  color: '#f59e0b', dot: '#f59e0b' },
  Released: { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',   color: '#22c55e', dot: '#22c55e' },
  Refunded: { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.25)',  color: '#818cf8', dot: '#818cf8' },
  Disputed: { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   color: '#ef4444', dot: '#ef4444' },
};

function stroopsToXLM(stroops: bigint): string {
  const xlm = Number(stroops) / 10_000_000;
  return xlm % 1 === 0 ? xlm.toFixed(0) : xlm.toFixed(7).replace(/0+$/, '');
}

function truncateAddress(addr: string, chars = 6): string {
  if (!addr || addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export const EscrowManager: React.FC<EscrowManagerProps> = ({ publicKey, onRefreshBalance }) => {
  const [escrowIdInput, setEscrowIdInput] = useState('');
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<EscrowDetails | null>(null);


  const handleCheckStatus = async (id: string = escrowIdInput) => {
    if (!id.trim()) return;
    setActionState('checking');
    setError(null);
    setSuccessMsg(null);
    setDetails(null);

    try {
      const data = await getEscrowStatus(id.trim());
      if (!data) {
        setError('Escrow not found. Double check the ID.');
      } else {
        setDetails(data as EscrowDetails);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionState('idle');
    }
  };

  const handleRelease = async () => {
    if (!details) return;
    setActionState('acting');
    setError(null);
    setSuccessMsg(null);

    try {
      const xdr = await releaseEscrow({
        merchantPublicKey: publicKey,
        escrowId: details.escrowId,
      });

      const signedXdr = await signWithKit(xdr, StellarSdk.Networks.TESTNET);
      const rpc = new StellarSdk.rpc.Server('https://soroban-testnet.stellar.org');
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, StellarSdk.Networks.TESTNET);
      const result = await rpc.sendTransaction(signedTx);
      const hash = result.hash;

      listenForContractEvents(hash, (status) => {
        if (status === 'success') {
          setActionState('success');
          setSuccessMsg('Escrow funds released to merchant successfully!');
          onRefreshBalance();
          handleCheckStatus(details.escrowId);
        } else if (status === 'failed') {
          setActionState('failed');
          setError('Release transaction failed on-chain.');
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActionState('idle');
    }
  };

  const handleRefund = async () => {
    if (!details) return;
    setActionState('acting');
    setError(null);
    setSuccessMsg(null);

    try {
      const xdr = await refundEscrow({
        payerPublicKey: publicKey,
        escrowId: details.escrowId,
      });

      const signedXdr = await signWithKit(xdr, StellarSdk.Networks.TESTNET);
      const rpc = new StellarSdk.rpc.Server('https://soroban-testnet.stellar.org');
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, StellarSdk.Networks.TESTNET);
      const result = await rpc.sendTransaction(signedTx);
      const hash = result.hash;

      listenForContractEvents(hash, (status) => {
        if (status === 'success') {
          setActionState('success');
          setSuccessMsg('Refund request processed successfully. Funds returned to your wallet.');
          onRefreshBalance();
          handleCheckStatus(details.escrowId);
        } else if (status === 'failed') {
          setActionState('failed');
          setError('Refund transaction failed on-chain.');
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActionState('idle');
    }
  };

  const isMerchant = details && details.merchant === publicKey;
  const isPayer = details && details.payer === publicKey;

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .em-root { padding: 16px !important; }
          .em-btn { width: 100% !important; }
        }
      `}</style>

      <div className="em-root sp-card card-hover animate-slide-up" style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            🔒 Escrow Manager
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Release delivery funds or request a refund for buyer protection
          </p>
        </div>

        {/* Input area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label htmlFor="escrow-id-input" style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Escrow ID
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                id="escrow-id-input"
                type="text"
                value={escrowIdInput}
                onChange={(e) => setEscrowIdInput(e.target.value)}
                placeholder="esc-171829..."
                className="input-base"
                style={{ flex: 1, minWidth: '200px' }}
                disabled={actionState === 'checking' || actionState === 'acting'}
              />
              <button
                id="check-escrow-status-btn"
                onClick={() => handleCheckStatus()}
                disabled={actionState === 'checking' || actionState === 'acting' || !escrowIdInput.trim()}
                className="em-btn btn-outline"
                style={{ height: '42px', fontSize: '13px' }}
              >
                {actionState === 'checking' ? 'Checking...' : 'Check Status'}
              </button>
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="animate-fade-in" style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <p style={{ margin: 0, flex: 1, fontSize: '12px', color: '#ef4444', lineHeight: 1.5 }}>{error}</p>
          </div>
        )}

        {/* Success state */}
        {successMsg && (
          <div className="animate-fade-in" style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <p style={{ margin: 0, flex: 1, fontSize: '12px', color: '#22c55e', lineHeight: 1.5 }}>{successMsg}</p>
          </div>
        )}

        {/* Loading state for action */}
        {actionState === 'acting' && (
          <div className="animate-fade-in" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px' }}>
            <span className="spinner" style={{ borderTopColor: '#6366f1', border: '2px solid rgba(99,102,241,0.2)', borderTopWidth: '2px' }} />
            <p style={{ margin: 0, fontSize: '12px', color: '#818cf8' }}>Signing & processing transaction on Stellar Testnet...</p>
          </div>
        )}

        {/* Escrow Details */}
        {details && (
          <div className="animate-fade-in" style={{ marginTop: '16px', borderTop: '1px solid var(--surface-border-soft)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Escrow Details</span>
              {(() => {
                const badge = ESCROW_BADGE[details.status];
                return (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: badge.bg, border: `1px solid ${badge.border}` }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: badge.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: badge.color }}>{details.status}</span>
                  </div>
                );
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--surface-border)', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Amount:</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{stroopsToXLM(details.amount)} XLM</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Slug:</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{details.linkSlug}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Payer:</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {truncateAddress(details.payer)} {isPayer && <span style={{ color: '#818cf8', fontWeight: 600 }}>(You)</span>}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Merchant:</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {truncateAddress(details.merchant)} {isMerchant && <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>(You)</span>}
                </span>
              </div>
            </div>

            {/* Actions for Pending state */}
            {details.status === 'Pending' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {isMerchant && (
                  <button
                    id="release-escrow-btn"
                    onClick={handleRelease}
                    disabled={actionState === 'acting'}
                    className="em-btn btn-cta"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}
                  >
                    Release Escrow (Deliver Funds) →
                  </button>
                )}
                {isPayer && (
                  <button
                    id="refund-escrow-btn"
                    onClick={handleRefund}
                    disabled={actionState === 'acting'}
                    className="em-btn btn-outline"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', borderColor: '#ef4444', color: '#ef4444' }}
                  >
                    Request Refund ←
                  </button>
                )}
                {!isMerchant && !isPayer && (
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', width: '100%', fontStyle: 'italic' }}>
                    You are not a participant of this escrow (Payer/Merchant) and cannot release or refund it.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
