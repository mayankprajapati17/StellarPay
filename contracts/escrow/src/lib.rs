#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short, vec,
    Address, Env, String, Map,
};

/// Mirror of the PaymentLink struct from the payment-link contract.
/// Required so we can deserialise the Option<PaymentLink> return value
/// from the inter-contract call.
#[contracttype]
#[derive(Clone)]
pub struct PaymentLink {
    pub slug: String,
    pub merchant: Address,
    pub amount: i128,
    pub description: String,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Pending,
    Released,
    Refunded,
    Disputed,
}

#[contracttype]
#[derive(Clone)]
pub struct Escrow {
    pub escrow_id: String,
    pub payer: Address,
    pub merchant: Address,
    pub amount: i128,
    pub link_slug: String,
    pub status: EscrowStatus,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    LinkNotFound   = 1,
    LinkInactive   = 2,
    EscrowNotFound = 3,
    AlreadyResolved = 4,
    Unauthorized   = 5,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // ── Initializer ──────────────────────────────────────────────────────────

    /// One-time setup: store the SAC token address used for fund transfers.
    pub fn initialize(env: Env, token: Address) {
        let key = symbol_short!("token");
        if env.storage().instance().has(&key) {
            panic!("already initialized");
        }
        env.storage().instance().set(&key, &token);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    fn get_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("token"))
            .expect("contract not initialized")
    }

    fn load_escrows(env: &Env) -> Map<String, Escrow> {
        env.storage()
            .persistent()
            .get(&symbol_short!("escrows"))
            .unwrap_or(Map::new(env))
    }

    fn save_escrows(env: &Env, escrows: &Map<String, Escrow>) {
        env.storage()
            .persistent()
            .set(&symbol_short!("escrows"), escrows);
    }

    // ── Public functions ──────────────────────────────────────────────────────

    /// Create an escrow — performs an INTER-CONTRACT CALL to the payment-link
    /// contract to verify the slug is valid and active before accepting funds.
    ///
    /// # Arguments
    /// * `payment_link_contract` — Address of the deployed StellarPay payment-link contract
    /// * `payer`                 — Buyer's address (must authorise)
    /// * `merchant`              — Seller's address (must match link's merchant)
    /// * `amount`                — Amount in stroops (must match link's amount)
    /// * `link_slug`             — Payment-link slug to validate against
    /// * `escrow_id`             — Unique ID for this escrow (caller-chosen)
    pub fn create_escrow(
        env: Env,
        payment_link_contract: Address,
        payer: Address,
        merchant: Address,
        amount: i128,
        link_slug: String,
        escrow_id: String,
    ) -> Result<bool, EscrowError> {
        payer.require_auth();

        // ── INTER-CONTRACT CALL ───────────────────────────────────────────────
        // Invoke `get_link(slug)` on the payment-link contract.
        // Returns Option<PaymentLink>: None means the slug doesn't exist.
        let link_opt: Option<PaymentLink> = env.invoke_contract(
            &payment_link_contract,
            &symbol_short!("get_link"),
            vec![&env, link_slug.clone().into()],
        );

        let link = match link_opt {
            Some(l) => l,
            None => return Err(EscrowError::LinkNotFound),
        };

        if !link.active {
            return Err(EscrowError::LinkInactive);
        }

        // Verify the merchant and amount match the on-chain link definition.
        if link.merchant != merchant {
            return Err(EscrowError::Unauthorized);
        }
        if link.amount != amount {
            return Err(EscrowError::Unauthorized);
        }

        let mut escrows = Self::load_escrows(&env);

        // Prevent overwriting an existing escrow.
        if escrows.contains_key(escrow_id.clone()) {
            return Err(EscrowError::AlreadyResolved);
        }

        // Pull funds from payer into this escrow contract.
        let token_client = soroban_sdk::token::Client::new(&env, &Self::get_token(&env));
        token_client.transfer(&payer, &env.current_contract_address(), &amount);

        let escrow = Escrow {
            escrow_id: escrow_id.clone(),
            payer,
            merchant,
            amount,
            link_slug,
            status: EscrowStatus::Pending,
        };

        escrows.set(escrow_id, escrow);
        Self::save_escrows(&env, &escrows);

        env.events().publish((symbol_short!("escrow_c"),), true);
        Ok(true)
    }

    /// Merchant calls this once they've delivered — releases held funds to them.
    pub fn release_escrow(
        env: Env,
        merchant: Address,
        escrow_id: String,
    ) -> Result<bool, EscrowError> {
        merchant.require_auth();

        let mut escrows = Self::load_escrows(&env);
        let mut escrow = escrows
            .get(escrow_id.clone())
            .ok_or(EscrowError::EscrowNotFound)?;

        if !matches!(escrow.status, EscrowStatus::Pending) {
            return Err(EscrowError::AlreadyResolved);
        }
        if escrow.merchant != merchant {
            return Err(EscrowError::Unauthorized);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &Self::get_token(&env));
        token_client.transfer(
            &env.current_contract_address(),
            &escrow.merchant,
            &escrow.amount,
        );

        escrow.status = EscrowStatus::Released;
        escrows.set(escrow_id, escrow);
        Self::save_escrows(&env, &escrows);

        env.events().publish((symbol_short!("released"),), true);
        Ok(true)
    }

    /// Payer requests a refund — returns held funds back to them.
    pub fn refund_escrow(
        env: Env,
        payer: Address,
        escrow_id: String,
    ) -> Result<bool, EscrowError> {
        payer.require_auth();

        let mut escrows = Self::load_escrows(&env);
        let mut escrow = escrows
            .get(escrow_id.clone())
            .ok_or(EscrowError::EscrowNotFound)?;

        if !matches!(escrow.status, EscrowStatus::Pending) {
            return Err(EscrowError::AlreadyResolved);
        }
        if escrow.payer != payer {
            return Err(EscrowError::Unauthorized);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &Self::get_token(&env));
        token_client.transfer(
            &env.current_contract_address(),
            &escrow.payer,
            &escrow.amount,
        );

        escrow.status = EscrowStatus::Refunded;
        escrows.set(escrow_id, escrow);
        Self::save_escrows(&env, &escrows);

        env.events().publish((symbol_short!("refunded"),), true);
        Ok(true)
    }

    /// Read-only: retrieve a single escrow by ID.
    pub fn get_escrow(env: Env, escrow_id: String) -> Option<Escrow> {
        Self::load_escrows(&env).get(escrow_id)
    }
}

#[cfg(test)]
mod test;
