import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type Resident = {
  id: string;
  handle: string;
  name: string;
  avatar: string;
};

type AuthValue = {
  session: Session | null;
  user: User | null;
  resident: Resident | null;
  loading: boolean;
  signInWithX: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const REF_KEY = "floks_ref";

/** Call on the landing page before sign-in so the code survives the OAuth round trip. */
export function captureReferral() {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem(REF_KEY, ref.trim());
  } catch {
    /* localStorage unavailable — referral just won't attribute, sign-in still works */
  }
}

/** X profile fields land in different places depending on the provider payload. */
function toResident(user: User): Resident {
  const m = user.user_metadata ?? {};
  return {
    id: user.id,
    handle: m.user_name ?? m.preferred_username ?? m.screen_name ?? "flok",
    name: m.full_name ?? m.name ?? "Barn resident",
    avatar: (m.avatar_url ?? m.picture ?? "").replace("_normal", "_400x400"),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [resident, setResident] = useState<Resident | null>(null);
  const [loading, setLoading] = useState(true);

  // First login for a resident: attribute the pending referral, then forget it.
  // Every later login: just refresh the profile fields, never touch referred_by.
  async function syncResident(user: User | null) {
    if (!user) {
      setResident(null);
      return;
    }
    const base = toResident(user);
    setResident(base);

    const { data: existing } = await supabase.from("residents").select("id").eq("id", user.id).maybeSingle();

    if (!existing) {
      let referredBy: string | null = null;
      try {
        const refHandle = localStorage.getItem(REF_KEY);
        if (refHandle && refHandle.toLowerCase() !== base.handle.toLowerCase()) {
          const { data: refRow } = await supabase
            .from("residents")
            .select("id")
            .ilike("handle", refHandle)
            .maybeSingle();
          if (refRow) referredBy = refRow.id;
        }
      } catch {
        /* no-op — attribution is best-effort */
      }

      await supabase.from("residents").insert({
        id: user.id,
        handle: base.handle,
        name: base.name,
        avatar_url: base.avatar,
        referred_by: referredBy,
      });
      localStorage.removeItem(REF_KEY);
    } else {
      await supabase
        .from("residents")
        .update({ handle: base.handle, name: base.name, avatar_url: base.avatar })
        .eq("id", user.id);
    }

    setResident(base);
  }

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      syncResident(data.session?.user ?? null).finally(() => setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      syncResident(next?.user ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      resident,
      loading,
      async signInWithX() {
        await supabase.auth.signInWithOAuth({
          provider: "x",
          options: { redirectTo: `${window.location.origin}/callback` },
        });
      },
      async signOut() {
        await supabase.auth.signOut();
        setResident(null);
      },
    }),
    [session, resident, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
