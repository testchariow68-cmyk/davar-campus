"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/connexion");
        router.refresh();
      }}
    >
      Se déconnecter
    </button>
  );
}
