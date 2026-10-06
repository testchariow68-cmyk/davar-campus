"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(
        error.message.includes("Invalid login credentials")
          ? "E-mail ou mot de passe incorrect."
          : error.message
      );
      setBusy(false);
      return;
    }
    router.push("/campus");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="email">Adresse e-mail</label>
        <input
          id="email"
          className="inp"
          type="email"
          required
          autoComplete="email"
          placeholder="vous@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          className="inp"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <div className="banner err mb16">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
        {busy ? (
          <>
            <span className="spin" /> Connexion…
          </>
        ) : (
          "Se connecter"
        )}
      </button>
    </form>
  );
}
