// Utility hook for resolving an author's display name.
// Priority order: SuiNS (.sui domain) > Custom Profile Username > Short Address
"use client";

import { useState, useEffect } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { ORIGINAL_PACKAGE_ID } from "./sui";

export type ProfileData = {
  id: string;
  owner: string;
  username: string;
  bio: string;
  total_earned: number;
};

function decodeBytes(bytes: number[]): string {
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return "";
  }
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function fetchUserProfile(
  client: ReturnType<typeof useSuiClient>,
  address: string
): Promise<ProfileData | null> {
  if (!address) return null;
  
  try {
    const { data } = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: `${ORIGINAL_PACKAGE_ID}::platform::Profile` },
      options: { showContent: true },
    });

    if (data && data.length > 0 && data[0].data?.content) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fields = (data[0].data.content as any).fields;
      return {
        id: data[0].data.objectId,
        owner: fields.owner,
        username: decodeBytes(fields.username),
        bio: decodeBytes(fields.bio),
        total_earned: Number(fields.total_earned),
      };
    }
  } catch (error) {
    console.error("Failed to fetch profile:", error);
  }
  return null;
}

// Resolve SuiNS name from address using the Sui client's resolveNameServiceNames API
async function resolveSuiNSName(
  client: ReturnType<typeof useSuiClient>,
  address: string
): Promise<string | null> {
  if (!address) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).resolveNameServiceNames({
      address,
      limit: 1,
    });
    if (result?.data?.length > 0) {
      return result.data[0]; // e.g. "alice.sui"
    }
  } catch {
    // SuiNS resolution failed silently
  }
  return null;
}

/**
 * useAuthorName - composite hook for resolving display name.
 * Priority: SuiNS (.sui domain) > Custom Profile Username > Short Address
 */
export function useAuthorName(address: string): {
  displayName: string;
  suiNsName: string | null;
  profile: ProfileData | null;
  loading: boolean;
} {
  const suiClient = useSuiClient();
  const [suiNsName, setSuiNsName] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      resolveSuiNSName(suiClient, address),
      fetchUserProfile(suiClient, address),
    ]).then(([ns, prof]) => {
      setSuiNsName(ns);
      setProfile(prof);
      setLoading(false);
    });
  }, [suiClient, address]);

  let displayName: string;
  if (suiNsName) {
    displayName = suiNsName; // "alice.sui"
  } else if (profile?.username) {
    displayName = `@${profile.username}`;
  } else {
    displayName = shortAddress(address);
  }

  return { displayName, suiNsName, profile, loading };
}
