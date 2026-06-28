#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    #[test]
    fn test_create_and_get_link() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StellarPayContract);
        let client = StellarPayContractClient::new(&env, &contract_id);

        let merchant = Address::generate(&env);
        let slug = String::from_str(&env, "test-link");
        let desc = String::from_str(&env, "Test payment");

        let result = client.create_link(&merchant, &slug, &10_000_000i128, &desc);
        assert!(result, "create_link should return true");

        let link = client.get_link(&slug);
        assert!(link.is_some(), "get_link should return Some");

        let link = link.unwrap();
        assert_eq!(link.amount, 10_000_000, "amount should be 10_000_000 stroops");
        assert!(link.active, "link should be active");
    }

    #[test]
    fn test_deactivate_link() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StellarPayContract);
        let client = StellarPayContractClient::new(&env, &contract_id);

        let merchant = Address::generate(&env);
        let slug = String::from_str(&env, "deactivate-me");
        let desc = String::from_str(&env, "To be deactivated");

        client.create_link(&merchant, &slug, &5_000_000i128, &desc);

        let deactivated = client.deactivate_link(&merchant, &slug);
        assert!(deactivated, "deactivate_link should return true");

        let link = client.get_link(&slug).unwrap();
        assert!(!link.active, "link should be inactive after deactivation");
    }

    #[test]
    fn test_get_count() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StellarPayContract);
        let client = StellarPayContractClient::new(&env, &contract_id);

        assert_eq!(client.get_count(), 0, "count should start at 0");

        let merchant = Address::generate(&env);
        client.create_link(
            &merchant,
            &String::from_str(&env, "link-one"),
            &1_000_000i128,
            &String::from_str(&env, "First"),
        );
        assert_eq!(client.get_count(), 1, "count should be 1 after one create");

        client.create_link(
            &merchant,
            &String::from_str(&env, "link-two"),
            &2_000_000i128,
            &String::from_str(&env, "Second"),
        );
        assert_eq!(client.get_count(), 2, "count should be 2 after two creates");
    }

    #[test]
    fn test_get_merchant_links() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StellarPayContract);
        let client = StellarPayContractClient::new(&env, &contract_id);

        let merchant_a = Address::generate(&env);
        let merchant_b = Address::generate(&env);

        client.create_link(
            &merchant_a,
            &String::from_str(&env, "a-link-1"),
            &1_000_000i128,
            &String::from_str(&env, "A's first"),
        );
        client.create_link(
            &merchant_a,
            &String::from_str(&env, "a-link-2"),
            &2_000_000i128,
            &String::from_str(&env, "A's second"),
        );
        client.create_link(
            &merchant_b,
            &String::from_str(&env, "b-link-1"),
            &3_000_000i128,
            &String::from_str(&env, "B's first"),
        );

        let a_links = client.get_merchant_links(&merchant_a);
        assert_eq!(a_links.len(), 2, "merchant A should have 2 links");

        let b_links = client.get_merchant_links(&merchant_b);
        assert_eq!(b_links.len(), 1, "merchant B should have 1 link");
    }
}
