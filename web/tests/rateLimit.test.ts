import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rateLimit";

describe("rateLimit", () => {
  it("制限内のリクエストは許可", () => {
    const result = rateLimit("test-key-1", { limit: 3, windowMs: 60000 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("制限を超えるとブロック", () => {
    const key = "test-key-2";
    rateLimit(key, { limit: 2, windowMs: 60000 });
    rateLimit(key, { limit: 2, windowMs: 60000 });
    const result = rateLimit(key, { limit: 2, windowMs: 60000 });
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("異なるキーは独立してカウント", () => {
    const r1 = rateLimit("key-a", { limit: 1, windowMs: 60000 });
    const r2 = rateLimit("key-b", { limit: 1, windowMs: 60000 });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });
});
