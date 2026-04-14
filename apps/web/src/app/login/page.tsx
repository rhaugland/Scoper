"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendMagicLink, verifyToken } from "@/lib/api";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setVerifying(true);
      verifyToken(token)
        .then(() => router.push("/dashboard"))
        .catch(() => {
          setError("Invalid or expired link. Please request a new one.");
          setVerifying(false);
        });
    }
  }, [searchParams, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-forest text-lg">Verifying your link...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <div className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-forest mb-2">Scoper</h1>
        <p className="text-gray-600 mb-6">Sign in to start scoping projects.</p>

        {sent ? (
          <div className="bg-sage/20 border border-sage rounded-lg p-4">
            <p className="text-forest">Check your email for a sign-in link.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-sand bg-white focus:outline-none focus:ring-2 focus:ring-forest"
            />
            <button
              type="submit"
              className="w-full px-4 py-3 rounded-lg bg-forest text-white font-medium hover:bg-forest-light transition"
            >
              Send magic link
            </button>
            {error && <p className="text-red-600 text-sm">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-cream">
          <p className="text-forest text-lg">Loading...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
