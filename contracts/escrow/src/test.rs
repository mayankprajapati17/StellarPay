#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env, String, Map};

    // ── Mock payment-link contract ────────────────────────────────────────────
    // This simulates the on-chain payment-link contract so we can test the
    // inter-contract call without deploying the real contract.
    #[contract]
    pub struct MockPaymentLinkContract;

    #[contractimpl]
    impl MockPaymentLinkContract {
        /// get_link mirrors the real payment-link contract's function signature
        /// so env.invoke_contract succeeds with the same ABI.
        pub fn get_link(env: Env, slug: String) -> Option<PaymentLink> {
            let key = symbol_short!("links");
            let links: Map<String, PaymentLink> = env
                .storage()
                .persistent()
                .get(&key)
                .unwrap_or(Map::new(&env));
            links.get(slug)
        }

        /// Test helper: seed a payment link directly into storage.
        pub fn set_link(
            env: Env,
            slug: String,
            merchant: Address,
            amount: i128,
            active: bool,
        ) {
            let key = symbol_short!("links");
            let mut links: Map<String, PaymentLink> = env
                .storage()
                .persistent()
                .get(&key)
                .unwrap_or(Map::new(&env));
            links.set(
                slug.clone(),
                PaymentLink {
                    slug,
                    merchant,
                    amount,
                    description: String::from_str(&env, "Mock payment link"),
                    active,
                },
            );
            env.storage().persistent().set(&key, &links);
        }
    }

    // ── Test harness ──────────────────────────────────────────────────────────

    struct TestEnv {
        env: Env,
        escrow_client: EscrowContractClient<'static>,
        link_client: MockPaymentLinkContractClient<'static>,
        token_client: soroban_sdk::token::Client<'static>,
        payer: Address,
        merchant: Address,
    }

    fn setup_test() -> TestEnv {
        let env = Env::default();
        env.mock_all_auths();

        let payer    = Address::generate(&env);
        let merchant = Address::generate(&env);

        // Register a Stellar Asset Contract token so we can test fund transfers.
        let token_admin = Address::generate(&env);
        let token_addr  = env.register_stellar_asset_contract(token_admin);
        let token_client = soroban_sdk::token::Client::new(&env, &token_addr);

        // Mint 10 XLM (in stroops) to the payer for tests.
        let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_addr);
        sac.mint(&payer, &10_000_000i128);

        // Register the mock payment-link contract (simulates inter-contract target).
        let link_contract_id = env.register_contract(None, MockPaymentLinkContract);
        let link_client = MockPaymentLinkContractClient::new(&env, &link_contract_id);

        // Register the escrow contract (the contract under test).
        let escrow_contract_id = env.register_contract(None, EscrowContract);
        let escrow_client = EscrowContractClient::new(&env, &escrow_contract_id);

        // Initialize escrow with the token address.
        escrow_client.initialize(&token_addr);

        TestEnv { env, escrow_client, link_client, token_client, payer, merchant }
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// Test 1: inter-contract call succeeds and escrow is created correctly.
    #[test]
    fn test_create_escrow_with_valid_link() {
        let t = setup_test();
        let slug      = String::from_str(&t.env, "valid-link");
        let escrow_id = String::from_str(&t.env, "escrow-001");

        // Seed a valid active link into the mock contract.
        t.link_client.set_link(&slug, &t.merchant, &1_000_000i128, &true);

        // Call create_escrow — this triggers an inter-contract call to get_link.
        let result = t.escrow_client.create_escrow(
            &t.link_client.address,
            &t.payer,
            &t.merchant,
            &1_000_000i128,
            &slug,
            &escrow_id,
        );
        assert!(result.unwrap_or(false), "create_escrow should return Ok(true)");

        // Funds should now be held by the escrow contract.
        assert_eq!(
            t.token_client.balance(&t.escrow_client.address),
            1_000_000i128,
            "escrow contract should hold the funds"
        );
        assert_eq!(
            t.token_client.balance(&t.payer),
            9_000_000i128,
            "payer should have been debited"
        );

        // Escrow record should be correct.
        let escrow = t.escrow_client.get_escrow(&escrow_id).unwrap();
        assert_eq!(escrow.escrow_id, escrow_id);
        assert_eq!(escrow.payer,     t.payer);
        assert_eq!(escrow.merchant,  t.merchant);
        assert_eq!(escrow.amount,    1_000_000i128);
        assert_eq!(escrow.link_slug, slug);
        assert!(matches!(escrow.status, EscrowStatus::Pending));
    }

    /// Test 2: inter-contract call fails → LinkNotFound when slug doesn't exist;
    ///         LinkInactive when link exists but is deactivated.
    #[test]
    fn test_create_escrow_with_invalid_link() {
        let t = setup_test();

        // Case A: slug doesn't exist at all → LinkNotFound.
        let missing_slug = String::from_str(&t.env, "does-not-exist");
        let escrow_id    = String::from_str(&t.env, "escrow-bad");

        let err = t
            .escrow_client
            .try_create_escrow(
                &t.link_client.address,
                &t.payer,
                &t.merchant,
                &1_000_000i128,
                &missing_slug,
                &escrow_id,
            )
            .unwrap_err()
            .unwrap();

        assert_eq!(err, EscrowError::LinkNotFound, "missing slug should yield LinkNotFound");

        // Case B: link exists but is inactive → LinkInactive.
        let inactive_slug = String::from_str(&t.env, "inactive-link");
        t.link_client.set_link(&inactive_slug, &t.merchant, &1_000_000i128, &false);

        let err2 = t
            .escrow_client
            .try_create_escrow(
                &t.link_client.address,
                &t.payer,
                &t.merchant,
                &1_000_000i128,
                &inactive_slug,
                &escrow_id,
            )
            .unwrap_err()
            .unwrap();

        assert_eq!(err2, EscrowError::LinkInactive, "inactive link should yield LinkInactive");
    }

    /// Test 3: merchant releases escrow → funds move to merchant.
    #[test]
    fn test_release_escrow() {
        let t = setup_test();
        let slug      = String::from_str(&t.env, "release-link");
        let escrow_id = String::from_str(&t.env, "escrow-release");

        t.link_client.set_link(&slug, &t.merchant, &1_000_000i128, &true);
        t.escrow_client.create_escrow(
            &t.link_client.address,
            &t.payer,
            &t.merchant,
            &1_000_000i128,
            &slug,
            &escrow_id,
        );

        // Merchant releases: confirms delivery.
        let result = t.escrow_client.release_escrow(&t.merchant, &escrow_id);
        assert!(result.unwrap_or(false), "release_escrow should return Ok(true)");

        // All funds should now be with the merchant.
        assert_eq!(t.token_client.balance(&t.escrow_client.address), 0);
        assert_eq!(t.token_client.balance(&t.merchant), 1_000_000i128);

        // Status should be Released.
        let escrow = t.escrow_client.get_escrow(&escrow_id).unwrap();
        assert!(matches!(escrow.status, EscrowStatus::Released));
    }

    /// Test 4: payer refunds escrow → funds return to payer.
    #[test]
    fn test_refund_escrow() {
        let t = setup_test();
        let slug      = String::from_str(&t.env, "refund-link");
        let escrow_id = String::from_str(&t.env, "escrow-refund");

        t.link_client.set_link(&slug, &t.merchant, &1_000_000i128, &true);
        t.escrow_client.create_escrow(
            &t.link_client.address,
            &t.payer,
            &t.merchant,
            &1_000_000i128,
            &slug,
            &escrow_id,
        );

        // Payer requests refund.
        let result = t.escrow_client.refund_escrow(&t.payer, &escrow_id);
        assert!(result.unwrap_or(false), "refund_escrow should return Ok(true)");

        // Payer should have all tokens back.
        assert_eq!(t.token_client.balance(&t.escrow_client.address), 0);
        assert_eq!(t.token_client.balance(&t.payer), 10_000_000i128);

        // Status should be Refunded.
        let escrow = t.escrow_client.get_escrow(&escrow_id).unwrap();
        assert!(matches!(escrow.status, EscrowStatus::Refunded));
    }
}
