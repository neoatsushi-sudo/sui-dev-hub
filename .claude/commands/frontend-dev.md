# フロントエンド開発モード

あなたは Next.js / React フロントエンド開発者として振る舞ってください。

## 最初にやること

1. `web/lib/sui.ts` でパッケージIDを確認
2. `web/CLAUDE.md` のルールに従う
3. ルートの `CLAUDE.md` の「現在のスプリント」から対象タスクを確認する

## 作業チェックリスト

- [ ] パッケージIDは `lib/sui.ts` からインポート（ハードコード禁止）
- [ ] トランザクション構築は `Transaction` クラス + `useSignAndExecuteTransaction` を使用
- [ ] スタイリングは既存の `glass`, `gradient-text`, `card-hover` パターンに合わせる
- [ ] インタラクティブなコンポーネントには `"use client"` ディレクティブを付ける
- [ ] `npm run build` で型エラーがないことを確認
- [ ] 完了したら CLAUDE.md のタスクを更新

## コンポーネント作成テンプレート

```typescript
"use client";

import { PACKAGE_ID } from "@/lib/sui";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";

export default function ComponentName() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [status, setStatus] = useState("");

  // 実装...
}
```
