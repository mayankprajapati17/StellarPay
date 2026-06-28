import React, { useState, useRef, useEffect } from 'react';
import { createPaymentLink, listenForContractEvents } from '../utils/contract';
import { signWithKit } from '../hooks/useWallet';
import * as StellarSdk from '@stellar/stellar-sdk';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || '';

interface CreatePaymentLinkProps {
  merchantPublicKey: string;
}

type TxStatus = 'idle' | 'building' | 'signing' | 'pending' | 'success' | 'failed';

interface CreatedLink {
  slug: string;
  txHash: string;
  contractId: string;
}

/** Validate slug: lowercase letters, numbers, hyphens only */
function isValidSlug(s: string): boolean {
  return /^[a-z0-9-]+$/.test(s);
}

function truncate(s: string): string {
  if (!s || s.length < 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-6)}`;
}

export const CreatePaymentLink: React.FC<CreatePaymentLinkProps> = ({
  merchantPublicKey,
}) => {
  const [slug, setSlug] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ledger, setLedger] = useState<number | undefined>(undefined);

  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  const handleSlugChange = (val: string) => {
    // Force lowercase
    const lower = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(lower);
    if (lower && !isValidSlug(lower)) {
      setSlugError('Only lowercase letters, numbers, and hyphens allowed');
    } else {
      setSlugError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    let hasError = false;
    if (!slug || !isValidSlug(slug)) {
      setSlugError('Slug is required and must use only lowercase letters, numbers, and hyphens');
      hasError = true;
    }
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setAmountError('Amount must be greater than 0');
      hasError = true;
    }
    if (!description.trim()) {
      setError('Description is required');
      hasError = true;
    }
    if (hasError) return;

    if (!CONTRACT_ID) {
      setError(
        'Contract ID not configured. Set VITE_CONTRACT_ID in your .env file and redeploy.'
      );
      return;
    }

    try {
      // Step 1: Build transaction
      setTxStatus('building');
      setStatusMessage('Building transaction...');

      const xdr = await createPaymentLink({
        merchantPublicKey,
        slug,
        amount,
        description: description.trim(),
      });

      // Step 2: Sign with connected wallet
      setTxStatus('signing');
      setStatusMessage('Sign in your wallet...');

      const signedXdr = await signWithKit(xdr, StellarSdk.Networks.TESTNET);

      // Step 3: Submit to network
      setTxStatus('pending');
      setStatusMessage('Submitting to Stellar network...');

      const rpc = new StellarSdk.rpc.Server(RPC_URL);
      const tx = StellarSdk.TransactionBuilder.fromXDR(
        signedXdr,
        StellarSdk.Networks.TESTNET
      );
      const sendResult = await rpc.sendTransaction(tx);
      const txHash = sendResult.hash;

      setCreatedLink({ slug, txHash, contractId: CONTRACT_ID });

      // Step 4: Poll for confirmation
      setStatusMessage('Waiting for confirmation...');
      const cleanup = listenForContractEvents(txHash, (status, ledgerNum) => {
        if (status === 'success') {
          setTxStatus('success');
          setLedger(ledgerNum);
          setStatusMessage('Confirmed on Stellar Testnet!');
        } else if (status === 'failed') {
          setTxStatus('failed');
          setStatusMessage('Transaction failed on network');
        }
      });
      cleanupRef.current = cleanup;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();

      if (lower.includes('rejected') || lower.includes('cancelled') || lower.includes('denied')) {
        setError('Transaction rejected. You cancelled the request in your wallet.');
      } else if (lower.includes('not configured') || lower.includes('contract id')) {
        setError(msg);
      } else {
        setError(msg || 'Failed to create payment link. Please try again.');
      }

      setTxStatus('idle');
      setStatusMessage('');
    }
  };

  const handleCopy = async () => {
    if (!createdLink) return;
    const url = `${window.location.origin}/pay/${createdLink.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setSlug('');
    setAmount('');
    setDescription('');
    setSlugError(null);
    setAmountError(null);
    setTxStatus('idle');
    setStatusMessage('');
    setCreatedLink(null);
    setError(null);
    setCopied(false);
    setLedger(undefined);
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  };

  const isSubmitting = ['building', 'signing', 'pending'].includes(txStatus);
  const previewUrl = slug
    ? `${window.location.origin}/pay/${slug}`
    : `${window.location.origin}/pay/your-slug`;

  // Success state
  if (createdLink && (txStatus === 'success' || txStatus === 'pending')) {
    return (
      <div className="sp-card animate-slide-up">
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Create Payment Link
          </h2>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '20px',
              background: 'rgba(99,102,241,0.12)',
              color: '#818cf8',
              border: '1px solid rgba(99,102,241,0.25)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Stored on-chain
          </span>
        </div>

        {/* Live status tracker */}
        <div
          style={{
            padding: '10px 14px',
            background: txStatus === 'success' ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
            border: `1px solid ${txStatus === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          <span
            className={txStatus === 'pending' ? 'status-pending' : 'status-success'}
            style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              {txStatus === 'pending' ? '⏳ Pending — waiting for confirmation' : '✅ Confirmed on Stellar Testnet'}
            </p>
            {txStatus === 'success' && ledger && (
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                Ledger #{ledger.toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Success card */}
        <div
          style={{
            padding: '16px',
            background: 'var(--success-bg)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Your Payment Link
            </p>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--success)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {window.location.origin}/pay/{createdLink.slug}
            </p>
          </div>

          <button
            id="copy-link-btn"
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              height: '36px',
              borderRadius: '8px',
              background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              color: 'var(--success)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.15s',
            }}
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Link
              </>
            )}
          </button>

          {/* Open payment page button */}
          <button
            id="open-payment-page-btn"
            onClick={() => window.open(`/pay/${createdLink.slug}`, '_blank')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
              color: '#818cf8',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open payment page →
          </button>

          {/* Tx hash */}
          <div>
            <p style={{ margin: '0 0 2px 0', fontSize: '11px', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Transaction
            </p>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${createdLink.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '11px', color: '#6366f1', fontFamily: 'monospace', textDecoration: 'underline' }}
            >
              {truncate(createdLink.txHash)} ↗
            </a>
          </div>

          {/* Contract */}
          <div>
            <p style={{ margin: '0 0 2px 0', fontSize: '11px', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Contract
            </p>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
              {truncate(createdLink.contractId)}
            </p>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="btn-outline"
          style={{ marginTop: '12px' }}
        >
          Create Another Link
        </button>
      </div>
    );
  }

  return (
    <div className="sp-card card-hover animate-slide-up">
      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Create Payment Link
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Generate a shareable link for your customers
          </p>
        </div>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '20px',
            background: 'rgba(99,102,241,0.12)',
            color: '#818cf8',
            border: '1px solid rgba(99,102,241,0.25)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          Stored on-chain
        </span>
      </div>

      {/* No contract warning */}
      {!CONTRACT_ID && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
          }}
        >
          <p style={{ margin: 0, fontSize: '12px', color: '#f59e0b', lineHeight: 1.5 }}>
            ⚠️ <strong>Contract not configured</strong> — Set <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: '4px' }}>VITE_CONTRACT_ID</code> in <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: '4px' }}>.env</code> to enable on-chain creation. Deploy instructions are in the README.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Slug input */}
        <div>
          <label
            htmlFor="link-slug-input"
            style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.01em', marginBottom: '6px' }}
          >
            Link Slug
          </label>
          <input
            id="link-slug-input"
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="your-name-or-brand"
            className={`input-base${slugError ? ' error' : ''}`}
            disabled={isSubmitting}
            autoComplete="off"
            spellCheck={false}
          />
          {slugError && (
            <p className="animate-fade-in" style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--error)' }}>
              {slugError}
            </p>
          )}
          {/* Live URL preview */}
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            <span style={{ color: '#4a4a65' }}>Preview: </span>
            <span style={{ color: slug ? '#818cf8' : 'var(--text-tertiary)' }}>
              {previewUrl}
            </span>
          </p>
        </div>

        {/* Amount */}
        <div>
          <label
            htmlFor="link-amount-input"
            style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.01em', marginBottom: '6px' }}
          >
            Amount (XLM)
          </label>
          <div style={{ display: 'flex' }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                background: 'rgba(10,10,18,0.5)',
                border: '1px solid var(--surface-border)',
                borderRight: 'none',
                borderRadius: '10px 0 0 10px',
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                fontWeight: 500,
                flexShrink: 0,
                userSelect: 'none',
              }}
            >
              XLM
            </span>
            <input
              id="link-amount-input"
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountError(null);
              }}
              placeholder="0.00"
              min="0.0000001"
              step="0.0000001"
              className={`input-base${amountError ? ' error' : ''}`}
              style={{ borderRadius: '0 10px 10px 0', flex: 1 }}
              disabled={isSubmitting}
            />
          </div>
          {amountError && (
            <p className="animate-fade-in" style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--error)' }}>
              {amountError}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="link-description-input"
            style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.01em', marginBottom: '6px' }}
          >
            Description
          </label>
          <input
            id="link-description-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this payment for?"
            className="input-base"
            disabled={isSubmitting}
          />
        </div>

        {/* Generic error */}
        {error && (
          <div
            className="animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <p style={{ margin: 0, flex: 1, fontSize: '12px', color: '#ef4444', lineHeight: 1.5 }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.7, flexShrink: 0, padding: '2px' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Status bar when submitting */}
        {isSubmitting && (
          <div
            className="animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '10px',
            }}
          >
            <span className="spinner" style={{ borderTopColor: '#6366f1', border: '2px solid rgba(99,102,241,0.2)', borderTopWidth: '2px' }} />
            <p style={{ margin: 0, fontSize: '12px', color: '#818cf8' }}>{statusMessage}</p>
          </div>
        )}

        {/* Submit button */}
        <button
          id="create-link-btn"
          type="submit"
          disabled={isSubmitting || !CONTRACT_ID}
          className="btn-cta"
        >
          {isSubmitting ? (
            <>
              <span className="spinner" />
              Creating on-chain...
            </>
          ) : (
            'Create Link →'
          )}
        </button>
      </form>
    </div>
  );
};
