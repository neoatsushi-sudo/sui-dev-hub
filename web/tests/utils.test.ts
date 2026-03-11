import { describe, it, expect } from "vitest";
import { decodeBytes, shortAddress, parseTitle, estimateReadingTime } from "@/lib/utils";

describe("decodeBytes", () => {
  it("UTF-8バイト列を文字列にデコード", () => {
    // "Hello" in UTF-8
    const bytes = [72, 101, 108, 108, 111];
    expect(decodeBytes(bytes)).toBe("Hello");
  });

  it("日本語のデコード", () => {
    // "こんにちは" in UTF-8
    const text = "こんにちは";
    const bytes = Array.from(new TextEncoder().encode(text));
    expect(decodeBytes(bytes)).toBe("こんにちは");
  });

  it("空配列は空文字を返す", () => {
    expect(decodeBytes([])).toBe("");
  });
});

describe("shortAddress", () => {
  it("長いアドレスを短縮", () => {
    expect(shortAddress("0x1234567890abcdef")).toBe("0x1234...cdef");
  });

  it("短いアドレスはそのまま返す", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });

  it("空文字列", () => {
    expect(shortAddress("")).toBe("");
  });

  it("undefinedやnullに相当する空値", () => {
    expect(shortAddress("")).toBe("");
  });
});

describe("parseTitle", () => {
  it("タグ付きタイトルをパース", () => {
    const result = parseTitle("Sui Move入門 [Move][Tutorial]");
    expect(result.cleanTitle).toBe("Sui Move入門");
    expect(result.tags).toEqual(["Move", "Tutorial"]);
  });

  it("AIタグを検出", () => {
    const result = parseTitle("AIが書いた記事 [AI][Sui]");
    expect(result.cleanTitle).toBe("AIが書いた記事");
    expect(result.tags).toContain("AI");
    expect(result.tags).toContain("Sui");
  });

  it("タグなしのタイトル", () => {
    const result = parseTitle("シンプルなタイトル");
    expect(result.cleanTitle).toBe("シンプルなタイトル");
    expect(result.tags).toEqual([]);
  });

  it("空文字列", () => {
    const result = parseTitle("");
    expect(result.cleanTitle).toBe("");
    expect(result.tags).toEqual([]);
  });
});

describe("estimateReadingTime", () => {
  it("日本語テキストの読了時間（400字/分）", () => {
    // 400文字 → 1分
    const text = "あ".repeat(400);
    expect(estimateReadingTime(text)).toBe(1);
  });

  it("長い日本語テキスト", () => {
    // 800文字 → 2分
    const text = "あ".repeat(800);
    expect(estimateReadingTime(text)).toBe(2);
  });

  it("英語テキストの読了時間（200語/分）", () => {
    // 200単語 → 1分
    const text = Array(200).fill("word").join(" ");
    expect(estimateReadingTime(text)).toBe(1);
  });

  it("最低1分を返す", () => {
    expect(estimateReadingTime("短い")).toBe(1);
    expect(estimateReadingTime("")).toBe(1);
  });
});
