# StellarPay — Stellar White Belt dApp

[![Stellar](https://img.shields.io/badge/Stellar-Testnet-blue?logo=stellar)](https://stellar.org)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178c6?logo=typescript)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5.0-646cff?logo=vite)](https://vitejs.dev)

## Description

StellarPay is a fully functional Stellar blockchain payment dApp built as a submission for the **Stellar Journey to Mastery — Level 1 White Belt** challenge. It enables users to connect their Freighter wallet, view their real-time XLM balance, and send XLM transactions on the Stellar Testnet, all from a sleek dark-themed interface. The app is 100% frontend — no backend or server required.

## Features

- 🔐 **Freighter Wallet Connect / Disconnect** — secure non-custodial wallet connection
- 💰 **Real-time XLM Balance** — live balance fetch from Stellar Testnet Horizon
- ✈️ **Send XLM Transactions** — with live signing feedback and memo support
- 🧾 **Transaction Hash** — with direct link to Stellar Expert block explorer
- 💾 **Auto-reconnect** — remembers your wallet across page refreshes
- ✅ **Address Validation** — real-time Stellar address validation with visual feedback
- 🌐 **Testnet Only** — safe testing environment, no real funds involved

## Prerequisites

- Node.js 18+
- Chrome or Firefox browser
- [Freighter Wallet](https://freighter.app) browser extension

## Setup Instructions

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd stellarpay

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev

# 4. Open in browser
# Navigate to: http://localhost:5173
```

## Testnet Setup

1. Install Freighter from [https://freighter.app](https://freighter.app)
2. Create or import a wallet in Freighter
3. In Freighter settings → **Network** → Switch to **Testnet**
4. Fund your testnet wallet:
   - Go to [https://laboratory.stellar.org/#account-creator](https://laboratory.stellar.org/#account-creator)
   - Paste your public key
   - Click **"Create Account"** (gives you 10,000 test XLM)

## Project Structure

```
stellarpay/
├── src/
│   ├── components/
│   │   ├── Navbar.tsx           # Top navigation bar
│   │   ├── WalletConnect.tsx    # Hero connect page
│   │   ├── BalanceCard.tsx      # XLM balance display
│   │   ├── SendForm.tsx         # Payment form
│   │   └── TransactionResult.tsx # Success/failure result card
│   ├── hooks/
│   │   └── useWallet.ts         # Wallet state management hook
│   ├── utils/
│   │   └── stellar.ts           # Stellar SDK utilities
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   ├── App.tsx                  # Root application component
│   ├── main.tsx                 # React entry point
│   └── index.css                # Global styles + Tailwind
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## Screenshots

<!-- Add screenshots here after running the app -->
- [ ] Wallet connected state
- [ ] Balance displayed
- [ ] Successful transaction
- [ ] Transaction result shown

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 18.2 | UI framework |
| TypeScript | 5.2 | Type safety |
| Vite | 5.0 | Build tool & dev server |
| @stellar/stellar-sdk | 12.3 | Blockchain interaction |
| @stellar/freighter-api | 2.1 | Wallet connection |
| Tailwind CSS | 3.4 | Styling |

## Key Technical Decisions

- **No Backend**: All blockchain interactions happen directly from the browser using Horizon REST API
- **Freighter for Signing**: Private keys never leave the user's Freighter extension
- **Testnet Horizon**: Uses `https://horizon-testnet.stellar.org` for safe testing
- **Auto-reconnect**: Public key persisted in localStorage for seamless UX across refreshes

## Live Demo

[Add Vercel/Netlify link here after deployment]

---

Built with ⚡ for the **Stellar Journey to Mastery** program — Level 1 White Belt submission.
