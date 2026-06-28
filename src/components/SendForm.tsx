import React, { useState, useCallback, useEffect, useRef } from 'react';
import { sendPayment, isValidStellarAddress } from '../utils/stellar';
import type { TransactionResult } from '../types';

interface SendFormProps {
  fromPublicKey: string;
  balance: string | null;
  onSuccess: (result: TransactionResult) => void;
}

interface FormErrors {
  recipient?: string;
  amount?: string;
}

type ErrorType = 'not_installed' | 'rejected' | 'insufficient' | 'unknown';

interface SendError {
  message: string;
  type: ErrorType;
  url?: string;
}

/** Classify a caught send error into one of the 3 canonical types. */
function classifySendError(err: unknown, amount?: string, balance?: string | null): SendError {
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (
    msg.includes('not available') ||
    msg.includes('not installed') ||
    msg.includes('not found') ||
    msg.includes('install') ||
    msg.includes('extension not found')
  ) {
    return {
      type: 'not_installed',
      message: 'Freighter is not installed. Download it at freighter.app',
      url: 'https://freighter.app',
    };
  }

  if (
    msg.includes('rejected') ||
    msg.includes('denied') ||
    msg.includes('cancelled') ||
    msg.includes('canceled') ||
    msg.includes('user refused') ||
    msg.includes('declined')
  ) {
    return {
      type: 'rejected',
      message: 'Transaction rejected. You cancelled the request in your wallet.',
    };
  }

  if (msg.includes('insufficient')) {
    const bal = balance ? parseFloat(balance).toFixed(2) : '?';
    const amt = amount ? parseFloat(amount).toFixed(2) : '?';
    return {
      type: 'insufficient',
      message: `Insufficient balance. You need at least ${amt} XLM. Your balance: ${bal} XLM`,
    };
  }

  return {
    type: 'unknown',
    message: err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.',
  };
}

const ERROR_COLORS: Record<ErrorType, { bg: string; border: string; text: string }> = {
  not_installed: {
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    text: '#ef4444',
  },
  rejected: {
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    text: '#f59e0b',
  },
  insufficient: {
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    text: '#ef4444',
  },
  unknown: {
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    text: '#ef4444',
  },
};

const AUTO_DISMISS_MS = 8000;

export const SendForm: React.FC<SendFormProps> = ({ fromPublicKey, balance, onSuccess }) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [recipientValid, setRecipientValid] = useState<boolean | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<SendError | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss error after 8 seconds
  useEffect(() => {
    if (sendError) {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setSendError(null);
      }, AUTO_DISMISS_MS);
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [sendError]);

  const validateRecipient = useCallback((value: string) => {
    if (!value.trim()) {
      setRecipientValid(null);
      setErrors((prev) => ({ ...prev, recipient: undefined }));
      return;
    }
    if (isValidStellarAddress(value.trim())) {
      setRecipientValid(true);
      setErrors((prev) => ({ ...prev, recipient: undefined }));
    } else {
      setRecipientValid(false);
      setErrors((prev) => ({
        ...prev,
        recipient: 'Invalid Stellar address. Must start with G and be 56 characters.',
      }));
    }
  }, []);

  const handleRecipientBlur = () => {
    validateRecipient(recipient);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError(null);
    const newErrors: FormErrors = {};

    if (!recipient.trim()) {
      newErrors.recipient = 'Recipient address is required';
    } else if (!isValidStellarAddress(recipient.trim())) {
      newErrors.recipient = 'Invalid Stellar address. Must start with G and be 56 characters.';
    }

    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    } else if (numAmount < 0.0000001) {
      newErrors.amount = 'Minimum amount is 0.0000001 XLM';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // ── Error Type 3: Insufficient balance pre-flight check ──
    // Keep 1 XLM as minimum reserve (Stellar network requirement)
    if (balance !== null) {
      const balanceNum = parseFloat(balance);
      if (!isNaN(balanceNum) && numAmount > balanceNum - 1) {
        const available = Math.max(0, balanceNum - 1).toFixed(2);
        setSendError({
          type: 'insufficient',
          message: `Insufficient balance. You need at least ${numAmount.toFixed(2)} XLM. Your balance: ${balanceNum.toFixed(2)} XLM (${available} XLM available after 1 XLM reserve).`,
        });
        return;
      }
    }

    setIsSending(true);
    try {
      const hash = await sendPayment({
        fromPublicKey,
        toAddress: recipient.trim(),
        amount: numAmount.toFixed(7),
        memo: memo.trim() || undefined,
      });

      onSuccess({
        success: true,
        hash,
        amount: numAmount.toFixed(7),
        destination: recipient.trim(),
      });

      setRecipient('');
      setAmount('');
      setMemo('');
      setErrors({});
      setRecipientValid(null);
    } catch (err) {
      setSendError(classifySendError(err, amount, balance));
    } finally {
      setIsSending(false);
    }
  };

  const colors = sendError ? ERROR_COLORS[sendError.type] : null;

  return (
    <div className="sp-card card-hover animate-slide-up">
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2
          style={{
            margin: '0 0 2px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          Send XLM
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
          Transfer funds on Stellar Testnet
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Recipient */}
        <div>
          <label
            htmlFor="recipient-input"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '0.01em',
              marginBottom: '6px',
            }}
          >
            Recipient Address
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="recipient-input"
              type="text"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                if (recipientValid !== null) validateRecipient(e.target.value);
              }}
              onBlur={handleRecipientBlur}
              placeholder="G... Stellar address"
              className={`input-base${errors.recipient ? ' error' : ''}`}
              style={{
                paddingRight: '40px',
                ...(recipientValid === true && !errors.recipient
                  ? { borderColor: 'var(--success)' }
                  : {}),
              }}
              disabled={isSending}
              autoComplete="off"
              spellCheck={false}
            />
            {/* Validation icon */}
            <div
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {recipientValid === true ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : recipientValid === false ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <span style={{ width: '8px', height: '2px', background: 'var(--text-tertiary)', display: 'block', borderRadius: '1px' }} />
              )}
            </div>
          </div>
          {errors.recipient && (
            <p className="animate-fade-in" style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--error)' }}>
              {errors.recipient}
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label
            htmlFor="amount-input"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '0.01em',
              marginBottom: '6px',
            }}
          >
            Amount
          </label>
          <div style={{ position: 'relative', display: 'flex' }}>
            {/* Left XLM addon */}
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
              id="amount-input"
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErrors((prev) => ({ ...prev, amount: undefined }));
              }}
              placeholder="0.00"
              min="0.0000001"
              step="0.0000001"
              className={`input-base${errors.amount ? ' error' : ''}`}
              style={{ borderRadius: '0 10px 10px 0', flex: 1 }}
              disabled={isSending}
            />
          </div>
          {errors.amount && (
            <p className="animate-fade-in" style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--error)' }}>
              {errors.amount}
            </p>
          )}
          {/* Available balance hint */}
          {balance !== null && (
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>
              Available: {Math.max(0, parseFloat(balance) - 1).toFixed(2)} XLM (after 1 XLM reserve)
            </p>
          )}
        </div>

        {/* Memo */}
        <div>
          <label
            htmlFor="memo-input"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '0.01em',
              marginBottom: '6px',
            }}
          >
            <span>Memo</span>
            <span
              style={{
                fontSize: '12px',
                color: memo.length > 24 ? 'var(--warning)' : 'var(--text-tertiary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {memo.length}/28
            </span>
          </label>
          <input
            id="memo-input"
            type="text"
            value={memo}
            onChange={(e) => {
              if (e.target.value.length <= 28) setMemo(e.target.value);
            }}
            placeholder="Optional note (max 28 chars)"
            maxLength={28}
            className="input-base"
            disabled={isSending}
          />
        </div>

        {/* Enhanced Error Pill */}
        {sendError && colors && (
          <div
            className="animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              animation: 'slideErrorIn 0.2s ease-out',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '12px', color: colors.text, lineHeight: 1.5 }}>
                {sendError.message}
              </p>
              {sendError.type === 'not_installed' && sendError.url && (
                <a
                  href={sendError.url}
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
                  Download Freighter →
                </a>
              )}
            </div>
            {/* X dismiss button */}
            <button
              type="button"
              onClick={() => setSendError(null)}
              aria-label="Dismiss error"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                flexShrink: 0,
                color: colors.text,
                opacity: 0.7,
                lineHeight: 1,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Submit button */}
        <button
          id="send-payment-btn"
          type="submit"
          disabled={isSending}
          className="btn-cta"
        >
          {isSending ? (
            <>
              <span className="spinner" />
              Signing in wallet...
            </>
          ) : (
            'Send Transaction →'
          )}
        </button>
      </form>
    </div>
  );
};
