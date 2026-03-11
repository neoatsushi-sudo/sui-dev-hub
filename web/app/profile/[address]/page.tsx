"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { fetchUserProfile, ProfileData } from "@/lib/profile";
import { PostList } from "@/components/PostList";
import { shortAddress } from "@/lib/utils";
import { AuthorAnalytics } from "@/components/AuthorAnalytics";

export default function ProfilePage() {
  const params = useParams();
  const address = params.address as string;
  const router = useRouter();
  const suiClient = useSuiClient();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    fetchUserProfile(suiClient, address)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [address, suiClient]);

  return (
    <div className="min-h-screen pb-20">
      {/* Basic Navigation */}
      <nav className="sticky top-0 z-50 glass border-b border-white/5 py-2 sm:py-3">
        <div className="max-w-3xl mx-auto px-3 sm:px-4">
          <button onClick={() => router.push("/")} className="text-white hover:opacity-80 transition-opacity font-bold flex items-center gap-2 text-sm sm:text-base">
            <span className="text-lg sm:text-xl">←</span> 戻る
          </button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-4 sm:pt-8">
        {/* Profile Card */}
        <div className="bg-gray-900 rounded-2xl p-5 sm:p-8 border border-gray-800 mb-6 sm:mb-10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-blue-900/40 to-purple-900/40 opacity-30"></div>
          
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border-4 border-gray-900 shadow-xl mb-3 sm:mb-4 flex items-center justify-center text-2xl sm:text-4xl mt-2 sm:mt-4">
              {profile?.username ? profile.username.charAt(0).toUpperCase() : "👤"}
            </div>
            
            {loading ? (
              <div className="animate-pulse flex flex-col items-center space-y-3 mt-2">
                <div className="h-6 w-32 bg-gray-800 rounded"></div>
                <div className="h-4 w-48 bg-gray-800 rounded"></div>
              </div>
            ) : (
              <>
                <h1 className="text-xl sm:text-3xl font-bold text-white mb-2">
                  {profile?.username || "名無しユーザー"}
                </h1>
                <p className="text-sm font-mono text-gray-400 bg-gray-800/50 px-3 py-1 rounded-full mb-4 inline-flex items-center gap-2">
                  <span>{shortAddress(address)}</span>
                </p>
                {profile?.bio ? (() => {
                  // bio からソーシャルリンクをパース（末尾の ---\ngithub:xxx\ntwitter:xxx 規約）
                  const parts = profile.bio.split("\n---\n");
                  const bioText = parts[0];
                  const socialLines = parts[1]?.split("\n").filter(Boolean) || [];
                  const socials: Record<string, string> = {};
                  for (const line of socialLines) {
                    const [key, val] = line.split(":");
                    if (key && val) socials[key.trim()] = val.trim();
                  }
                  return (
                    <>
                      <p className="text-gray-300 text-sm max-w-lg mx-auto leading-relaxed">
                        {bioText}
                      </p>
                      {Object.keys(socials).length > 0 && (
                        <div className="flex justify-center gap-3 mt-3">
                          {socials.github && (
                            <a href={`https://github.com/${socials.github}`} target="_blank" rel="noopener noreferrer"
                              className="text-gray-400 hover:text-white text-xs bg-gray-800 px-3 py-1 rounded-full transition-colors">
                              GitHub: {socials.github}
                            </a>
                          )}
                          {socials.twitter && (
                            <a href={`https://x.com/${socials.twitter}`} target="_blank" rel="noopener noreferrer"
                              className="text-gray-400 hover:text-white text-xs bg-gray-800 px-3 py-1 rounded-full transition-colors">
                              X: @{socials.twitter}
                            </a>
                          )}
                        </div>
                      )}
                    </>
                  );
                })() : (
                  <p className="text-gray-500 text-sm max-w-lg mx-auto italic">
                    自己紹介はまだありません。
                  </p>
                )}
                {profile && profile.total_earned > 0 && (
                  <p className="text-green-400 text-sm mt-3 font-medium">
                    {(profile.total_earned / 1e9).toFixed(2)} SUI earned
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Author Analytics */}
        <AuthorAnalytics address={address} />

        {/* User's Posts */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-6">
            <h3 className="text-lg font-bold text-white">
              {profile?.username ? `${profile.username}の記事` : '投稿した記事'}
            </h3>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-800 to-transparent"></div>
          </div>
          <PostList authorAddress={address} />
        </div>
      </div>
    </div>
  );
}
