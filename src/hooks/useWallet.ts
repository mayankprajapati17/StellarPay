import { useState, useEffect, useCallback } from 'react';
import { connectFreighter } from '../utils/stellar';
import { getBalance } from '../utils/stellar';

const WALLET_KEY = 'stellarpay_wallet';

interface UseWalletReturn {
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  balance: string | null;
  isLoadingBalance: boolean;
  error: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  fetchBalance: () => Promise<void>;
  clearError: () => void;
}

export function useWallet(): UseWalletReturn {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (key?: string) => {
    const targetKey = key ?? publicKey;
    if (!targetKey) return;
    setIsLoadingBalance(true);
    try {
      const bal = await getBalance(targetKey);
      setBalance(bal);
    } catch (err) {
      if (err instanceof Error) {
        // Gracefully handle unfunded accounts
        if (
          err.message.toLowerCase().includes('not found') ||
          err.message.toLowerCase().includes('404')
        ) {
          setBalance('0');
        } else {
          setError(`Balance fetch failed: ${err.message}`);
        }
      }
    } finally {
      setIsLoadingBalance(false);
    }
  }, [publicKey]);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      // Uses Freighter v6 API: requestAccess() + getAddress()
      const pk = await connectFreighter();

      setPublicKey(pk);
      setIsConnected(true);
      localStorage.setItem(WALLET_KEY, pk);

      // Immediately fetch balance
      setIsLoadingBalance(true);
      try {
        const bal = await getBalance(pk);
        setBalance(bal);
      } catch {
        setBalance('0');
      } finally {
        setIsLoadingBalance(false);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to connect wallet. Please try again.');
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setPublicKey(null);
    setIsConnected(false);
    setBalance(null);
    setError(null);
    localStorage.removeItem(WALLET_KEY);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // On mount: attempt auto-reconnect from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem(WALLET_KEY);
    if (savedKey) {
      (async () => {
        try {
          // Try to get current address from Freighter without prompting
          const { getAddress } = await import('@stellar/freighter-api');
          const addressResult = await getAddress();

          if ('error' in addressResult && addressResult.error) {
            localStorage.removeItem(WALLET_KEY);
            return;
          }

          const pk = addressResult.address;
          if (pk && pk === savedKey) {
            setPublicKey(pk);
            setIsConnected(true);
            // Fetch balance silently
            setIsLoadingBalance(true);
            try {
              const bal = await getBalance(pk);
              setBalance(bal);
            } catch {
              setBalance('0');
            } finally {
              setIsLoadingBalance(false);
            }
          } else {
            localStorage.removeItem(WALLET_KEY);
          }
        } catch {
          // Auto-reconnect failed silently — user can manually connect
          localStorage.removeItem(WALLET_KEY);
        }
      })();
    }
  }, []);

  return {
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
  };
}
