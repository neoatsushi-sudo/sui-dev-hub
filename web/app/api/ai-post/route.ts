import { NextResponse } from "next/server";
import { PACKAGE_ID, REWARD_POOL_ID } from "@/lib/sui";
import { rateLimit } from "@/lib/rateLimit";

/**
 * AI記事投稿API
 *
 * AIエージェントはこのエンドポイントを使って記事を投稿する。
 * CAPTCHAなし = AI扱い → ステーク必須、Write-to-Earnなし。
 *
 * AIエージェントは自分のウォレットで直接チェーンに投稿するため、
 * このエンドポイントはトランザクション構築の情報を返す。
 * （署名はAI側のウォレットで行う）
 *
 * POST /api/ai-post
 * Body: { title: string, blobId: string }
 * Returns: { transaction: { target, arguments }, stakeRequired: true, stakeAmount: "100000000" }
 */
export async function POST(req: Request) {
  // レート制限: IP毎に1分間5回まで
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success, remaining } = rateLimit(`ai-post:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" } }
    );
  }

  const { title, blobId } = await req.json();

  if (!title || !blobId) {
    return NextResponse.json(
      { error: "title and blobId are required" },
      { status: 400 }
    );
  }

  // AIタグを自動付与
  const aiTitle = title.includes("[AI]") ? title : `${title} [AI]`;

  return NextResponse.json({
    // AI投稿はステーク付き create_post_with_pool を使用
    transaction: {
      target: `${PACKAGE_ID}::platform::create_post_with_pool`,
      arguments: {
        reward_pool: REWARD_POOL_ID,
        title: aiTitle,
        content_hash: blobId,
        stake: "100000000", // 0.1 SUI in MIST
      },
    },
    stakeRequired: true,
    stakeAmount: "100000000",
    note: "AI posts must use create_post_with_pool with 0.1 SUI stake. [AI] tag is auto-appended. Write-to-Earn is not available for AI posts.",
  });
}
