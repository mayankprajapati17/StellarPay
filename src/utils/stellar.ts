import * as StellarSdk from '@stellar/stellar-sdk';
import { signTransaction, requestAccess, getAddress } from '@stellar/freighter-api';
import type { SendPaymentParams } from '../types';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';

function getServer(): StellarSdk.Horizon.Server {
  return new StellarSdk.Horizon.Server(HORIZON_URL);
}

/**
 * Fetches the native XLM balance for a given Stellar public key.
 * Returns '0' if the account is not found (unfunded), throws for other failures.
 */
export async function getBalance(publicKey: string): Promise<string> {
  const server = getServer();
  try {
    const account = await server.loadAccount(publicKey);
    const nativeBalance = account.balances.find(
      (b) => b.asset_type === 'native'
    );
    return nativeBalance ? nativeBalance.balance : '0';
  } catch (err: unknown) {
    // Account not found → 404 → unfunded
    if (
      typeof err === 'object' &&
      err !== null &&
      'response' in err &&
      typeof (err as { response?: { status?: number } }).response === 'object'
    ) {
      const status = (err as { response: { status: number } }).response.status;
      if (status === 404) return '0';
    }
    if (err instanceof Error) {
      if (err.message.includes('404') || err.message.toLowerCase().includes('not found')) {
        return '0';
      }
      throw new Error(`Failed to fetch balance: ${err.message}`);
    }
    throw new Error('Failed to fetch balance: Unknown error');
  }
}

/**
 * Sends an XLM payment on Stellar Testnet using Freighter for signing.
 * Returns the transaction hash on success.
 */
export async function sendPayment(params: SendPaymentParams): Promise<string> {
  const { fromPublicKey, toAddress, amount, memo } = params;
  const server = getServer();

  try {
    const sourceAccount = await server.loadAccount(fromPublicKey);
    const baseFee = await server.fetchBaseFee();

    const transactionBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: StellarSdk.Networks.TESTNET,
    });

    transactionBuilder.addOperation(
      StellarSdk.Operation.payment({
        destination: toAddress,
        asset: StellarSdk.Asset.native(),
        amount: amount,
      })
    );

    if (memo && memo.trim().length > 0) {
      transactionBuilder.addMemo(StellarSdk.Memo.text(memo.trim()));
    }

    transactionBuilder.setTimeout(30);

    const transaction = transactionBuilder.build();
    const xdr = transaction.toXDR();

    // Ensure Freighter is connected before signing (required by Freighter v6)
    const accessResult = await requestAccess();
    if ('error' in accessResult && accessResult.error) {
      const msg = String(accessResult.error).toLowerCase();
      if (msg.includes('install') || msg.includes('not found')) {
        throw new Error('Freighter wallet not found. Please install it from freighter.app');
      }
      throw new Error(String(accessResult.error));
    }

    // Sign via Freighter v6 API
    const signResult = await signTransaction(xdr, {
      networkPassphrase: StellarSdk.Networks.TESTNET,
    });

    // Freighter v6 returns { signedTxXdr, signerAddress, error }
    if ('error' in signResult && signResult.error) {
      const errMsg = String(signResult.error).toLowerCase();
      if (errMsg.includes('reject') || errMsg.includes('cancel') || errMsg.includes('declined')) {
        throw new Error('Transaction rejected by user');
      }
      throw new Error(String(signResult.error));
    }

    const signedXdr = signResult.signedTxXdr;
    if (!signedXdr) {
      throw new Error('Transaction rejected by user');
    }

    const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      StellarSdk.Networks.TESTNET
    );

    const result = await server.submitTransaction(signedTransaction);
    return result.hash;
  } catch (err: unknown) {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('rejected') || msg.includes('declined') || msg.includes('cancel')) {
        throw new Error('Transaction rejected by user');
      }
      if (msg.includes('insufficient')) {
        throw new Error('Insufficient balance to complete this transaction');
      }
      if (msg.includes('no account') || msg.includes('account not found') || msg.includes('404')) {
        throw new Error('Account not found — destination address may not be funded yet');
      }
      throw err;
    }
    // Handle Horizon error envelope
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const horizonErr = err as {
        response: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } };
      };
      const codes = horizonErr.response?.data?.extras?.result_codes;
      if (codes?.transaction === 'tx_insufficient_balance') {
        throw new Error('Insufficient balance to complete this transaction');
      }
      if (codes?.operations?.includes('op_no_destination')) {
        throw new Error('Account not found — destination address may not be funded yet');
      }
    }
    throw new Error('An unexpected error occurred. Please try again.');
  }
}

/**
 * Validates whether a string is a valid Stellar Ed25519 public key.
 */
export function isValidStellarAddress(address: string): boolean {
  try {
    return StellarSdk.StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

/**
 * Truncates a Stellar address to first 4 + '...' + last 4 characters.
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Requests access to Freighter and returns the public key.
 * Uses the v6 API: requestAccess() + getAddress()
 */
export async function connectFreighter(): Promise<string> {
  // Request access permission from Freighter v6
  const accessResult = await requestAccess();
  if ('error' in accessResult && accessResult.error) {
    const msg = String(accessResult.error).toLowerCase();
    if (msg.includes('install') || msg.includes('not found')) {
      throw new Error('Freighter wallet not found. Please install it from freighter.app');
    }
    throw new Error(String(accessResult.error));
  }

  // Get the address from Freighter v6
  const addressResult = await getAddress();
  if ('error' in addressResult && addressResult.error) {
    throw new Error(String(addressResult.error));
  }

  const pk = addressResult.address;
  if (!pk) {
    throw new Error('Could not retrieve public key. Please unlock Freighter and try again.');
  }

  return pk;
}
