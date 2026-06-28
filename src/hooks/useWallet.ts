import { useState, useEffect, useCallback, useRef } from 'react';
import { getBalance } from '../utils/stellar';

const WALLET_KEY = 'stellarpay_wallet';
const WALLET_ID_KEY = 'stellarpay_wallet_id';

// These match the productId values in the kit modules
export const FREIGHTER_ID = 'freighter';
export const LOBSTR_ID = 'lobstr';
export const XBULL_ID = 'xbull';

interface UseWalletReturn {
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectingWalletId: string | null;
  balance: string | null;
  isLoadingBalance: boolean;
  error: string | null;
  connectedWalletId: string | null;
  connectWallet: (walletId: string) => Promise<void>;
  disconnectWallet: () => void;
  fetchBalance: () => Promise<void>;
  clearError: () => void;
}

// Track whether kit has been initialised (it's a static class)
let kitInitialised = false;

async function initKit(): Promise<void> {
  if (kitInitialised) return;

  const [
    { StellarWalletsKit, Networks },
    { FreighterModule, FREIGHTER_ID: FID },
    { LobstrModule },
    { xBullModule },
  ] = await Promise.all([
    import('@creit.tech/stellar-wallets-kit'),
    import('@creit.tech/stellar-wallets-kit/modules/freighter'),
    import('@creit.tech/stellar-wallets-kit/modules/lobstr'),
    import('@creit.tech/stellar-wallets-kit/modules/xbull'),
  ]);

  StellarWalletsKit.init({
    network: Networks.TESTNET,
    selectedWalletId: FID,
    modules: [
      new FreighterModule(),
      new LobstrModule(),
      new xBullModule(),
    ],
  });

  kitInitialised = true;
}



/**
 * Signs a transaction XDR string using the currently-selected wallet in the kit.
 * Returns the signed XDR string.
 */
export async function signWithKit(
  xdr: string,
  networkPassphrase: string
): Promise<string> {
  await initKit();
  const mod = await import('@creit.tech/stellar-wallets-kit');
  const result = await mod.StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase,
  });
  return result.signedTxXdr;
}

/**
 * Classifies an error from a wallet interaction into one of the 3 canonical types.
 */
export function classifyWalletError(
  err: unknown,
  walletName: string,
  walletUrl: string
): { type: 'not_installed' | 'rejected' | 'unknown'; message: string; url?: string } {
  // The kit throws plain objects like { code: -3, message: "..." } — handle those too
  const rawMsg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as Record<string, unknown>).message)
      : String(err);

  const msg = rawMsg.toLowerCase();

  if (
    msg.includes('not available') ||
    msg.includes('not installed') ||
    msg.includes('not found') ||
    msg.includes('install') ||
    msg.includes('extension') ||
    msg.includes('is not defined')
  ) {
    return {
      type: 'not_installed',
      message: `${walletName} is not installed. Download it at ${walletUrl}`,
      url: walletUrl,
    };
  }

  if (
    msg.includes('rejected') ||
    msg.includes('denied') ||
    msg.includes('cancelled') ||
    msg.includes('canceled') ||
    msg.includes('user refused') ||
    msg.includes('4001')
  ) {
    return {
      type: 'rejected',
      message: 'You cancelled the connection in your wallet.',
    };
  }

  return {
    type: 'unknown',
    message: rawMsg || 'Failed to connect wallet. Please try again.',
  };
}

const WALLET_META: Record<string, { name: string; url: string }> = {
  [FREIGHTER_ID]: { name: 'Freighter', url: 'https://freighter.app' },
  [LOBSTR_ID]: { name: 'LOBSTR', url: 'https://lobstr.co/wallet' },
  [XBULL_ID]: { name: 'xBull', url: 'https://xbull.app' },
};

export function useWallet(): UseWalletReturn {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedWalletId, setConnectedWalletId] = useState<string | null>(null);

  const autoReconnectAttempted = useRef(false);

  const fetchBalance = useCallback(
    async (key?: string) => {
      const targetKey = key ?? publicKey;
      if (!targetKey) return;
      setIsLoadingBalance(true);
      try {
        const bal = await getBalance(targetKey);
        setBalance(bal);
      } catch (err) {
        if (err instanceof Error) {
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
    },
    [publicKey]
  );

  const connectWallet = useCallback(async (walletId: string) => {
    setIsConnecting(true);
    setConnectingWalletId(walletId);
    setError(null);

    try {
      await initKit();
      const mod = await import('@creit.tech/stellar-wallets-kit');
      const { StellarWalletsKit } = mod;

      StellarWalletsKit.setWallet(walletId);
      const { address: pk } = await StellarWalletsKit.fetchAddress();

      if (!pk) {
        throw new Error('Could not retrieve public key from wallet.');
      }

      setPublicKey(pk);
      setIsConnected(true);
      setConnectedWalletId(walletId);
      localStorage.setItem(WALLET_KEY, pk);
      localStorage.setItem(WALLET_ID_KEY, walletId);

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
      const meta = WALLET_META[walletId] || { name: walletId, url: '' };
      const classified = classifyWalletError(err, meta.name, meta.url);
      setError(classified.message);
    } finally {
      setIsConnecting(false);
      setConnectingWalletId(null);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setPublicKey(null);
    setIsConnected(false);
    setBalance(null);
    setError(null);
    setConnectedWalletId(null);
    kitInitialised = false; // force re-init on next connect
    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem(WALLET_ID_KEY);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // On mount: auto-reconnect via Freighter's direct API (silent, no popup)
  useEffect(() => {
    if (autoReconnectAttempted.current) return;
    autoReconnectAttempted.current = true;

    const savedKey = localStorage.getItem(WALLET_KEY);
    const savedWalletId = localStorage.getItem(WALLET_ID_KEY) ?? FREIGHTER_ID;

    if (!savedKey) return;

    (async () => {
      try {
        if (savedWalletId === FREIGHTER_ID) {
          const { getAddress } = await import('@stellar/freighter-api');
          const addressResult = await getAddress();

          if ('error' in addressResult && addressResult.error) {
            localStorage.removeItem(WALLET_KEY);
            localStorage.removeItem(WALLET_ID_KEY);
            return;
          }

          const pk = addressResult.address;
          if (pk && pk === savedKey) {
            // Re-init kit with freighter selected
            await initKit();
            const mod = await import('@creit.tech/stellar-wallets-kit');
            mod.StellarWalletsKit.setWallet(FREIGHTER_ID);

            setPublicKey(pk);
            setIsConnected(true);
            setConnectedWalletId(FREIGHTER_ID);

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
            localStorage.removeItem(WALLET_ID_KEY);
          }
        } else {
          // LOBSTR / xBull cannot be auto-reconnected silently
          localStorage.removeItem(WALLET_KEY);
          localStorage.removeItem(WALLET_ID_KEY);
        }
      } catch {
        localStorage.removeItem(WALLET_KEY);
        localStorage.removeItem(WALLET_ID_KEY);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    publicKey,
    isConnected,
    isConnecting,
    connectingWalletId,
    balance,
    isLoadingBalance,
    error,
    connectedWalletId,
    connectWallet,
    disconnectWallet,
    fetchBalance,
    clearError,
  };
}
