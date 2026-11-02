"use client";

export function FeedbackBox({ error, success }: { error: string | null; success: string | null }) {
  if (error) {
    return (
      <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mt-4">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2 mt-4">
        {success}
      </p>
    );
  }
  return null;
}
