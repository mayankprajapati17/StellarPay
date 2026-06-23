export interface TransactionResult {
  success: boolean;
  hash?: string;
  error?: string;
  amount?: string;
  destination?: string;
}

export interface WalletState {
  publicKey: string | null;
  isConnected: boolean;
  balance: string | null;
}

export interface SendPaymentParams {
  fromPublicKey: string;
  toAddress: string;
  amount: string;
  memo?: string;
}
