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
  barnPoints: number;
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

/** X profile fields land in different places depending on the provider payload. */
function toResident(user: User, barnPoints = 0): Resident {
  const m = user.user_metadata ?? {};
  return {
    id: user.id,
    handle: m.user_name ?? m.preferred_username ?? m.screen_name ?? "flok",
    name: m.full_name ?? m.name ?? "Barn resident",
    avatar: (m.avatar_url ?? m.picture ?? "").replace("_normal", "_400x400"),
    barnPoints,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [resident, setResident] = useState<Resident | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the profile row in sync so the Barn has something to award points to.
  async function syncResident(user: User | null) {
    if (!user) {
      setResident(null);
      return;
    }
    const base = toResident(user);
    setResident(base);

    const { data, error } = await supabase
      .from("residents")
      .upsert(
        {
          id: user.id,
          handle: base.handle,
          name: base.name,
          avatar_url: base.avatar,
        },
        { onConflict: "id" }
      )
      .select("barn_points")
      .single();

    if (!error && data) setResident({ ...base, barnPoints: data.barn_points ?? 0 });
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
