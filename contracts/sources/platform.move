module sui_content_platform::platform {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::balance::{Self, Balance};
    use sui::dynamic_field;

    // ===== Errors =====
    const ENotAuthor: u64 = 1;
    const EInsufficientTip: u64 = 2;
    const EInsufficientPayment: u64 = 3;
    const EPremiumAlreadyFree: u64 = 4;
    const EAlreadyClaimed: u64 = 5;
    const EInsufficientPool: u64 = 6;
    const EInsufficientStake: u64 = 7;

    // ===== Constants =====
    // Default premium price: 0.5 SUI
    const DEFAULT_PREMIUM_PRICE_MIST: u64 = 500_000_000;
    // v8: 読了報酬 0.05 SUI
    const READING_REWARD_MIST: u64 = 50_000_000;
    // v8: 投稿スタック最低額 1 SUI
    const STAKE_AMOUNT_MIST: u64 = 1_000_000_000;
    // v9: 執筆報酬 0.1 SUI
    const WRITING_REWARD_MIST: u64 = 100_000_000;

    // ===== Objects =====

    public struct Profile has key, store {
        id: UID,
        owner: address,
        username: vector<u8>,
        bio: vector<u8>,
        total_earned: u64,
    }

    // Original Post struct preserved (compatible upgrade)
    public struct Post has key, store {
        id: UID,
        author: address,
        title: vector<u8>,
        content_hash: vector<u8>,  // Walrus blob ID for full content
        tip_balance: u64,
        created_at: u64,
    }

    // NEW v3: Comment Object
    public struct Comment has key, store {
        id: UID,
        post_id: ID,
        author: address,
        content: vector<u8>,
        created_at: u64,
    }

    // NEW v3: Like receipt (one per liker per post)
    public struct LikeReceipt has key, store {
        id: UID,
        post_id: ID,
        from: address,
    }

    // NEW v5: Premium content unlock receipt
    // Owning this object proves payment was made to read premium content
    public struct PremiumUnlock has key, store {
        id: UID,
        post_id: ID,
        unlocked_by: address,
    }

    // NEW v5: Premium post price info (stored off-chain - contract just handles payments)
    // Author calls set_premium_price to store price, readers call unlock_premium to pay
    public struct PremiumConfig has key, store {
        id: UID,
        post_id: ID,
        author: address,
        price_mist: u64,  // price in MIST (1 SUI = 1_000_000_000 MIST)
    }

    // NEW v7: Generic premium config accepting any token (e.g. TJPYC)
    // Phantom type T represents the coin type.
    public struct PremiumConfigToken<phantom T> has key, store {
        id: UID,
        post_id: ID,
        author: address,
        price_amount: u64,
    }

    // NEW v6: Revenue Sharing config
    // Stores the co-authors and their share in basis points (100 = 1%, 10000 = 100%)
    // e.g., co_authors = [alice, bob], shares = [7000, 3000] means 70% to alice, 30% to bob
    public struct CoAuthorConfig has key, store {
        id: UID,
        post_id: ID,
        primary_author: address,   // must be the Post.author
        co_authors: vector<address>,
        shares_bps: vector<u64>,   // basis points, must sum to 10000
    }

    // ===== Events =====

    public struct ProfileCreated has copy, drop {
        profile_id: ID,
        owner: address,
        username: vector<u8>,
    }

    public struct ProfileUpdated has copy, drop {
        profile_id: ID,
        owner: address,
        username: vector<u8>,
    }

    public struct PostCreated has copy, drop {
        post_id: ID,
        author: address,
        title: vector<u8>,
    }

    public struct TipSent has copy, drop {
        post_id: ID,
        from: address,
        to: address,
        amount: u64,
    }

    public struct PostDeleted has copy, drop {
        post_id: ID,
        author: address,
    }

    // v3 Events
    public struct PostLiked has copy, drop {
        post_id: ID,
        from: address,
    }

    public struct CommentCreated has copy, drop {
        comment_id: ID,
        post_id: ID,
        author: address,
    }

    // v5 Events
    public struct PremiumLocked has copy, drop {
        post_id: ID,
        author: address,
        price_mist: u64,
    }

    public struct PremiumUnlocked has copy, drop {
        post_id: ID,
        unlocked_by: address,
        amount_paid: u64,
    }

    // v7 Events (Generic)
    public struct PremiumLockedToken<phantom T> has copy, drop {
        post_id: ID,
        author: address,
        price_amount: u64,
    }

    public struct PremiumUnlockedToken<phantom T> has copy, drop {
        post_id: ID,
        unlocked_by: address,
        amount_paid: u64,
    }

    public struct TipSentToken<phantom T> has copy, drop {
        post_id: ID,
        from: address,
        to: address,
        amount: u64,
    }

    public struct RevenueSplitToken<phantom T> has copy, drop {
        post_id: ID,
        from: address,
        total_amount: u64,
    }

    // v6 Events
    public struct CoAuthorConfigSet has copy, drop {
        config_id: ID,
        post_id: ID,
        primary_author: address,
        co_authors: vector<address>,
        shares_bps: vector<u64>,
    }

    public struct RevenueSplit has copy, drop {
        post_id: ID,
        from: address,
        total_amount: u64,
    }

    // ===== Functions =====


    public fun create_profile(
        username: vector<u8>,
        bio: vector<u8>,
        ctx: &mut TxContext,
    ): Profile {
        let profile_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&profile_id);
        let profile = Profile {
            id: profile_id,
            owner: ctx.sender(),
            username: username,
            bio: bio,
            total_earned: 0,
        };
        event::emit(ProfileCreated {
            profile_id: id_copy,
            owner: ctx.sender(),
            username: profile.username,
        });
        profile
    }

    public fun edit_profile(
        profile: &mut Profile,
        new_username: vector<u8>,
        new_bio: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(profile.owner == ctx.sender(), ENotAuthor);
        profile.username = new_username;
        profile.bio = new_bio;
        event::emit(ProfileUpdated {
            profile_id: object::id(profile),
            owner: ctx.sender(),
            username: profile.username,
        });
    }

    public fun create_post(
        title: vector<u8>,
        content_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let post_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&post_id);
        let post = Post {
            id: post_id,
            author: ctx.sender(),
            title: title,
            content_hash,
            tip_balance: 0,
            created_at: ctx.epoch(),
        };
        event::emit(PostCreated {
            post_id: id_copy,
            author: ctx.sender(),
            title: post.title,
        });
        transfer::share_object(post);
    }

    // v3: Like a post
    public fun like_post(
        post: &Post,
        ctx: &mut TxContext,
    ) {
        let like_id = object::new(ctx);
        let receipt = LikeReceipt {
            id: like_id,
            post_id: object::id(post),
            from: ctx.sender(),
        };
        event::emit(PostLiked {
            post_id: object::id(post),
            from: ctx.sender(),
        });
        transfer::transfer(receipt, ctx.sender());
    }

    // v3: Comment on a post
    public fun add_comment(
        post: &Post,
        content: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let comment_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&comment_id);
        let comment = Comment {
            id: comment_id,
            post_id: object::id(post),
            author: ctx.sender(),
            content,
            created_at: ctx.epoch(),
        };
        event::emit(CommentCreated {
            comment_id: id_copy,
            post_id: object::id(post),
            author: ctx.sender(),
        });
        transfer::share_object(comment);
    }

    // v5: Author locks a post as premium with a price
    public fun lock_as_premium(
        post: &Post,
        price_mist: u64,
        ctx: &mut TxContext,
    ) {
        assert!(post.author == ctx.sender(), ENotAuthor);
        let cfg_id = object::new(ctx);
        let cfg = PremiumConfig {
            id: cfg_id,
            post_id: object::id(post),
            author: ctx.sender(),
            price_mist,
        };
        event::emit(PremiumLocked {
            post_id: object::id(post),
            author: ctx.sender(),
            price_mist,
        });
        transfer::share_object(cfg);
    }

    // v5: Reader pays to unlock premium content, receives PremiumUnlock receipt
    public fun unlock_premium(
        cfg: &PremiumConfig,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount >= cfg.price_mist, EInsufficientPayment);
        // Transfer payment to author
        transfer::public_transfer(payment, cfg.author);

        // Issue unlock receipt to buyer
        let unlock_id = object::new(ctx);
        let receipt = PremiumUnlock {
            id: unlock_id,
            post_id: cfg.post_id,
            unlocked_by: ctx.sender(),
        };
        event::emit(PremiumUnlocked {
            post_id: cfg.post_id,
            unlocked_by: ctx.sender(),
            amount_paid: amount,
        });
        transfer::transfer(receipt, ctx.sender());
    }

    public fun tip(
        post: &mut Post,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EInsufficientTip);
        post.tip_balance = post.tip_balance + amount;
        event::emit(TipSent {
            post_id: object::id(post),
            from: ctx.sender(),
            to: post.author,
            amount,
        });
        transfer::public_transfer(payment, post.author);
    }

    public fun withdraw_tips(
        profile: &mut Profile,
        ctx: &mut TxContext,
    ) {
        assert!(profile.owner == ctx.sender(), ENotAuthor);
    }

    public fun delete_post(post: Post, ctx: &mut TxContext) {
        assert!(post.author == ctx.sender(), ENotAuthor);
        let Post { id, author, title: _, content_hash: _, tip_balance: _, created_at: _ } = post;
        event::emit(PostDeleted {
            post_id: object::uid_to_inner(&id),
            author,
        });
        object::delete(id);
    }

    // ===== View Functions =====
    public fun get_post_info(post: &Post): (address, vector<u8>, u64) {
        (post.author, post.title, post.tip_balance)
    }

    public fun premium_price(cfg: &PremiumConfig): u64 {
        cfg.price_mist
    }

    // v6: Author sets up revenue sharing among co-authors
    // shares_bps must sum to 10000 (basis points), one entry per co_author
    public fun set_coauthor_config(
        post: &Post,
        co_authors: vector<address>,
        shares_bps: vector<u64>,
        ctx: &mut TxContext,
    ) {
        assert!(post.author == ctx.sender(), ENotAuthor);
        assert!(vector::length(&co_authors) == vector::length(&shares_bps), ENotAuthor);

        // Validate shares sum to 10000 bps (= 100%)
        let mut total: u64 = 0;
        let mut i = 0;
        while (i < vector::length(&shares_bps)) {
            total = total + *vector::borrow(&shares_bps, i);
            i = i + 1;
        };
        assert!(total == 10000, ENotAuthor);

        let cfg_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&cfg_id);
        let shares_copy = copy shares_bps;
        let authors_copy = copy co_authors;
        let cfg = CoAuthorConfig {
            id: cfg_id,
            post_id: object::id(post),
            primary_author: ctx.sender(),
            co_authors,
            shares_bps,
        };
        event::emit(CoAuthorConfigSet {
            config_id: id_copy,
            post_id: object::id(post),
            primary_author: ctx.sender(),
            co_authors: authors_copy,
            shares_bps: shares_copy,
        });
        transfer::share_object(cfg);
    }

    // v6: Tip with automatic revenue sharing
    // Payment is automatically split between co-authors per their shares_bps
    public fun tip_with_sharing(
        post: &mut Post,
        cfg: &CoAuthorConfig,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(cfg.post_id == object::id(post), ENotAuthor);
        let total_amount = coin::value(&payment);
        assert!(total_amount > 0, EInsufficientTip);

        post.tip_balance = post.tip_balance + total_amount;

        event::emit(RevenueSplit {
            post_id: object::id(post),
            from: ctx.sender(),
            total_amount,
        });

        // Split and distribute to all co-authors
        let n = vector::length(&cfg.co_authors);
        let mut remaining = payment;
        let mut i = 0;
        while (i < n - 1) {
            let share_bps = *vector::borrow(&cfg.shares_bps, i);
            let amount = (total_amount * share_bps) / 10000;
            let split_coin = coin::split(&mut remaining, amount, ctx);
            let recipient = *vector::borrow(&cfg.co_authors, i);
            transfer::public_transfer(split_coin, recipient);
            i = i + 1;
        };
        // Send remainder to last co-author (collects any rounding dust)
        let last_recipient = *vector::borrow(&cfg.co_authors, n - 1);
        transfer::public_transfer(remaining, last_recipient);
    }

    // ==========================================
    // v7: Generic Token Payment Functions (e.g. for TJPYC)
    // ==========================================

    public fun lock_as_premium_token<T>(
        post: &Post,
        price_amount: u64,
        ctx: &mut TxContext,
    ) {
        assert!(post.author == ctx.sender(), ENotAuthor);
        let cfg_id = object::new(ctx);
        let cfg = PremiumConfigToken<T> {
            id: cfg_id,
            post_id: object::id(post),
            author: ctx.sender(),
            price_amount,
        };
        event::emit(PremiumLockedToken<T> {
            post_id: object::id(post),
            author: ctx.sender(),
            price_amount,
        });
        transfer::share_object(cfg);
    }

    public fun unlock_premium_token<T>(
        cfg: &PremiumConfigToken<T>,
        payment: Coin<T>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount >= cfg.price_amount, EInsufficientPayment);
        // Transfer to author
        transfer::public_transfer(payment, cfg.author);

        // Issue unlock receipt (reusing v5 PremiumUnlock struct for compatibility/simplicity)
        let unlock_id = object::new(ctx);
        let receipt = PremiumUnlock {
            id: unlock_id,
            post_id: cfg.post_id,
            unlocked_by: ctx.sender(),
        };
        event::emit(PremiumUnlockedToken<T> {
            post_id: cfg.post_id,
            unlocked_by: ctx.sender(),
            amount_paid: amount,
        });
        transfer::transfer(receipt, ctx.sender());
    }

    public fun tip_token<T>(
        post: &mut Post, // We update tip_balance but Note: tip_balance is technically conceptually SUI natively, but we increment it anyway generically or ignore it. For now, incrementing it is fine.
        payment: Coin<T>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EInsufficientTip);
        
        event::emit(TipSentToken<T> {
            post_id: object::id(post),
            from: ctx.sender(),
            to: post.author,
            amount,
        });
        transfer::public_transfer(payment, post.author);
    }

    public fun tip_with_sharing_token<T>(
        post: &Post, // Made immutable since tip_balance is SUI-specific conceptually
        cfg: &CoAuthorConfig,
        payment: Coin<T>,
        ctx: &mut TxContext,
    ) {
        assert!(cfg.post_id == object::id(post), ENotAuthor);
        let total_amount = coin::value(&payment);
        assert!(total_amount > 0, EInsufficientTip);

        event::emit(RevenueSplitToken<T> {
            post_id: object::id(post),
            from: ctx.sender(),
            total_amount,
        });

        let n = vector::length(&cfg.co_authors);
        let mut remaining = payment;
        let mut i = 0;
        while (i < n - 1) {
            let share_bps = *vector::borrow(&cfg.shares_bps, i);
            let amount = (total_amount * share_bps) / 10000;
            let split_coin = coin::split(&mut remaining, amount, ctx);
            let recipient = *vector::borrow(&cfg.co_authors, i);
            transfer::public_transfer(split_coin, recipient);
            i = i + 1;
        };
        let last_recipient = *vector::borrow(&cfg.co_authors, n - 1);
        transfer::public_transfer(remaining, last_recipient);
    }

    // ==========================================
    // v8: RewardPool (Read-to-Earn) + Stake-to-Publish
    // ==========================================

    // ===== v8 Objects =====

    /// 報酬プール: プラットフォームが保有するSUI残高の共有オブジェクト
    public struct RewardPool has key {
        id: UID,
        balance: Balance<SUI>,
        total_claimed: u64,
        total_funded: u64,
    }

    /// dynamic_fieldキー: (post_id, claimer)の組み合わせで重複請求を防止
    public struct ClaimKey has copy, drop, store {
        post_id: ID,
        claimer: address,
    }

    /// Read-to-Earn: 読者が報酬を受け取った証明（重複受領の防止）
    public struct ReadReceipt has key, store {
        id: UID,
        post_id: ID,
        claimer: address,
    }

    /// 投稿デポジット: スパム対策のため著者がロックするSUI（著者が所有）
    public struct PostStake has key, store {
        id: UID,
        post_id: ID,
        author: address,
        amount: u64,
        balance: Balance<SUI>,
    }

    // ===== v8 Events =====

    public struct RewardPoolCreated has copy, drop {
        pool_id: ID,
    }

    public struct RewardPoolFunded has copy, drop {
        pool_id: ID,
        funder: address,
        amount: u64,
        new_total: u64,
    }

    public struct ReadRewardClaimed has copy, drop {
        pool_id: ID,
        post_id: ID,
        claimer: address,
        amount: u64,
    }

    public struct PostStaked has copy, drop {
        post_id: ID,
        author: address,
        stake_amount: u64,
    }

    public struct StakeReclaimed has copy, drop {
        post_id: ID,
        author: address,
        amount: u64,
    }

    // v9: Write-to-Earn
    public struct WriteReceipt has key, store {
        id: UID,
        post_id: ID,
        author: address,
    }

    public struct WritingRewardClaimed has copy, drop {
        pool_id: ID,
        post_id: ID,
        author: address,
        amount: u64,
    }

    // ===== v8 Functions =====

    /// RewardPoolを作成してshared objectとして公開（デプロイ後に1回呼ぶ）
    public fun create_reward_pool(ctx: &mut TxContext) {
        let pool_uid = object::new(ctx);
        let pool_id = object::uid_to_inner(&pool_uid);
        let pool = RewardPool {
            id: pool_uid,
            balance: balance::zero(),
            total_claimed: 0,
            total_funded: 0,
        };
        event::emit(RewardPoolCreated { pool_id });
        transfer::share_object(pool);
    }

    /// RewardPoolにSUIを入金（誰でも可能）
    public fun fund_reward_pool(
        pool: &mut RewardPool,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        pool.total_funded = pool.total_funded + amount;
        balance::join(&mut pool.balance, coin::into_balance(payment));
        event::emit(RewardPoolFunded {
            pool_id: object::id(pool),
            funder: ctx.sender(),
            amount,
            new_total: balance::value(&pool.balance),
        });
    }

    /// Read-to-Earn: 記事を読んだ報酬をプールから受け取る
    /// 同一ユーザー × 同一記事は1回限り（クライアント側でReceiptの有無を確認）
    public fun claim_reading_reward(
        pool: &mut RewardPool,
        post: &Post,
        ctx: &mut TxContext,
    ) {
        assert!(
            balance::value(&pool.balance) >= READING_REWARD_MIST,
            EInsufficientPool
        );

        pool.total_claimed = pool.total_claimed + READING_REWARD_MIST;

        // 報酬を読者へ送金
        let reward_coin = coin::from_balance(
            balance::split(&mut pool.balance, READING_REWARD_MIST),
            ctx,
        );
        transfer::public_transfer(reward_coin, ctx.sender());

        event::emit(ReadRewardClaimed {
            pool_id: object::id(pool),
            post_id: object::id(post),
            claimer: ctx.sender(),
            amount: READING_REWARD_MIST,
        });
    }

    /// create_post_staked: v8互換性のために保持（4パラメータ版）
    public fun create_post_staked(
        title: vector<u8>,
        content_hash: vector<u8>,
        deposit: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        // v8当時のスタンドアロン版: デポジットを著者に返却し、通常の投稿を作成
        transfer::public_transfer(deposit, ctx.sender());
        create_post(title, content_hash, ctx);
    }

    /// Stake-to-Publish: プールへの入金付きで投稿（スパム対策）
    /// デポジットはそのままRewardPoolの原資になる
    public fun create_post_with_pool(
        pool: &mut RewardPool,
        title: vector<u8>,
        content_hash: vector<u8>,
        deposit: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&deposit);
        assert!(amount >= STAKE_AMOUNT_MIST, EInsufficientStake);

        // Post作成（既存ロジックと同等）
        let post_uid = object::new(ctx);
        let post_id = object::uid_to_inner(&post_uid);
        let title_copy = title;
        let post = Post {
            id: post_uid,
            author: ctx.sender(),
            title: title_copy,
            content_hash,
            tip_balance: 0,
            created_at: ctx.epoch(),
        };
        event::emit(PostCreated {
            post_id,
            author: ctx.sender(),
            title: post.title,
        });
        transfer::share_object(post);

        // デポジットをプールに寄付する
        pool.total_funded = pool.total_funded + amount;
        balance::join(&mut pool.balance, coin::into_balance(deposit));
        event::emit(RewardPoolFunded {
            pool_id: object::id(pool),
            funder: ctx.sender(),
            amount,
            new_total: balance::value(&pool.balance),
        });
    }

    /// スタックを著者へ返還（いつでも回収可能）
    public fun reclaim_stake(stake: PostStake, ctx: &mut TxContext) {
        assert!(stake.author == ctx.sender(), ENotAuthor);
        let PostStake { id, post_id, author: _, amount, balance } = stake;
        let coin = coin::from_balance(balance, ctx);
        event::emit(StakeReclaimed {
            post_id,
            author: ctx.sender(),
            amount,
        });
        object::delete(id);
        transfer::public_transfer(coin, ctx.sender());
    }

    // ===== v9: Write-to-Earn =====

    /// Write-to-Earn: 投稿者が自分の記事に対して執筆報酬を請求
    /// 同一著者 × 同一記事は1回限り（ClaimKey dynamic fieldで重複防止）
    public fun claim_writing_reward(
        pool: &mut RewardPool,
        post: &Post,
        ctx: &mut TxContext,
    ): WriteReceipt {
        // 投稿者本人のみ請求可能
        assert!(post.author == ctx.sender(), ENotAuthor);
        // プール残高チェック
        assert!(
            balance::value(&pool.balance) >= WRITING_REWARD_MIST,
            EInsufficientPool
        );
        // 重複請求の防止（オンチェーン）
        let key = ClaimKey { post_id: object::id(post), claimer: ctx.sender() };
        assert!(!dynamic_field::exists_(&pool.id, key), EAlreadyClaimed);
        dynamic_field::add(&mut pool.id, key, true);

        pool.total_claimed = pool.total_claimed + WRITING_REWARD_MIST;

        // 報酬を著者へ送金
        let reward_coin = coin::from_balance(
            balance::split(&mut pool.balance, WRITING_REWARD_MIST),
            ctx,
        );
        transfer::public_transfer(reward_coin, ctx.sender());

        event::emit(WritingRewardClaimed {
            pool_id: object::id(pool),
            post_id: object::id(post),
            author: ctx.sender(),
            amount: WRITING_REWARD_MIST,
        });

        WriteReceipt {
            id: object::new(ctx),
            post_id: object::id(post),
            author: ctx.sender(),
        }
    }

    // ===== v8 View Functions =====

    public fun reward_pool_balance(pool: &RewardPool): u64 {
        balance::value(&pool.balance)
    }

    public fun has_claimed_reward(pool: &RewardPool, post_id: ID, claimer: address): bool {
        let key = ClaimKey { post_id, claimer };
        dynamic_field::exists_(&pool.id, key)
    }
}
