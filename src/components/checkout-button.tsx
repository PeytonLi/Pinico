'use client';

import { useState } from 'react';

export function CheckoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? 'Something went wrong');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 disabled:opacity-40"
      >
        {loading ? 'Redirecting...' : 'Start Free Trial'}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
      <p className="mt-2 text-[10px] text-foreground/20">
        Test mode — use card 4242 4242 4242 4242
      </p>
    </div>
  );
}
