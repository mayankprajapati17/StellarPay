import { describe, it, expect } from 'vitest';
import { isValidStellarAddress, truncateAddress } from '../stellar';

describe('stellar utils', () => {
  // ── isValidStellarAddress ──────────────────────────────────────────────────

  it('validates a correct Stellar Ed25519 public key', () => {
    const valid = 'GBEY6VZ6RF27J2VAMBVH4F34R3EZWFNA7RN5RE3W3PEWV3WV7YSCABSO';
    expect(isValidStellarAddress(valid)).toBe(true);
  });

  it('rejects an address that is too short', () => {
    expect(isValidStellarAddress('GABC')).toBe(false);
  });

  it('rejects an address that does not start with G', () => {
    expect(isValidStellarAddress('XBEY6VZ6RF27J2VAMBVH4F34R3EZWFNA7RN5RE3W3PEWV3WV7YSCABSO')).toBe(false);
  });

  it('rejects a plain string that is not a Stellar address', () => {
    expect(isValidStellarAddress('not-a-valid-address')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidStellarAddress('')).toBe(false);
  });

  // ── truncateAddress ────────────────────────────────────────────────────────

  it('truncates a full Stellar address to first 4 + "..." + last 4', () => {
    const addr = 'GBEY6VZ6RF27J2VAMBVH4F34R3EZWFNA7RN5RE3W3PEWV3WV7YSCABSO';
    expect(truncateAddress(addr)).toBe('GBEY...ABSO');
  });

  it('returns short strings unchanged', () => {
    expect(truncateAddress('GABCD')).toBe('GABCD');
  });

  it('returns empty string unchanged', () => {
    expect(truncateAddress('')).toBe('');
  });
});
