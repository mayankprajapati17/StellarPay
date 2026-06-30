import * as StellarSdk from '@stellar/stellar-sdk';

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || '';
const ESCROW_CONTRACT_ID = import.meta.env.VITE_ESCROW_CONTRACT_ID || '';
const RPC_URL = 'https://soroban-testnet.stellar.org';

// Standard Stellar null account — 56 chars, always valid for read simulations
const SIM_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

function getRpc() {
  return new StellarSdk.rpc.Server(RPC_URL);
}

// ─── Payment Link Functions ───────────────────────────────────────────────────

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
  const dummyAccount = new StellarSdk.Account(SIM_ACCOUNT, '0');

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

// ─── Escrow Functions ─────────────────────────────────────────────────────────

/**
 * Builds a transaction that calls the escrow contract's `create_escrow`.
 *
 * The escrow contract INTERNALLY calls the payment-link contract via
 * inter-contract invocation to verify the slug is valid and active.
 *
 * Returns the prepared transaction XDR for wallet signing.
 */
export async function createEscrow(params: {
  payerPublicKey: string;
  merchantPublicKey: string;
  amount: string;
  linkSlug: string;
}): Promise<string> {
  if (!ESCROW_CONTRACT_ID) {
    throw new Error(
      'Escrow contract not configured. Set VITE_ESCROW_CONTRACT_ID in your .env file.'
    );
  }
  if (!CONTRACT_ID) {
    throw new Error(
      'Payment-link contract not configured. Set VITE_CONTRACT_ID in your .env file.'
    );
  }

  const rpc = getRpc();
  const account = await rpc.getAccount(params.payerPublicKey);
  const escrowContract = new StellarSdk.Contract(ESCROW_CONTRACT_ID);

  // Generate a UUID-style escrow ID from timestamp + random suffix
  const escrowId = `esc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const amountStroops = BigInt(params.amount);

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      escrowContract.call(
        'create_escrow',
        // payment_link_contract — Address of the L2 payment-link contract
        StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
        // payer
        StellarSdk.Address.fromString(params.payerPublicKey).toScVal(),
        // merchant
        StellarSdk.Address.fromString(params.merchantPublicKey).toScVal(),
        // amount in stroops (i128)
        StellarSdk.nativeToScVal(amountStroops, { type: 'i128' }),
        // link_slug
        StellarSdk.nativeToScVal(params.linkSlug, { type: 'string' }),
        // escrow_id
        StellarSdk.nativeToScVal(escrowId, { type: 'string' })
      )
    )
    .setTimeout(30)
    .build();

  const prepared = await rpc.prepareTransaction(transaction);
  // Encode the escrow ID in the XDR comment so the caller can extract it
  return JSON.stringify({ xdr: prepared.toXDR(), escrowId });
}

/**
 * Builds a transaction calling the escrow contract's `release_escrow`.
 * Only callable by the merchant whose address matches the stored escrow.
 * Returns the prepared transaction XDR for wallet signing.
 */
export async function releaseEscrow(params: {
  merchantPublicKey: string;
  escrowId: string;
}): Promise<string> {
  if (!ESCROW_CONTRACT_ID) {
    throw new Error(
      'Escrow contract not configured. Set VITE_ESCROW_CONTRACT_ID in your .env file.'
    );
  }

  const rpc = getRpc();
  const account = await rpc.getAccount(params.merchantPublicKey);
  const escrowContract = new StellarSdk.Contract(ESCROW_CONTRACT_ID);

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      escrowContract.call(
        'release_escrow',
        StellarSdk.Address.fromString(params.merchantPublicKey).toScVal(),
        StellarSdk.nativeToScVal(params.escrowId, { type: 'string' })
      )
    )
    .setTimeout(30)
    .build();

  const prepared = await rpc.prepareTransaction(transaction);
  return prepared.toXDR();
}

/**
 * Builds a transaction calling the escrow contract's `refund_escrow`.
 * Only callable by the payer whose address matches the stored escrow.
 * Returns the prepared transaction XDR for wallet signing.
 */
export async function refundEscrow(params: {
  payerPublicKey: string;
  escrowId: string;
}): Promise<string> {
  if (!ESCROW_CONTRACT_ID) {
    throw new Error(
      'Escrow contract not configured. Set VITE_ESCROW_CONTRACT_ID in your .env file.'
    );
  }

  const rpc = getRpc();
  const account = await rpc.getAccount(params.payerPublicKey);
  const escrowContract = new StellarSdk.Contract(ESCROW_CONTRACT_ID);

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      escrowContract.call(
        'refund_escrow',
        StellarSdk.Address.fromString(params.payerPublicKey).toScVal(),
        StellarSdk.nativeToScVal(params.escrowId, { type: 'string' })
      )
    )
    .setTimeout(30)
    .build();

  const prepared = await rpc.prepareTransaction(transaction);
  return prepared.toXDR();
}

/**
 * Read-only simulation: fetch current escrow state by ID.
 * Returns the raw simulation result (contains retval with Escrow struct).
 * No signing required.
 */
export async function getEscrowStatus(escrowId: string) {
  if (!ESCROW_CONTRACT_ID) return null;

  const rpc = getRpc();
  const escrowContract = new StellarSdk.Contract(ESCROW_CONTRACT_ID);
  const dummyAccount = new StellarSdk.Account(SIM_ACCOUNT, '0');

  const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      escrowContract.call(
        'get_escrow',
        StellarSdk.nativeToScVal(escrowId, { type: 'string' })
      )
    )
    .setTimeout(30)
    .build();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sim = (await rpc.simulateTransaction(tx)) as any;
  if (sim?.error) return null;

  const retval = sim?.result?.retval as StellarSdk.xdr.ScVal | undefined;
  if (!retval) return null;

  const native = StellarSdk.scValToNative(retval);
  if (!native || typeof native !== 'object') return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = native as Record<string, any>;
  const statusLabels: Record<number, string> = {
    0: 'Pending',
    1: 'Released',
    2: 'Refunded',
    3: 'Disputed',
  };

  let statusVal = 'Pending';
  if (Array.isArray(obj['status']) && obj['status'].length > 0) {
    const raw = obj['status'][0];
    statusVal = typeof raw === 'number' ? (statusLabels[raw] ?? 'Pending') : String(raw);
  } else if (typeof obj['status'] === 'string') {
    statusVal = obj['status'];
  }

  return {
    escrowId: String(obj['escrow_id'] ?? escrowId),
    payer: String(obj['payer'] ?? ''),
    merchant: String(obj['merchant'] ?? ''),
    amount: typeof obj['amount'] === 'bigint'
      ? obj['amount'] as bigint
      : BigInt(String(obj['amount'] ?? '0')),
    linkSlug: String(obj['link_slug'] ?? ''),
    status: statusVal as any,
  };
}

// ─── Transaction Tracking ─────────────────────────────────────────────────────

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
