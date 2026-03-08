"use client";

import { useSuiClient } from "@mysten/dapp-kit";
import { PACKAGE_ID } from "./sui";

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

export async function fetchUserProfile(
  client: ReturnType<typeof useSuiClient>,
  address: string
): Promise<ProfileData | null> {
  if (!address) return null;
  
  try {
    const { data } = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: `${PACKAGE_ID}::platform::Profile` },
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
