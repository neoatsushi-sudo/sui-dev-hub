import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
  getZkLoginSignature,
  genAddressSeed,
} from "@mysten/sui/zklogin";
import { Transaction } from "@mysten/sui/transactions";

const PROVER_URL = "https://prover.mystenlabs.com/v1";

export interface ZkLoginSession {
  address: string;
  maxEpoch: number;
  ephemeralPrivKey: string;
  zkProof: ZkProofInputs;
  userSalt: string;
  sub: string;
  aud: string;
}

interface ZkProofInputs {
  proofPoints: unknown;
  issBase64Details: unknown;
  headerBase64: string;
}

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export async function initiateGoogleLogin(
  clientId: string,
  suiClient: { getLatestSuiSystemState: () => Promise<{ epoch: string | number }>, executeTransactionBlock: (...args: any[]) => Promise<any> }
) {
  const keypair = new Ed25519Keypair();
  const randomness = generateRandomness();
  const { epoch } = await suiClient.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 2;
  const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);

  const rawKey = keypair.getSecretKey();
  const privKey = typeof rawKey === "string" ? rawKey : toB64(rawKey as Uint8Array);
  sessionStorage.setItem("zk_privkey", privKey);
  sessionStorage.setItem("zk_randomness", randomness);
  sessionStorage.setItem("zk_max_epoch", String(maxEpoch));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth`,
    response_type: "id_token",
    scope: "openid",
    nonce,
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function processOAuthCallback(jwt: string): Promise<ZkLoginSession> {
  const privKeyRaw = sessionStorage.getItem("zk_privkey") || "";
  const randomness = sessionStorage.getItem("zk_randomness") || "";
  const maxEpoch = Number(sessionStorage.getItem("zk_max_epoch") || "0");

  let keypair: Ed25519Keypair;
  try {
    keypair = Ed25519Keypair.fromSecretKey(privKeyRaw);
  } catch {
    keypair = Ed25519Keypair.fromSecretKey(fromB64(privKeyRaw));
  }

  // Decode JWT payload
  const payload = JSON.parse(atob(jwt.split(".")[1]));
  const sub = payload.sub as string;
  const aud = (Array.isArray(payload.aud) ? payload.aud[0] : payload.aud) as string;

  // Get or generate deterministic salt
  let userSalt = localStorage.getItem(`zk_salt_${sub}`);
  if (!userSalt) {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    userSalt = String(
      BigInt("0x" + Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join("")) % BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617")
    );
    localStorage.setItem(`zk_salt_${sub}`, userSalt);
  }

  const address = jwtToAddress(jwt, userSalt, false);
  const extEphKey = getExtendedEphemeralPublicKey(keypair.getPublicKey());

  const proverRes = await fetch(PROVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jwt,
      extendedEphemeralPublicKey: extEphKey,
      maxEpoch,
      jwtRandomness: randomness,
      salt: userSalt,
      keyClaimName: "sub",
    }),
  });

  if (!proverRes.ok) {
    const err = await proverRes.text();
    throw new Error(`ZK proof failed: ${err}`);
  }

  const zkProof = await proverRes.json() as ZkProofInputs;

  const session: ZkLoginSession = {
    address,
    maxEpoch,
    ephemeralPrivKey: privKeyRaw,
    zkProof,
    userSalt,
    sub,
    aud,
  };

  localStorage.setItem("zk_session", JSON.stringify(session));
  return session;
}

export function loadZkLoginSession(): ZkLoginSession | null {
  try {
    const raw = localStorage.getItem("zk_session");
    if (!raw) return null;
    return JSON.parse(raw) as ZkLoginSession;
  } catch {
    return null;
  }
}

export function clearZkLoginSession() {
  localStorage.removeItem("zk_session");
  sessionStorage.removeItem("zk_privkey");
  sessionStorage.removeItem("zk_randomness");
  sessionStorage.removeItem("zk_max_epoch");
}

export async function zkLoginSponsoredSignAndExecute(
  session: ZkLoginSession,
  tx: Transaction,
  suiClient: { executeTransactionBlock: (...args: any[]) => Promise<any> }
) {
  // Build just the transaction kind (no gas needed)
  const txKindBytes = await tx.build({ onlyTransactionKind: true });
  const txKindB64 = Buffer.from(txKindBytes).toString("base64");

  // Request sponsor to pay gas
  const sponsorRes = await fetch("/api/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txKindBytes: txKindB64, sender: session.address }),
  });

  if (!sponsorRes.ok) {
    const err = await sponsorRes.text();
    throw new Error(`Sponsor failed: ${err}`);
  }

  const { txBytes, sponsorSignature } = await sponsorRes.json();
  const fullTxBytes = new Uint8Array(Buffer.from(txBytes, "base64"));

  // Sign with zkLogin ephemeral key
  let keypair: Ed25519Keypair;
  try {
    keypair = Ed25519Keypair.fromSecretKey(session.ephemeralPrivKey);
  } catch {
    keypair = Ed25519Keypair.fromSecretKey(fromB64(session.ephemeralPrivKey));
  }

  const { signature: userSignature } = await keypair.signTransaction(fullTxBytes);

  const addressSeed = genAddressSeed(
    BigInt(session.userSalt),
    "sub",
    session.sub,
    session.aud
  ).toString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zkLoginSignature = getZkLoginSignature({
    inputs: { ...session.zkProof, addressSeed } as any,
    maxEpoch: session.maxEpoch,
    userSignature,
  });

  return suiClient.executeTransactionBlock({
    transactionBlock: fullTxBytes,
    signature: [zkLoginSignature, sponsorSignature],
    options: { showEffects: true },
  });
}

export async function zkLoginSignAndExecute(
  session: ZkLoginSession,
  tx: Transaction,
  suiClient: { getLatestSuiSystemState: () => Promise<{ epoch: string | number }>, executeTransactionBlock: (...args: any[]) => Promise<any> }
) {
  let keypair: Ed25519Keypair;
  try {
    keypair = Ed25519Keypair.fromSecretKey(session.ephemeralPrivKey);
  } catch {
    keypair = Ed25519Keypair.fromSecretKey(fromB64(session.ephemeralPrivKey));
  }

  tx.setSender(session.address);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txBytes = await tx.build({ client: suiClient as any });
  const { signature: userSignature } = await keypair.signTransaction(txBytes);

  const addressSeed = genAddressSeed(
    BigInt(session.userSalt),
    "sub",
    session.sub,
    session.aud
  ).toString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zkLoginSignature = getZkLoginSignature({
    inputs: { ...session.zkProof, addressSeed } as any,
    maxEpoch: session.maxEpoch,
    userSignature,
  });

  return suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: zkLoginSignature,
    options: { showEffects: true },
  });
}
