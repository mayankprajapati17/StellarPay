#![no_std]
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, Map,
};

/// Event emitted when a new payment link is created.
#[contractevent]
pub struct LinkCreatedEvent {
    pub slug: String,
    pub merchant: Address,
}

/// Data stored on-chain for each payment link.
#[contracttype]
#[derive(Clone)]
pub struct PaymentLink {
    /// Unique URL slug, e.g. "john-freelance"
    pub slug: String,
    /// Stellar wallet address of the merchant
    pub merchant: Address,
    /// Amount in stroops (1 XLM = 10_000_000 stroops)
    pub amount: i128,
    /// Human-readable description, e.g. "Payment for web design"
    pub description: String,
    /// Whether the link is still accepting payments
    pub active: bool,
}

#[contract]
pub struct StellarPayContract;

#[contractimpl]
impl StellarPayContract {
    /// Create a new payment link.
    /// The merchant must authorize this call.
    pub fn create_link(
        env: Env,
        merchant: Address,
        slug: String,
        amount: i128,
        description: String,
    ) -> bool {
        merchant.require_auth();

        let key = symbol_short!("links");
        let mut links: Map<String, PaymentLink> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Map::new(&env));

        let link = PaymentLink {
            slug: slug.clone(),
            merchant,
            amount,
            description,
            active: true,
        };

        links.set(slug.clone(), link);
        env.storage().persistent().set(&key, &links);

        // Emit a creation event for frontend listeners
        LinkCreatedEvent { slug, merchant: merchant.clone() }.publish(&env);

        true
    }

    /// Retrieve a payment link by its slug.
    /// Returns None if the slug does not exist.
    pub fn get_link(env: Env, slug: String) -> Option<PaymentLink> {
        let key = symbol_short!("links");
        let links: Map<String, PaymentLink> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Map::new(&env));
        links.get(slug)
    }

    /// Return all payment links created by a specific merchant address.
    pub fn get_merchant_links(env: Env, merchant: Address) -> Vec<PaymentLink> {
        let key = symbol_short!("links");
        let links: Map<String, PaymentLink> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Map::new(&env));

        let mut result = Vec::new(&env);
        for (_, link) in links.iter() {
            if link.merchant == merchant {
                result.push_back(link);
            }
        }
        result
    }

    /// Deactivate a payment link.
    /// Only the original merchant can deactivate their own link.
    pub fn deactivate_link(env: Env, merchant: Address, slug: String) -> bool {
        merchant.require_auth();

        let key = symbol_short!("links");
        let mut links: Map<String, PaymentLink> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Map::new(&env));

        if let Some(mut link) = links.get(slug.clone()) {
            link.active = false;
            links.set(slug, link);
            env.storage().persistent().set(&key, &links);
            return true;
        }
        false
    }

    /// Return the total number of payment links ever created.
    pub fn get_count(env: Env) -> u32 {
        let key = symbol_short!("links");
        let links: Map<String, PaymentLink> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Map::new(&env));
        links.len()
    }
}

mod test;
