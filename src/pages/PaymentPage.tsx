import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';
import { signWithKit, useWallet } from '../hooks/useWallet';
import { WalletModal } from '../components/WalletModal';
import { isValidStellarAddress } from '../utils/stellar';
import { createEscrow, listenForContractEvents } from '../utils/contract';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentLinkData {
  slug: string;
  merchant: string;
  amount: bigint;
  description: string;
  active: boolean;
}

type PageState = 'loading' | 'not_found' | 'inactive' | 'error' | 'ready';
type PayStep   = 'idle' | 'paying' | 'success' | 'failed';
type PayMode   = 'direct' | 'escrow';

// Escrow-specific steps
type EscrowStep = 'idle' | 'creating' | 'pending' | 'success' | 'failed';
type EscrowStatus = 'Pending' | 'Released' | 'Refunded' | 'Disputed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stroopsToXLM(stroops: bigint): string {
  const xlm = Number(stroops) / 10_000_000;
  return xlm % 1 === 0 ? xlm.toFixed(0) : xlm.toFixed(7).replace(/0+$/, '');
}

function formatMerchantName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getInitials(slug: string): string {
  const words = slug.replace(/-/g, ' ').split(' ').filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (slug.slice(0, 2) || 'SP').toUpperCase();
}

function truncAddr(addr: string, chars = 6): string {
  if (!addr || addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

// ─── Contract data fetcher ────────────────────────────────────────────────────

const CONTRACT_ID_VAL = import.meta.env.VITE_CONTRACT_ID || '';
const RPC_URL_VAL = 'https://soroban-testnet.stellar.org';
const SIM_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

async function fetchLinkData(slug: string): Promise<PaymentLinkData | null> {
  if (!CONTRACT_ID_VAL) return null;

  const rpc = new StellarSdk.rpc.Server(RPC_URL_VAL);
  const contract = new StellarSdk.Contract(CONTRACT_ID_VAL);
  const dummyAccount = new StellarSdk.Account(SIM_ACCOUNT, '0');

  const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      contract.call('get_link', StellarSdk.nativeToScVal(slug, { type: 'string' }))
    )
    .setTimeout(30)
    .build();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sim = (await rpc.simulateTransaction(tx)) as any;
  if (sim?.error) throw new Error(sim.error as string);

  const retval = sim?.result?.retval as StellarSdk.xdr.ScVal | undefined;
  if (!retval) return null;

  const native = StellarSdk.scValToNative(retval);
  if (native === undefined || native === null || typeof native !== 'object') return null;

  const obj = native as Record<string, unknown>;
  const merchantRaw = obj['merchant'];
  let merchant: string;
  if (
    merchantRaw !== null &&
    typeof merchantRaw === 'object' &&
    typeof (merchantRaw as { toString?: unknown }).toString === 'function'
  ) {
    merchant = (merchantRaw as { toString(): string }).toString();
  } else {
    merchant = String(merchantRaw ?? '');
  }

  return {
    slug: String(obj['slug'] ?? slug),
    merchant,
    amount:
      typeof obj['amount'] === 'bigint'
        ? (obj['amount'] as bigint)
        : BigInt(String(obj['amount'] ?? '0')),
    description: String(obj['description'] ?? ''),
    active: Boolean(obj['active']),
  };
}

// ─── Payment sender (multi-wallet) ────────────────────────────────────────────

async function sendPaymentWithKit(params: {
  fromPublicKey: string;
  toAddress: string;
  amountXLM: string;
  memo: string;
}): Promise<string> {
  const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
  const sourceAccount = await server.loadAccount(params.fromPublicKey);
  const baseFee = await server.fetchBaseFee();

  const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: baseFee.toString(),
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: params.toAddress,
        asset: StellarSdk.Asset.native(),
        amount: params.amountXLM,
      })
    )
    .addMemo(StellarSdk.Memo.text(params.memo.slice(0, 28)))
    .setTimeout(30)
    .build();

  const signedXdr = await signWithKit(tx.toXDR(), StellarSdk.Networks.TESTNET);
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, StellarSdk.Networks.TESTNET);
  const result = await server.submitTransaction(signedTx);
  return result.hash;
}

// ─── SVGs / micro-components ──────────────────────────────────────────────────

const Logo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="pp-logo-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="7" fill="url(#pp-logo-grad)" />
    <path
      d="M7 8h6a2 2 0 0 1 0 4H7V8zM7 12h7a2 2 0 0 1 0 4H7v-4z"
      fill="white"
      opacity="0.9"
    />
  </svg>
);

const Skeleton = ({ w = '100%', h = '16px', radius = '6px' }) => (
  <div
    style={{
      width: w,
      height: h,
      borderRadius: radius,
      background:
        'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '200% 100%',
      animation: 'pp-shimmer 1.6s ease-in-out infinite',
    }}
  />
);

// Escrow status badge colour map
const ESCROW_BADGE: Record<EscrowStatus, { bg: string; border: string; color: string; dot: string }> = {
  Pending:  { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  color: '#f59e0b', dot: '#f59e0b' },
  Released: { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',   color: '#22c55e', dot: '#22c55e' },
  Refunded: { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.25)',  color: '#818cf8', dot: '#818cf8' },
  Disputed: { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   color: '#ef4444', dot: '#ef4444' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const PaymentPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();

  // Page fetch state
  const [pageState,  setPageState]  = useState<PageState>('loading');
  const [linkData,   setLinkData]   = useState<PaymentLinkData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Direct-payment flow state
  const [payStep,  setPayStep]  = useState<PayStep>('idle');
  const [payError, setPayError] = useState<string | null>(null);
  const [txHash,   setTxHash]   = useState<string | null>(null);

  // Payment mode toggle
  const [payMode, setPayMode] = useState<PayMode>('direct');

  // Escrow flow state
  const [escrowStep,   setEscrowStep]   = useState<EscrowStep>('idle');
  const [escrowError,  setEscrowError]  = useState<string | null>(null);
  const [escrowId,     setEscrowId]     = useState<string | null>(null);
  const [escrowTxHash, setEscrowTxHash] = useState<string | null>(null);
  const [escrowStatus, setEscrowStatus] = useState<EscrowStatus>('Pending');
  const escrowCleanupRef = useRef<(() => void) | null>(null);

  // UI toggles
  const [showManual,      setShowManual]      = useState(false);
  const [manualAddr,      setManualAddr]      = useState('');
  const [manualAddrError, setManualAddrError] = useState<string | null>(null);
  const [detailsCopied,   setDetailsCopied]   = useState(false);
  const [isModalOpen,     setIsModalOpen]     = useState(false);

  // Wallet state
  const {
    publicKey,
    isConnected,
    connectingWalletId,
    error: walletError,
    connectWallet,
    clearError: clearWalletError,
  } = useWallet();

  // ── Fetch link on mount ──
  useEffect(() => {
    if (!slug) { setPageState('not_found'); return; }
    setPageState('loading');
    fetchLinkData(slug)
      .then((data) => {
        if (!data)           { setPageState('not_found'); }
        else if (!data.active) { setLinkData(data); setPageState('inactive'); }
        else                   { setLinkData(data); setPageState('ready'); }
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : String(err));
        setPageState('error');
      });
  }, [slug]);

  // ── Close modal when wallet connects ──
  useEffect(() => {
    if (isConnected && isModalOpen) setIsModalOpen(false);
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup escrow poller on unmount ──
  useEffect(() => {
    return () => { escrowCleanupRef.current?.(); };
  }, []);

  // ── Direct payment ──
  const handlePay = useCallback(async () => {
    if (!publicKey || !linkData) return;
    setPayStep('paying');
    setPayError(null);
    try {
      const amountXLM = stroopsToXLM(linkData.amount);
      const memo = `StellarPay:${linkData.slug}`;
      const hash = await sendPaymentWithKit({
        fromPublicKey: publicKey,
        toAddress: linkData.merchant,
        amountXLM,
        memo,
      });
      setTxHash(hash);
      setPayStep('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const low = msg.toLowerCase();
      if (low.includes('reject') || low.includes('cancel') || low.includes('denied')) {
        setPayError('Transaction rejected. You cancelled in your wallet.');
      } else if (low.includes('insufficient')) {
        setPayError('Insufficient balance to complete this payment.');
      } else if (low.includes('destination') || low.includes('no account')) {
        setPayError("Recipient account doesn't exist on Stellar yet.");
      } else {
        setPayError(msg || 'Payment failed. Please try again.');
      }
      setPayStep('failed');
    }
  }, [publicKey, linkData]);

  // ── Escrow payment ──
  const handleEscrowPay = useCallback(async () => {
    if (!publicKey || !linkData) return;

    // Guard: payer cannot be the merchant
    if (publicKey === linkData.merchant) {
      setEscrowError('You cannot create an escrow for your own payment link.');
      setEscrowStep('failed');
      return;
    }

    setEscrowStep('creating');
    setEscrowError(null);

    try {
      // Pass exact stroops as string to avoid floating-point precision loss
      const amountStroops = linkData.amount.toString();

      // createEscrow returns JSON: { xdr, escrowId }
      const raw = await createEscrow({
        payerPublicKey:    publicKey,
        merchantPublicKey: linkData.merchant,
        amount:            amountStroops,
        linkSlug:          linkData.slug,
      });

      const { xdr, escrowId: eid } = JSON.parse(raw) as { xdr: string; escrowId: string };
      setEscrowId(eid);

      // Sign the prepared XDR with the connected wallet
      const signedXdr = await signWithKit(xdr, StellarSdk.Networks.TESTNET);
      const rpc = new StellarSdk.rpc.Server(RPC_URL_VAL);
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, StellarSdk.Networks.TESTNET);
      const result = await rpc.sendTransaction(signedTx);
      const hash = result.hash;

      setEscrowTxHash(hash);
      setEscrowStep('pending');
      setEscrowStatus('Pending');

      // Poll for confirmation
      const cleanup = listenForContractEvents(hash, (status) => {
        if (status === 'success') {
          setEscrowStep('success');
          setEscrowStatus('Pending'); // On-chain status starts as Pending
        } else if (status === 'failed') {
          setEscrowStep('failed');
          setEscrowError('Escrow transaction failed on-chain. Please retry.');
        }
      });
      escrowCleanupRef.current = cleanup;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const low = msg.toLowerCase();
      if (low.includes('reject') || low.includes('cancel') || low.includes('denied')) {
        setEscrowError('Transaction rejected in wallet.');
      } else if (low.includes('configured')) {
        setEscrowError(msg);
      } else {
        setEscrowError(msg || 'Escrow creation failed. Please retry.');
      }
      setEscrowStep('failed');
    }
  }, [publicKey, linkData]);

  // ── Connect or pay (primary button handler) ──
  const handleConnectOrPay = useCallback(() => {
    if (!isConnected) {
      clearWalletError();
      setIsModalOpen(true);
    } else if (payMode === 'direct') {
      handlePay();
    } else {
      handleEscrowPay();
    }
  }, [isConnected, clearWalletError, payMode, handlePay, handleEscrowPay]);

  // ── Copy manual payment details ──
  const handleCopyDetails = useCallback(async () => {
    if (!linkData) return;
    const amountXLM = stroopsToXLM(linkData.amount);
    const text = `Send ${amountXLM} XLM to ${linkData.merchant}\nMemo: StellarPay:${linkData.slug}`;
    await copyToClipboard(text);
    setDetailsCopied(true);
    setTimeout(() => setDetailsCopied(false), 2200);
  }, [linkData]);

  // ── Derived values ──
  const amountXLM    = linkData ? stroopsToXLM(linkData.amount) : '0';
  const merchantName = linkData ? formatMerchantName(linkData.slug) : '';
  const initials     = linkData ? getInitials(linkData.slug) : 'SP';
  const isPayingNow  = payStep === 'paying' || escrowStep === 'creating' || escrowStep === 'pending';

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes pp-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pp-success-pop {
          0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
          55%  { transform: scale(1.18) rotate(6deg); opacity: 1; }
          75%  { transform: scale(0.94) rotate(-3deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes pp-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pp-success-icon { animation: pp-success-pop 0.55s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }
        .pp-fade-up      { animation: pp-fade-up 0.35s ease forwards; }

        /* Mobile responsive overrides */
        @media (max-width: 480px) {
          .pp-card-wrap {
            padding: 12px 12px 32px !important;
          }
          .pp-topbar {
            padding: 16px 12px 0 !important;
          }
          .pp-amount-num {
            font-size: 22px !important;
          }
        }
      `}</style>

      {/* Page background */}
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--surface-base)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Ambient glows */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', bottom: '-80px', right: '10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 65%)', borderRadius: '50%' }} />
        </div>

        {/* ── Top bar ── */}
        <div
          className="pp-topbar"
          style={{
            position: 'relative',
            zIndex: 10,
            width: '100%',
            maxWidth: '460px',
            padding: '20px 20px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            <Logo />
            <span style={{ display: 'none' }} className="pp-brand-mobile">StellarPay</span>
            <span style={{}}>StellarPay Link</span>
          </Link>
          <span className="badge-testnet">Testnet</span>
        </div>

        {/* ── Main card area ── */}
        <div
          className="pp-card-wrap"
          style={{
            position: 'relative',
            zIndex: 10,
            width: '100%',
            maxWidth: '420px',
            padding: '20px 16px 40px',
          }}
        >
          {/* ══ LOADING ══ */}
          {pageState === 'loading' && (
            <div className="sp-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', paddingTop: '8px' }}>
                <Skeleton w="64px" h="64px" radius="50%" />
                <Skeleton w="120px" h="12px" />
                <Skeleton w="160px" h="20px" />
                <Skeleton w="200px" h="11px" />
              </div>
              <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Skeleton w="60px" h="10px" />
                <Skeleton w="100px" h="28px" />
                <Skeleton w="80px" h="10px" />
                <Skeleton w="140px" h="12px" />
              </div>
              <p style={{ margin: 0, textAlign: 'center', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                Fetching payment details…
              </p>
            </div>
          )}

          {/* ══ NOT FOUND ══ */}
          {pageState === 'not_found' && (
            <div className="sp-card animate-fade-in" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto' }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 15s1-2 4-2 4 2 4 2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
                  <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
                </svg>
              </div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Payment link not found
              </h1>
              <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                The link <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>/pay/{slug}</code>{' '}
                doesn't exist or has expired.
              </p>
              <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}>
                Go to StellarPay →
              </Link>
            </div>
          )}

          {/* ══ INACTIVE ══ */}
          {pageState === 'inactive' && linkData && (
            <div className="sp-card animate-fade-in" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,0.6)" strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block', margin: '0 auto' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" />
                </svg>
              </div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Link expired or inactive
              </h1>
              <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                This payment link from <strong style={{ color: 'var(--text-secondary)' }}>{merchantName}</strong> is no longer accepting payments.
              </p>
              <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}>
                Go to StellarPay →
              </Link>
            </div>
          )}

          {/* ══ FETCH ERROR ══ */}
          {pageState === 'error' && (
            <div className="sp-card animate-fade-in" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2.5" />
                </svg>
              </div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Couldn't load payment details
              </h1>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                There was an error connecting to Stellar. Please try again.
              </p>
              {fetchError && (
                <p style={{ margin: '0 0 24px 0', fontSize: '11px', color: '#4a4a65', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                  {fetchError}
                </p>
              )}
              <button
                onClick={() => {
                  setPageState('loading');
                  setFetchError(null);
                  fetchLinkData(slug)
                    .then((d) => {
                      if (!d)          setPageState('not_found');
                      else if (!d.active) { setLinkData(d); setPageState('inactive'); }
                      else               { setLinkData(d); setPageState('ready'); }
                    })
                    .catch((e) => { setFetchError(e instanceof Error ? e.message : String(e)); setPageState('error'); });
                }}
                style={{ padding: '10px 24px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
              >
                ↺ Retry
              </button>
            </div>
          )}

          {/* ══ DIRECT PAYMENT SUCCESS ══ */}
          {pageState === 'ready' && payStep === 'success' && linkData && (
            <div className="sp-card pp-fade-up" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div className="pp-success-icon" style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.25) 100%)', border: '2px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Payment sent!
              </h1>
              <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#22c55e' }}>{amountXLM} XLM</strong> to {merchantName}
              </p>
              <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', textAlign: 'left', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <p style={{ margin: '0 0 2px 0', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recipient</p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{linkData.merchant}</p>
                </div>
                {txHash && (
                  <div>
                    <p style={{ margin: '0 0 2px 0', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Transaction</p>
                    <a href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#6366f1', fontFamily: 'monospace', textDecoration: 'underline', wordBreak: 'break-all' }}>
                      {truncAddr(txHash, 10)} ↗
                    </a>
                  </div>
                )}
              </div>
              <Link to={`/pay/${slug}`} onClick={() => { setPayStep('idle'); setTxHash(null); setPayError(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}>
                Return to payment page
              </Link>
            </div>
          )}

          {/* ══ ESCROW SUCCESS ══ */}
          {pageState === 'ready' && escrowStep === 'success' && linkData && (
            <div className="sp-card pp-fade-up" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div className="pp-success-icon" style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.25) 100%)', border: '2px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h1 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Escrow created!
              </h1>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#818cf8' }}>{amountXLM} XLM</strong> held in escrow for {merchantName}
              </p>
              <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                Funds are locked until the merchant confirms delivery. You can request a refund if needed.
              </p>

              {/* Escrow status badge */}
              {(() => {
                const b = ESCROW_BADGE[escrowStatus];
                return (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', background: b.bg, border: `1px solid ${b.border}`, marginBottom: '20px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: b.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: b.color }}>Escrow {escrowStatus}</span>
                  </div>
                );
              })()}

              <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)', textAlign: 'left', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {escrowId && (
                  <div>
                    <p style={{ margin: '0 0 2px 0', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Escrow ID</p>
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{escrowId}</p>
                  </div>
                )}
                {escrowTxHash && (
                  <div>
                    <p style={{ margin: '0 0 2px 0', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Transaction</p>
                    <a href={`https://stellar.expert/explorer/testnet/tx/${escrowTxHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#6366f1', fontFamily: 'monospace', textDecoration: 'underline', wordBreak: 'break-all' }}>
                      {truncAddr(escrowTxHash, 10)} ↗
                    </a>
                  </div>
                )}
              </div>

              <button
                onClick={() => { setEscrowStep('idle'); setEscrowId(null); setEscrowTxHash(null); setEscrowError(null); setEscrowStatus('Pending'); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
              >
                Create another escrow
              </button>
            </div>
          )}

          {/* ══ READY STATE — MAIN PAYMENT CARD ══ */}
          {pageState === 'ready' && payStep !== 'success' && escrowStep !== 'success' && linkData && (
            <div className="sp-card animate-slide-up">

              {/* ── Merchant identity ── */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', paddingBottom: '20px', borderBottom: '1px solid var(--surface-border)', marginBottom: '20px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 700, color: 'white', letterSpacing: '-0.02em', boxShadow: '0 0 0 4px rgba(99,102,241,0.15), 0 8px 24px rgba(99,102,241,0.3)', flexShrink: 0 }}>
                  {initials}
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-tertiary)', letterSpacing: '0.03em' }}>Payment request from</p>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{merchantName}</h1>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace', wordBreak: 'break-all', textAlign: 'center', maxWidth: '320px' }}>{linkData.merchant}</p>
              </div>

              {/* ── Amount box ── */}
              <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.025)', border: '1px solid var(--surface-border)', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <p style={{ margin: '0 0 4px 0', fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Amount</p>
                  <p className="pp-amount-num" style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    {amountXLM}{' '}
                    <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-secondary)' }}>XLM</span>
                  </p>
                </div>
                <div style={{ height: '1px', background: 'var(--surface-border)' }} />
                <div>
                  <p style={{ margin: '0 0 2px 0', fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>For</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{linkData.description}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px 0', fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Network</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
                    <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 500 }}>Stellar Testnet</span>
                  </div>
                </div>
              </div>

              {/* ── Payment mode toggle ── */}
              <div style={{ display: 'flex', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--surface-border)', padding: '3px', marginBottom: '16px', gap: '3px' }}>
                <button
                  id="mode-direct-btn"
                  onClick={() => setPayMode('direct')}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'Inter, sans-serif',
                    transition: 'all 0.18s',
                    background: payMode === 'direct' ? 'var(--brand-primary)' : 'transparent',
                    color: payMode === 'direct' ? 'white' : 'var(--text-tertiary)',
                  }}
                >
                  ⚡ Direct
                </button>
                <button
                  id="mode-escrow-btn"
                  onClick={() => setPayMode('escrow')}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'Inter, sans-serif',
                    transition: 'all 0.18s',
                    background: payMode === 'escrow' ? 'rgba(99,102,241,0.85)' : 'transparent',
                    color: payMode === 'escrow' ? 'white' : 'var(--text-tertiary)',
                  }}
                >
                  🔒 Escrow (buyer protection)
                </button>
              </div>

              {/* Escrow info banner */}
              {payMode === 'escrow' && (
                <div className="animate-fade-in" style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', marginBottom: '14px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <p style={{ margin: 0, fontSize: '12px', color: '#a5b4fc', lineHeight: 1.5 }}>
                    Funds are held in a smart contract escrow. The merchant can release them on delivery, or you can request a refund. Powered by <strong>inter-contract verification</strong>.
                  </p>
                </div>
              )}

              {/* ── Payment options ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                {/* Primary CTA */}
                <button
                  id="pay-wallet-btn"
                  onClick={handleConnectOrPay}
                  disabled={isPayingNow}
                  className="btn-cta"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', width: '100%' }}
                >
                  {isPayingNow ? (
                    <>
                      <span className="spinner" />
                      {escrowStep === 'creating' ? 'Creating escrow…' : escrowStep === 'pending' ? 'Confirming on-chain…' : 'Sending payment…'}
                    </>
                  ) : isConnected ? (
                    payMode === 'direct'
                      ? `Pay ${amountXLM} XLM →`
                      : `Lock ${amountXLM} XLM in Escrow →`
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
                        <path d="M16 3v4M8 3v4" />
                      </svg>
                      Connect wallet and {payMode === 'direct' ? 'pay' : 'create escrow'}
                    </>
                  )}
                </button>

                {/* Connected wallet indicator */}
                {isConnected && publicKey && (
                  <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-tertiary)', flex: 1 }}>
                      {payMode === 'direct' ? 'Paying from' : 'Escrow payer'}{' '}
                      <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {truncAddr(publicKey, 4)}
                      </span>
                    </p>
                  </div>
                )}

                {/* Direct payment error */}
                {payStep === 'failed' && payError && (
                  <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2.5" />
                    </svg>
                    <p style={{ margin: 0, fontSize: '12px', color: '#ef4444', flex: 1, lineHeight: 1.5 }}>{payError}</p>
                    <button onClick={() => { setPayStep('idle'); setPayError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.6, flexShrink: 0, padding: '2px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}

                {/* Escrow error */}
                {escrowStep === 'failed' && escrowError && (
                  <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2.5" />
                    </svg>
                    <p style={{ margin: 0, fontSize: '12px', color: '#ef4444', flex: 1, lineHeight: 1.5 }}>{escrowError}</p>
                    <button onClick={() => { setEscrowStep('idle'); setEscrowError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.6, flexShrink: 0, padding: '2px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--surface-border)' }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>or</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--surface-border)' }} />
                </div>

                {/* Manual option */}
                <button
                  id="pay-manual-toggle-btn"
                  onClick={() => setShowManual((v) => !v)}
                  className="btn-outline"
                  style={{ fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                  {showManual ? 'Hide manual option' : 'I have a Stellar address'}
                </button>

                {/* Manual section */}
                {showManual && (
                  <div className="animate-fade-in" style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                      Send manually from your Stellar wallet app. Use these exact details:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p style={{ margin: '0 0 2px 0', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Send to</p>
                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{linkData.merchant}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '120px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p style={{ margin: '0 0 2px 0', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount</p>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{amountXLM} XLM</p>
                        </div>
                        <div style={{ flex: 1, minWidth: '120px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p style={{ margin: '0 0 2px 0', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Memo</p>
                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>StellarPay:{linkData.slug}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="manual-addr-input" style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                        Your Stellar address (optional)
                      </label>
                      <input
                        id="manual-addr-input"
                        type="text"
                        value={manualAddr}
                        onChange={(e) => { setManualAddr(e.target.value); setManualAddrError(null); }}
                        onBlur={() => {
                          if (manualAddr && !isValidStellarAddress(manualAddr)) {
                            setManualAddrError('Not a valid Stellar address (must start with G)');
                          }
                        }}
                        placeholder="G… paste your Stellar address"
                        className={`input-base${manualAddrError ? ' error' : ''}`}
                        style={{ fontSize: '12px', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }}
                        spellCheck={false}
                        autoComplete="off"
                      />
                      {manualAddrError && (
                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--error)' }}>{manualAddrError}</p>
                      )}
                      <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        You'll need to send from your own wallet app.
                      </p>
                    </div>

                    <button
                      id="copy-payment-details-btn"
                      onClick={handleCopyDetails}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '38px', borderRadius: '8px', background: detailsCopied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${detailsCopied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`, color: detailsCopied ? '#22c55e' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all 0.2s', width: '100%' }}
                    >
                      {detailsCopied ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                          Copy payment details
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          {(pageState === 'ready' || pageState === 'inactive' || pageState === 'not_found') && (
            <div className="animate-fade-in" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                No middleman. Funds go directly to recipient.
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#3a3a52' }}>
                Powered by StellarPay Link · Stellar Testnet
              </p>
            </div>
          )}
        </div>

        {/* Wallet modal */}
        <WalletModal
          isOpen={isModalOpen}
          connectingWalletId={connectingWalletId}
          error={walletError}
          onConnect={connectWallet}
          onClose={() => setIsModalOpen(false)}
          onClearError={clearWalletError}
        />
      </div>
    </>
  );
};
