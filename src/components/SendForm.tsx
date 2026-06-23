import React, { useState, useCallback } from 'react';
import { sendPayment, isValidStellarAddress } from '../utils/stellar';
import type { TransactionResult } from '../types';

interface SendFormProps {
  fromPublicKey: string;
  onSuccess: (result: TransactionResult) => void;
}

interface FormErrors {
  recipient?: string;
  amount?: string;
}

export const SendForm: React.FC<SendFormProps> = ({ fromPublicKey, onSuccess }) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [recipientValid, setRecipientValid] = useState<boolean | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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
      if (err instanceof Error) {
        setSendError(err.message);
      } else {
        setSendError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSending(false);
    }
  };

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
            <p
              className="animate-fade-in"
              style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--error)' }}
            >
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
            <p
              className="animate-fade-in"
              style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--error)' }}
            >
              {errors.amount}
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

        {/* Send error pill */}
        {sendError && (
          <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center' }}>
            <span
              style={{
                display: 'inline-block',
                background: 'var(--error-bg)',
                color: 'var(--error)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px',
                fontSize: '12px',
                padding: '8px 14px',
                width: '100%',
                lineHeight: 1.4,
              }}
            >
              {sendError}
            </span>
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
              Signing in Freighter...
            </>
          ) : (
            'Send Transaction →'
          )}
        </button>
      </form>
    </div>
  );
};
