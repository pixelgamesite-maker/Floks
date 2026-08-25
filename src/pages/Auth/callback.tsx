import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Backdrop, Egg } from "../../components/Shell";

export default function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function finish() {
      const params = new URLSearchParams(window.location.search);

      if (params.get("error_description")) {
        setError(params.get("error_description") as string);
        return;
      }

      // PKCE returns ?code=…; implicit returns a #access_token handled by detectSessionInUrl.
      if (params.get("code")) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(window.location.search);
        if (exErr && alive) {
          setError("That sign-in link expired. Head back and tap Continue with X again.");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (data.session) navigate("/home", { replace: true });
      else setError("No session came back from X. Try signing in once more.");
    }

    finish();
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <div className="page">
      <Backdrop />
      <div className="wrap center stack" style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center" }}>
        <Egg crack={error ? 0.2 : 1} />
        {error ? (
          <>
            <p className="notice">{error}</p>
            <button className="btn" onClick={() => navigate("/", { replace: true })}>
              Back to the gate
            </button>
          </>
        ) : (
          <h2 className="h-md" style={{ color: "var(--cream)", textShadow: "3px 3px 0 var(--ink)" }}>
            Checking you into the Barn…
          </h2>
        )}
      </div>
    </div>
  );
}
