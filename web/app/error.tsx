"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-red-400 mb-4">Error</h1>
        <h2 className="text-xl font-semibold text-white mb-3">
          Something went wrong
        </h2>
        <p className="text-gray-400 mb-2">
          エラーが発生しました。再読み込みしてください。
        </p>
        <p className="text-gray-500 text-sm mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
