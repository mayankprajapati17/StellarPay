# StellarPay Link — Yellow Belt dApp

[![Stellar](https://img.shields.io/badge/Stellar-Testnet-blue?logo=stellar)](https://stellar.org)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178c6?logo=typescript)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5.0-646cff?logo=vite)](https://vitejs.dev)
[![Soroban](https://img.shields.io/badge/Soroban-Smart_Contract-blueviolet)](https://soroban.stellar.org)

## Description

StellarPay Link is a Stellar blockchain payment dApp built for the **Stellar Journey to Mastery — Level 2 Yellow Belt** challenge. It supports multi-wallet connection (Freighter, LOBSTR, xBull), real-time XLM balance display, XLM send transactions, and a Soroban smart contract for creating shareable, on-chain payment links.

---

## Level 2 Features (Yellow Belt)

### Part 1 — Multi-Wallet Support
- 🔌 **Multi-wallet picker modal** — Freighter, LOBSTR, xBull via `@creit.tech/stellar-wallets-kit`
- 🔴 **Error Type 1: Not installed** — Red pill with download link
- 🟡 **Error Type 2: User rejected** — Amber pill with clear message
- 🔴 **Error Type 3: Insufficient balance** — Red pill with exact amounts and 1 XLM reserve warning
- ⏱️ **Auto-dismiss errors** after 8 seconds with X dismiss button

### Part 2 — Soroban Smart Contract (Rust)
- 📜 Full Soroban contract with `create_link`, `get_link`, `get_merchant_links`, `deactivate_link`, `get_count`
- 🧪 Unit tests covering all 4 operations

### Part 3 — Frontend Contract Integration
- 🔗 Create on-chain payment links from the dashboard
- 📋 Copy-to-clipboard shareable link
- 🔍 Live URL preview as you type the slug
- 📡 Real-time transaction status tracker (Pending → Confirmed/Failed)

### Part 4 — Live Transaction Status
- ⏳ Pulsing amber dot while pending
- ✅ Green dot + ledger number on confirmation
- ❌ Red dot on failure
- Polls every 2 seconds via Horizon API

---

## Level 1 Features (White Belt)

- 🔐 Freighter Wallet Connect / Disconnect
- 💰 Real-time XLM Balance from Stellar Testnet Horizon
- ✈️ Send XLM transactions with live signing feedback and memo support
- 🧾 Transaction Hash with direct link to Stellar Expert block explorer
- 💾 Auto-reconnect — remembers your wallet across page refreshes
- ✅ Address Validation — real-time Stellar address validation

---

## Prerequisites

- Node.js 18+
- Chrome or Firefox browser
- At least one of: [Freighter](https://freighter.app), [LOBSTR](https://lobstr.co), [xBull](https://xbull.app)
- (For contract deployment) Rust + `stellar-cli`

---

## Frontend Setup

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd stellarpay

# 2. Install dependencies
npm install

# 3. Configure environment (optional — for contract integration)
cp .env.example .env
# Edit .env and set VITE_CONTRACT_ID to your deployed contract address

# 4. Start the development server
npm run dev

# 5. Open in browser
# Navigate to: http://localhost:5173
```

---

## Testnet Setup

1. Install Freighter from [https://freighter.app](https://freighter.app)
2. Create or import a wallet in Freighter
3. In Freighter settings → **Network** → Switch to **Testnet**
4. Fund your testnet wallet:
   - Go to [https://laboratory.stellar.org/#account-creator](https://laboratory.stellar.org/#account-creator)
   - Paste your public key → click **"Create Account"** (gives you 10,000 test XLM)

---

## Smart Contract Deploy

The Soroban contract lives in `contracts/`. To deploy:

### Prerequisites

**Install Rust** (if not already installed):
- **Windows**: Download and run [rustup-init.exe](https://win.rustup.rs/x86_64), or run:
  ```powershell
  winget install Rustlang.Rustup
  ```
- **macOS/Linux**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

**Update Rust to 1.93+ (required for stellar-cli v27+):**
```bash
rustup update stable
```

### Deploy Steps

```bash
# 1. Add the WASM target (run once)
rustup target add wasm32v1-none

# 2. Install Stellar CLI v27+ (no --features opt needed)
cargo install --locked stellar-cli

# 3. Build the contract (from repo root)
stellar contract build --manifest-path contracts/Cargo.toml

# 4. Generate and fund a testnet identity
stellar keys generate deployer --network testnet --fund

# 5. Deploy to testnet
stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/stellarpay_link.wasm \
  --source deployer \
  --network testnet
# Returns a contract ID starting with 'C...'

# 6. Save the contract ID to .env
# Linux/macOS:
echo 'VITE_CONTRACT_ID=<contract-id-from-step-5>' >> .env
# Windows PowerShell:
Add-Content .env 'VITE_CONTRACT_ID=<contract-id-from-step-5>'
```

> **Windows note**: Use PowerShell and run commands from the repo root (`d:\stellerpay`),
> not from inside `contracts/`. The stellar-cli picks up `rust-toolchain.toml` automatically.

### Running Contract Tests

```bash
cargo test --manifest-path contracts/Cargo.toml
```

---

## Project Structure

```
stellarpay/
├── contracts/                       # Soroban smart contract (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                   # Contract: create_link, get_link, etc.
│       └── test.rs                  # Unit tests
├── src/
│   ├── components/
│   │   ├── Navbar.tsx               # Top navigation bar
│   │   ├── WalletConnect.tsx        # Hero connect page (opens modal)
│   │   ├── WalletModal.tsx          # Multi-wallet picker modal ✨
│   │   ├── BalanceCard.tsx          # XLM balance display
│   │   ├── SendForm.tsx             # Payment form (with 3 error types) ✨
│   │   ├── TransactionResult.tsx    # Success/failure + live status ✨
│   │   └── CreatePaymentLink.tsx    # On-chain payment link creator ✨
│   ├── hooks/
│   │   └── useWallet.ts             # Multi-wallet state (StellarWalletsKit) ✨
│   ├── utils/
│   │   ├── stellar.ts               # Stellar SDK / Horizon utilities
│   │   └── contract.ts              # Soroban RPC utilities ✨
│   ├── types/
│   │   └── index.ts                 # TypeScript types
│   ├── App.tsx                      # Root application component ✨
│   ├── main.tsx                     # React entry point
│   └── index.css                    # Global styles + Tailwind
├── .env.example                     # Environment variable template ✨
├── package.json
├── vite.config.ts
└── README.md
```

> ✨ = New or updated in Level 2

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 18.2 | UI framework |
| TypeScript | 5.2 | Type safety |
| Vite | 5.0 | Build tool & dev server |
| @stellar/stellar-sdk | 13.x | Blockchain interaction + Soroban RPC |
| @stellar/freighter-api | 6.x | Freighter wallet connection |
| @creit.tech/stellar-wallets-kit | latest | Multi-wallet abstraction ✨ |
| soroban-sdk | 21.0 | Smart contract (Rust) ✨ |
| Tailwind CSS | 3.4 | Styling |

---

## Key Technical Decisions

- **Multi-wallet via kit**: `@creit.tech/stellar-wallets-kit` abstracts Freighter/LOBSTR/xBull behind a unified API
- **3 canonical error types**: Not installed (red + download link), User rejected (amber), Insufficient balance (red + exact amounts)
- **Soroban contract**: Stores payment links as `Map<String, PaymentLink>` in persistent storage
- **Real-time tracking**: Horizon polling every 2s for XLM sends; Soroban RPC polling for contract calls
- **No Backend**: All blockchain interactions happen directly from the browser

---
## Smart Contract Details

| Item | Value |
|------|-------|
| Contract Address | `YOUR_FULL_CONTRACT_ADDRESS` |
| Network | Stellar Testnet |
| Language | Rust (soroban-sdk 21.0) |
| Explorer | [View on Stellar Expert](https://stellar.expert/explorer/testnet/contract/YOUR_ADDRESS) |

## Contract Interaction Proof
- Transaction hash of `create_link` call: `YOUR_TX_HASH`
- [View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/YOUR_TX_HASH)

## Screenshots
### Wallet picker modal
<img width="1899" height="816" alt="screencapture-stellar-fr3gghwf4-mayank-prajapatis-projects-vercel-app-2026-06-29-14_19_11" src="https://github.com/user-attachments/assets/cccd2327-f3b8-404a-9864-631e13c3994d" />


### Payment link created (stored on-chain)  
<img width="1920" height="1080" alt="Screenshot (10)" src="https://github.com/user-attachments/assets/b6833cd7-cb9b-4600-b9a1-e38b3c5ad474" />


## Live Demo

🌐 **[https://stellar-pay-pi.vercel.app/](https://stellar-pay-pi.vercel.app/)**

---

Built with ⚡ for the **Stellar Journey to Mastery** program — Level 2 Yellow Belt submission.
