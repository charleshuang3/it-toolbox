import { describe, it, expect } from "vitest";
import { encrypt, decrypt, algoConfig } from "./crypto";
import type { AlgoType } from "./crypto";

const algos = Object.keys(algoConfig) as AlgoType[];

describe("encryption crypto", () => {
  for (const algo of algos) {
    it(`round-trips with ${algo} using a generated nonce`, async () => {
      const { ciphertext, nonce } = await encrypt("hello world", "secret", algo);
      expect(nonce).toHaveLength(algoConfig[algo].nonceSize * 2);
      expect(await decrypt(ciphertext, "secret", algo, nonce)).toBe("hello world");
    });
  }

  it("generates a unique nonce each time", async () => {
    const a = await encrypt("same", "secret", "AES-GCM");
    const b = await encrypt("same", "secret", "AES-GCM");
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("uses a supplied nonce deterministically", async () => {
    const nonce = "00112233445566778899aabb";
    const a = await encrypt("same", "secret", "AES-GCM", nonce);
    const b = await encrypt("same", "secret", "AES-GCM", nonce);
    expect(a).toEqual(b);
    expect(a.nonce).toBe(nonce);
  });

  it("rejects an invalid nonce", async () => {
    await expect(encrypt("x", "secret", "AES-GCM", "abcd")).rejects.toThrow(/Nonce/);
  });

  it("fails to decrypt with the wrong secret", async () => {
    const { ciphertext, nonce } = await encrypt("hello", "secret", "AES-GCM");
    await expect(decrypt(ciphertext, "other", "AES-GCM", nonce)).rejects.toThrow(Error);
  });
});
