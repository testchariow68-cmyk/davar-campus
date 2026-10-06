"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) {
      setMsg({ kind: "err", text: error.message });
      return;
    }
    setMsg({
      kind: "ok",
      text: "Compte créé ✓ Vérifiez votre boîte e-mail pour confirmer votre inscription, puis connectez-vous.",
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="fn">Nom complet</label>
        <input id="fn" className="inp" required value={fullName} placeholder="Ex. Awa Koné"
          onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ph">Téléphone (mobile money)</label>
        <input id="ph" className="inp" value={phone} placeholder="+225 07 00 00 00 00"
          onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="em">Adresse e-mail</label>
        <input id="em" className="inp" type="email" required autoComplete="email" value={email}
          placeholder="vous@exemple.com" onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pw">Mot de passe</label>
        <input id="pw" className="inp" type="password" required minLength={8} value={password}
          placeholder="8 caractères minimum" onChange={(e) => setPassword(e.target.value)} />
      </div>
      {msg && (
        <div className={`banner ${msg.kind === "ok" ? "ok" : "err"} mb16`}>
          <span>{msg.kind === "ok" ? "✓" : "⚠️"}</span>
          <span>{msg.text}</span>
        </div>
      )}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
        {busy ? (<><span className="spin" /> Création…</>) : "Créer mon compte"}
      </button>
      <div className="xs faint mt8" style={{ textAlign: "center" }}>
        En créant un compte, vous acceptez les conditions de Davar Académie.
      </div>
    </form>
  );
}
