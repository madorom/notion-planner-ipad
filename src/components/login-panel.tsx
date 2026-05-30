"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";

type LoginPanelProps = {
  onAuthenticated: () => void;
};

export function LoginPanel({ onAuthenticated }: LoginPanelProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "ログインできませんでした。");
      }

      onAuthenticated();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "ログインできませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-5 py-6">
      <form
        onSubmit={submit}
        className="w-full rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-5 shadow-planner md:p-7"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint-500 text-white shadow-planner-soft">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-mint-600">Notion手帳</p>
            <h1 className="text-2xl font-bold">ログイン</h1>
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
            パスワード
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-base outline-none transition focus:border-mint-500"
            autoComplete="current-password"
            autoFocus
          />
        </label>

        {error ? (
          <p className="mt-4 rounded-lg border border-coral-500/30 bg-coral-500/10 px-4 py-3 text-sm font-semibold text-coral-500">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!password || loading}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-mint-500 px-6 text-base font-bold text-white shadow-planner-soft transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <LockKeyhole className="h-5 w-5" />
          )}
          開く
        </button>
      </form>
    </main>
  );
}
