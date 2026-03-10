import fs from 'fs';
import path from 'path';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const PACKAGE_ID = "0x0ff874ccde9a069bd6506d71eefb44d420215ce39ae168fa8dbe2364a8a60b1a";
const REWARD_POOL_ID = "0x6d491f156024ce769f9b1ff878daa6ab84e4795b67132eeb75f701953d02fc42";

async function main() {
    const keystorePath = path.join(process.env.USERPROFILE || '', '.sui', 'sui_config', 'sui.keystore');
    const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
    let keypair;

    for (const keyBase64 of keystore) {
        try {
            const raw = Buffer.from(keyBase64, 'base64');
            if (raw[0] === 0) {
                keypair = Ed25519Keypair.fromSecretKey(raw.slice(1));
                break;
            }
        } catch (e) {
            continue;
        }
    }

    if (!keypair) throw new Error("No Ed25519 key found in keystore");
    console.log("Using active address:", keypair.toSuiAddress());

    const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" });

    console.log("Funding RewardPool with 3 SUI...");
    const tx = new Transaction();
    const amountToFund = 3_000_000_000; // 3 SUI

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountToFund)]);

    tx.moveCall({
        target: `${PACKAGE_ID}::platform::fund_reward_pool`,
        arguments: [
            tx.object(REWARD_POOL_ID),
            coin,
        ],
    });

    const res = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true }
    });

    console.log(`-> Tx Digest: ${res.digest}`);
    if (res.effects?.status.status === 'success') {
        console.log("✅ Successfully funded the RewardPool!");
    } else {
        console.error("❌ Failed to fund:", res.effects?.status.error);
    }
}

main().catch(console.error);
