// シンプルなインメモリレート制限（Vercel Serverless対応）
// 注意: サーバーレス環境ではインスタンス間で共有されないため、
// 完全な制限にはならないが、基本的なスパム防止として機能

const requests = new Map<string, { count: number; resetTime: number }>();

// 5分ごとにマップをクリーンアップ
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, val] of requests) {
    if (now > val.resetTime) requests.delete(key);
  }
}

export function rateLimit(
  key: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): { success: boolean; remaining: number } {
  cleanup();
  const now = Date.now();
  const entry = requests.get(key);

  if (!entry || now > entry.resetTime) {
    requests.set(key, { count: 1, resetTime: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0 };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count };
}
