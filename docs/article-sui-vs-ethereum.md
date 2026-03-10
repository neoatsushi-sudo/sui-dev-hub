## はじめに

Ethereumで開発してきたエンジニアにとって、新しいL1チェーンの評価は常に「Ethereumと比べてどうか」が起点になる。Suiは2023年にメインネットをローンチした比較的新しいL1ブロックチェーンだが、そのアーキテクチャはEthereumとは根本的に異なる設計思想に基づいている。

この記事では、Ethereum開発者の視点からSuiの技術的特徴を比較し、両者の違いを具体的なコード例とともに解説する。「Solidityで書いていたあの処理は、Moveではどう表現するのか」「Ethereumのあの制約は、Suiではどう解決されるのか」――そういった実践的な疑問に答えることを目指す。

筆者自身、Sui Dev Hubという分散型コンテンツプラットフォームをSui上で構築した経験があり、その過程で感じたEthereumとの違いを交えて解説していく。

## コンセンサスメカニズム

### Ethereum: Proof of Stake (Gasper)

Ethereumは2022年のThe Mergeを経て、Proof of Work（PoW）からProof of Stake（PoS）に移行した。現在のコンセンサスプロトコルはGasper（Casper FFG + LMD-GHOST）で、バリデーターが32 ETHをステークしてブロック提案と検証を行う。

ブロック生成は約12秒間隔。ファイナリティは2エポック（約12.8分）で確定する。すべてのトランザクションは単一のブロックに順序付けられ、シーケンシャルに実行される。

### Sui: Narwhal/Bullshark（Mysticeti）

Suiのコンセンサスは、もともとNarwhal（メムプール）+ Bullshark（合意形成）の組み合わせで設計された。現在はMysticetiと呼ばれる改良版プロトコルに進化している。

Suiの最大の特徴は**「シンプルなトランザクションにはコンセンサス不要」**という設計だ。単一オーナーのオブジェクトのみを操作するトランザクション（例：トークン送金）は、コンセンサスを経由せずByzantine Consistent Broadcastだけで確定する。これにより、サブセカンド（約400ms）のファイナリティを実現している。

共有オブジェクトを操作するトランザクション（例：DEXのリクイディティプール操作）のみが、フルコンセンサスを通過する。

```
Ethereum:  TX → メムプール → ブロック提案 → 検証 → 実行 → ファイナリティ(~12.8分)
Sui:       TX(単一オーナー) → Byzantine Broadcast → 確定(~400ms)
Sui:       TX(共有オブジェクト) → Mysticeti合意 → 確定(~2-3秒)
```

この設計の意味は大きい。例えばNFTの送付やトークンの移転といった、ユーザーが最も頻繁に行う操作が最も高速に処理される。

## プログラミングモデル

### Solidity: アカウントベース

Solidityでは、スマートコントラクトはアカウントに紐づくステートを持つ。ERC-20トークンを例にすると、残高は1つのコントラクト内の`mapping`に全ユーザー分がまとめて格納される。

```solidity
// Solidity: ERC-20トークン
contract MyToken is ERC20 {
    // 全ユーザーの残高を1つのmappingで管理
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;

    function transfer(address to, uint256 amount) public returns (bool) {
        address owner = msg.sender;
        _balances[owner] -= amount;
        _balances[to] += amount;
        emit Transfer(owner, to, amount);
        return true;
    }
}
```

この設計では、すべてのtransfer操作が同じコントラクトの同じストレージスロットに書き込むため、トランザクション間で競合が発生しやすい。

### Move: オブジェクトセントリック

Moveでは、トークンは個々のオブジェクトとしてユーザーに直接所有される。Sui Moveの`Coin`は各ユーザーが独立したオブジェクトとして保持する。

```move
// Move: Coinの定義（sui::coin モジュール）
public struct Coin<phantom T> has key, store {
    id: UID,
    balance: Balance<T>,
}

// 送金はオブジェクトの所有権移転
public fun transfer<T>(coin: Coin<T>, recipient: address) {
    transfer::public_transfer(coin, recipient);
}
```

AさんがBさんにトークンを送る操作と、CさんがDさんに送る操作は、まったく別のオブジェクトを扱うため互いに干渉しない。これがSuiの並列実行の基盤になっている。

## オブジェクトモデル vs アカウントモデル

ここがSuiとEthereumの最も根本的な違いだ。コード例で詳しく見ていこう。

### Ethereum: すべてはコントラクトのストレージ

EthereumでNFTマーケットプレイスを作る場合、リスティング情報はコントラクト内のmappingに保存される。

```solidity
// Solidity: NFTマーケットプレイス
contract Marketplace {
    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    // tokenId => Listing（全リスティングを1つのmappingで管理）
    mapping(uint256 => Listing) public listings;

    function listItem(address nftContract, uint256 tokenId, uint256 price) external {
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);
        listings[tokenId] = Listing(msg.sender, price, true);
    }

    function buyItem(uint256 tokenId) external payable {
        Listing memory listing = listings[tokenId];
        require(listing.active, "Not listed");
        require(msg.value >= listing.price, "Insufficient payment");

        listings[tokenId].active = false;
        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);
        payable(listing.seller).transfer(msg.value);
    }
}
```

NFTを出品するには、まずNFTをマーケットプレイスコントラクトに**送信（エスクロー）**する必要がある。コントラクトがNFTを預かり、購入時に新しいオーナーに転送する。

### Sui Move: オブジェクトを直接操作

Sui Moveでは、NFTは独立したオブジェクトであり、マーケットプレイスはリスティング自体をオブジェクトとして表現する。

```move
module marketplace::market {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;

    // リスティング自体がオブジェクト
    public struct Listing<phantom T: key + store> has key {
        id: UID,
        seller: address,
        price: u64,
        item: T,  // NFTをリスティング内に格納
    }

    // 出品: NFTをListingオブジェクトにラップ
    public fun list<T: key + store>(
        item: T,
        price: u64,
        ctx: &mut TxContext,
    ) {
        let listing = Listing {
            id: object::new(ctx),
            seller: tx_context::sender(ctx),
            price,
            item,
        };
        transfer::share_object(listing);
    }

    // 購入: Listingを分解してNFTと代金を移転
    public fun buy<T: key + store>(
        listing: Listing<T>,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let Listing { id, seller, price, item } = listing;
        assert!(coin::value(&payment) >= price, 0);

        transfer::public_transfer(item, tx_context::sender(ctx));
        transfer::public_transfer(payment, seller);
        object::delete(id);
    }
}
```

重要な違いがいくつかある：

1. **エスクロー不要**: Moveの所有権システムにより、NFTはListingオブジェクト内に安全に「ラップ」される。コントラクトのアドレスが中間で所有する必要がない
2. **型安全**: `Listing<T>`のジェネリクスにより、どんなNFT型でも型安全にリスティングできる
3. **リソースの線形性**: Moveでは値を暗黙的にコピーしたり捨てたりできない。`listing`を分解（destructure）して中身を取り出すことが強制され、リソースの漏れや重複が構造的に防がれる

### Suiのオブジェクト所有モデル

Suiのオブジェクトには4つの所有形態がある。これはEthereumには存在しない概念だ。

| 所有形態 | 説明 | コンセンサス |
|---------|------|------------|
| Address-owned | 特定アドレスが所有 | 不要（高速） |
| Object-owned | 別のオブジェクトが所有 | 不要（高速） |
| Shared | 誰でもアクセス可能 | 必要 |
| Immutable | 変更不可 | 不要（高速） |

Ethereumでは全ステートが事実上「共有」であるのに対し、Suiではオブジェクトの所有形態によってコンセンサスの要否が変わる。これがパフォーマンスに直結する。

## 並列実行

### Ethereum: シーケンシャル実行

EthereumのEVMは、ブロック内のトランザクションを厳密に順番に実行する。これはグローバルステートの整合性を保証するためだが、スループットの大きなボトルネックになっている。

```
Block N:
  TX1 → TX2 → TX3 → TX4 → TX5  (順番に実行)
```

各トランザクションが前のトランザクションの結果を踏まえて実行されるため、理論上のスループットに上限がある。

### Sui: オブジェクトベースの並列実行

Suiでは、異なるオブジェクトを操作するトランザクションは並列に実行できる。バリデーターはトランザクションの入力オブジェクトを事前に確認し、依存関係がなければ同時に処理する。

```
Epoch内:
  TX1(Object A) ──→ 完了
  TX2(Object B) ──→ 完了      ← 同時実行
  TX3(Object C) ──→ 完了      ← 同時実行
  TX4(Object A) ────────→ 完了 ← TX1の後に実行（同じオブジェクト）
```

この仕組みにより、Suiは水平スケーリングが可能だ。バリデーターのCPUコアが増えれば、それだけ多くのトランザクションを並列処理できる。

実際の数値として、SuiのTestnetでは最大数十万TPSが観測されている。Ethereumのメインネットは約15-30 TPS（L2を除く）であり、桁が違う。

## ガス代とスポンサーシップ

### Ethereumのガスモデル

Ethereumでは、トランザクション手数料は`gasUsed × gasPrice`で計算される。EIP-1559以降、`baseFee + priorityFee`のメカニズムが導入されたが、ネットワーク混雑時にはガス代が急騰する問題は変わっていない。

```solidity
// Solidityではガス代はトランザクション送信者が必ず負担
// meta-transactionパターンで代理支払いは可能だが、コントラクト側の実装が必要
contract GaslessRelay {
    function executeMetaTransaction(
        address user,
        bytes memory functionSignature,
        bytes32 sigR, bytes32 sigS, uint8 sigV
    ) public returns (bytes memory) {
        // 署名を検証し、代理実行する
        // 実装が複雑で、各関数ごとに対応が必要
    }
}
```

### Suiのガスモデルとスポンサーシップ

Suiのガス代はストレージコストと計算コストに基づいて決まり、Ethereumと比較して桁違いに安い。一般的なトランザクションで約0.001〜0.01 SUI程度だ。

さらに重要なのが、**Sponsored Transactions**のネイティブサポートだ。プロトコルレベルでガス代の第三者支払いが組み込まれている。

```typescript
// TypeScript: Suiのスポンサードトランザクション
import { Transaction } from "@mysten/sui/transactions";

// 1. ユーザーがトランザクションを構築
const tx = new Transaction();
tx.moveCall({
  target: `${PACKAGE_ID}::platform::create_post`,
  arguments: [tx.pure.string("Hello Sui!")],
});

// 2. スポンサーがガス代を負担（Enoki等のサービスを利用）
const sponsoredTx = await enokiClient.createSponsoredTransaction({
  network: "testnet",
  transaction: tx,
  sender: userAddress,
});

// 3. ユーザーは署名するだけ（ガス代ゼロ）
const { signature } = await wallet.signTransaction({
  transaction: sponsoredTx.bytes,
});

// 4. 実行
await enokiClient.executeSponsoredTransaction({
  digest: sponsoredTx.digest,
  signature,
});
```

Sui Dev Hubでは、zkLogin（Googleアカウント）ユーザーに対してEnokiのスポンサーシップを活用し、完全にガスレスな体験を実現している。ユーザーはSUIトークンを一切持たずに記事の閲覧・投稿が可能だ。

Ethereumでも Account Abstraction（ERC-4337）で類似の体験は実現できるが、Bundler・Paymaster・EntryPointコントラクトなど追加のインフラが必要で、実装のハードルは高い。

## 開発者体験

### CLI

**Ethereum:**
```bash
# Hardhat（最も一般的）
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network sepolia

# Foundry（高速、Rustベース）
forge build
forge test
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast
```

**Sui:**
```bash
# Sui CLI（公式ツール一本）
sui move build
sui move test
sui client publish --gas-budget 100000000

# テストネットでのオブジェクト確認
sui client objects
sui client object <OBJECT_ID>
```

Suiの開発ツールは一つのCLIに統一されており、Ethereumのように複数のフレームワーク（Hardhat / Foundry / Truffle）を選ぶ必要がない。これはメリットでもデメリットでもある。選択肢が少ない分、迷わないが、成熟度はEthereumエコシステムに及ばない。

### テストフレームワーク

**Solidity（Foundry）:**
```solidity
contract TokenTest is Test {
    MyToken token;

    function setUp() public {
        token = new MyToken();
    }

    function testTransfer() public {
        token.mint(address(this), 1000);
        token.transfer(address(0xBEEF), 500);
        assertEq(token.balanceOf(address(0xBEEF)), 500);
    }

    // Fuzz testing が標準サポート
    function testFuzz_Transfer(uint256 amount) public {
        vm.assume(amount <= 1000);
        token.mint(address(this), 1000);
        token.transfer(address(0xBEEF), amount);
        assertEq(token.balanceOf(address(0xBEEF)), amount);
    }
}
```

**Move:**
```move
#[test_only]
module my_package::token_tests {
    use sui::test_scenario;
    use sui::coin;

    #[test]
    fun test_transfer() {
        let mut scenario = test_scenario::begin(@0xA);

        // トランザクションをシミュレート
        test_scenario::next_tx(&mut scenario, @0xA);
        {
            let coin = coin::mint_for_testing<SUI>(1000, test_scenario::ctx(&mut scenario));
            transfer::public_transfer(coin, @0xB);
        };

        // 受取側でオブジェクトを確認
        test_scenario::next_tx(&mut scenario, @0xB);
        {
            let coin = test_scenario::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&coin) == 1000, 0);
            test_scenario::return_to_sender(&scenario, coin);
        };

        test_scenario::end(scenario);
    }
}
```

Moveのテストは`test_scenario`モジュールにより、マルチユーザーのトランザクションフローを直接シミュレートできる。Solidityのテストが単一のコントラクトコールに焦点を当てるのに対し、Moveのテストはオブジェクトの所有権移転まで含めた統合テストが自然に書ける。

### SDK・ライブラリ

| 項目 | Ethereum | Sui |
|------|----------|-----|
| メインSDK | ethers.js / viem | @mysten/sui |
| ウォレット接続 | wagmi / RainbowKit | @mysten/dapp-kit |
| 認証 | WalletConnect / Web3Auth | zkLogin (ネイティブ) |
| ブロックエクスプローラ | Etherscan | SuiScan / SuiVision |
| インデクサー | The Graph / Alchemy | Sui Indexer (公式) |

EthereumのエコシステムはSuiと比較して圧倒的に成熟しており、ライブラリ・ツール・ドキュメントの量が多い。一方で、Suiは公式チームが統一的にツールを提供しているため、バージョン間の互換性問題が少ない傾向がある。

### 安全性へのアプローチ

Ethereumでは、Solidityの柔軟さゆえにリエントランシー攻撃、整数オーバーフロー、delegatecallの悪用など、多くのセキュリティパターンを開発者が意識する必要がある。OpenZeppelinのようなライブラリが事実上の標準となっている。

Moveでは、言語レベルで多くの脆弱性クラスが排除されている：

- **リエントランシー**: Moveには動的ディスパッチがないため、リエントランシー攻撃が構造的に不可能
- **整数オーバーフロー**: Moveのランタイムが自動でチェック（abort on overflow）
- **リソースの二重使用**: 線形型システムにより、トークンのコピーや消失がコンパイル時に検出される

これはSuiの大きなアドバンテージだ。「安全なコントラクトを書く」ための知識量が、Solidityと比較してはるかに少なくて済む。

## まとめ

Sui と Ethereum は、異なる設計思想に基づく異なるトレードオフを選択している。

| 観点 | Ethereum | Sui |
|------|----------|-----|
| 成熟度 | 非常に高い（2015年〜） | 発展途上（2023年〜） |
| エコシステム | 巨大（DeFi, NFT, L2） | 成長中 |
| ファイナリティ | 約12.8分 | 約400ms〜3秒 |
| スループット | 15-30 TPS (L1) | 数十万 TPS |
| ガス代 | 変動大（混雑時高騰） | 安定・低コスト |
| 安全性モデル | 開発者の知識に依存 | 言語レベルで保証 |
| 学習コスト | 低い（資料が豊富） | やや高い（新しいパラダイム） |
| スポンサーシップ | ERC-4337で可能 | ネイティブサポート |

### Suiを選ぶべきケース

- **高スループットが必要**: ゲーム、ソーシャル、リアルタイムアプリケーション
- **ガスレス体験が重要**: コンシューマー向けdApp、Web2ユーザーの取り込み
- **複雑なデジタルアセット**: NFTの入れ子構造、コンポーザブルなオブジェクト
- **安全性を最優先**: 金融アプリケーションで言語レベルの保証が欲しい

### Ethereumを選ぶべきケース

- **DeFi・既存プロトコルとの連携**: Uniswap, Aave等との相互運用
- **最大のユーザーベース**: 流動性とユーザー数が最も多い
- **L2エコシステムの活用**: Optimism, Arbitrum, Base等のスケーリングソリューション
- **豊富な開発リソース**: チュートリアル、監査会社、開発者コミュニティ

最終的に、技術選定は「何を作るか」で決まる。DeFiプロトコルをフォークして流動性を集めたいならEthereum一択だろう。一方、Web2ユーザーにシームレスなオンチェーン体験を提供したいなら、Suiの設計思想がフィットする。

Ethereum開発者がSuiに移行する際の最大のハードルは、アカウントモデルからオブジェクトモデルへの思考の切り替えだ。しかし、一度このパラダイムシフトを越えれば、Moveの型安全性と所有権モデルの恩恵を実感できるはずだ。

両方のチェーンを理解し、プロジェクトの要件に応じて使い分けられるエンジニアが、これからのWeb3で最も価値を持つだろう。
