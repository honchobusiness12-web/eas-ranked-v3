"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";

function LoadingUI() {
  return (
    <Shell>
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-6 text-6xl animate-spin">⚙️</div>
          <h1 className="text-2xl font-black">Logging you in…</h1>
          <p className="mt-2 text-zinc-400">Connecting to Discord, please wait.</p>
        </div>
      </div>
    </Shell>
  );
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error || !code) {
      router.replace("/auth/login?error=access_denied");
      return;
    }

    // Forward to the server-side API route that handles the token exchange
    router.replace(`/api/auth/discord?code=${encodeURIComponent(code)}`);
  }, [router, searchParams]);

  return <LoadingUI />;
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<LoadingUI />}>
      <CallbackHandler />
    </Suspense>
  );
}
