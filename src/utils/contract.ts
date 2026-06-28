import * as StellarSdk from '@stellar/stellar-sdk';

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || '';
const RPC_URL = 'https://soroban-testnet.stellar.org';

function getRpc() {
  return new StellarSdk.rpc.Server(RPC_URL);
}

/**
 * Builds and prepares a Soroban transaction to create a payment link on-chain.
 * Returns the prepared transaction XDR for wallet signing.
 */
export async function createPaymentLink(params: {
  merchantPublicKey: string;
  slug: string;
  amount: string;
  description: string;
}): Promise<string> {
  if (!CONTRACT_ID) {
    throw new Error(
      'Contract ID not configured. Set VITE_CONTRACT_ID in your .env file.'
    );
  }

  const rpc = getRpc();
  const account = await rpc.getAccount(params.merchantPublicKey);
  const contract = new StellarSdk.Contract(CONTRACT_ID);

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'create_link',
        StellarSdk.Address.fromString(params.merchantPublicKey).toScVal(),
        StellarSdk.nativeToScVal(params.slug, { type: 'string' }),
        StellarSdk.nativeToScVal(
          BigInt(Math.floor(parseFloat(params.amount) * 10_000_000)),
          { type: 'i128' }
        ),
        StellarSdk.nativeToScVal(params.description, { type: 'string' })
      )
    )
    .setTimeout(30)
    .build();

  const prepared = await rpc.prepareTransaction(transaction);
  return prepared.toXDR();
}

/**
 * Read a payment link by slug via simulation (no signing required).
 */
export async function getPaymentLink(slug: string) {
  if (!CONTRACT_ID) return null;

  const rpc = getRpc();
  const contract = new StellarSdk.Contract(CONTRACT_ID);

  // Use a dummy account for simulation reads
  const dummyAccount = new StellarSdk.Account(
    'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    '0'
  );

  const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'get_link',
        StellarSdk.nativeToScVal(slug, { type: 'string' })
      )
    )
    .setTimeout(30)
    .build();

  return rpc.simulateTransaction(tx);
}

/**
 * Polls rpc.getTransaction() every 2 seconds to track Soroban transaction status.
 * Returns a cleanup function to stop polling.
 */
export function listenForContractEvents(
  txHash: string,
  onStatusChange: (
    status: 'pending' | 'success' | 'failed',
    ledger?: number
  ) => void
): () => void {
  let attempts = 0;
  const maxAttempts = 30;

  const interval = setInterval(async () => {
    attempts++;
    try {
      const rpc = getRpc();
      const result = await rpc.getTransaction(txHash);

      if (result.status === 'SUCCESS') {
        const ledger = 'ledger' in result ? (result.ledger as number) : undefined;
        onStatusChange('success', ledger);
        clearInterval(interval);
        return;
      }

      if (result.status === 'FAILED') {
        onStatusChange('failed');
        clearInterval(interval);
        return;
      }
      // NOT_FOUND / still pending — keep polling
    } catch {
      // Not indexed yet — keep polling
    }

    if (attempts >= maxAttempts) {
      onStatusChange('failed');
      clearInterval(interval);
    }
  }, 2000);

  return () => clearInterval(interval);
}

/**
 * Polls the Horizon REST API every 2 seconds for plain XLM payment transactions.
 * Used by TransactionResult's live status tracker.
 */
export function pollTransactionStatus(
  txHash: string,
  onStatusChange: (
    status: 'pending' | 'success' | 'failed',
    ledger?: number
  ) => void
): () => void {
  const HORIZON_URL = 'https://horizon-testnet.stellar.org';
  let attempts = 0;
  const maxAttempts = 30;

  const interval = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch(`${HORIZON_URL}/transactions/${txHash}`);
      if (res.ok) {
        const data = (await res.json()) as { successful: boolean; ledger?: number };
        if (data.successful === true) {
          onStatusChange('success', data.ledger);
          clearInterval(interval);
          return;
        }
        if (data.successful === false) {
          onStatusChange('failed');
          clearInterval(interval);
          return;
        }
      }
    } catch {
      // Not found yet — keep polling
    }

    if (attempts >= maxAttempts) {
      onStatusChange('failed');
      clearInterval(interval);
    }
  }, 2000);

  return () => clearInterval(interval);
}
