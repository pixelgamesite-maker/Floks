import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useSound } from "../hooks/useSound";

const MAX_LEN = 240;
const HISTORY_LIMIT = 50;
const LINK_PATTERN = /(https?:\/\/|www\.)/i;

type ChatRow = {
  id: number;
  resident_id: string;
  body: string;
  created_at: string;
  residents: { handle: string; avatar_url: string } | null;
};

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * The Global Farmers Chat. Loads the last 50 messages, then subscribes to
 * Realtime for anything new or deleted. Every message earns BP up to the
 * cap — that reward is granted server-side (grant_chat_reward in
 * schema.sql), not by anything in this component, so onSent just tells the
 * parent to re-pull its balance.
 */
export function GlobalChat({ onSent }: { onSent?: () => void }) {
  const { resident } = useAuth();
  const { play } = useSound();
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(10);
  const [pointsPerMessage, setPointsPerMessage] = useState(3);
  const [isAdmin, setIsAdmin] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["chat_cooldown_seconds", "chat_message_points"])
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.key === "chat_cooldown_seconds") setCooldownSeconds(row.value);
          if (row.key === "chat_message_points") setPointsPerMessage(row.value);
        }
      });
  }, []);

  useEffect(() => {
    if (!resident) return;
    supabase
      .from("residents")
      .select("is_admin")
      .eq("id", resident.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data?.is_admin));
  }, [resident]);

  useEffect(() => {
    let alive = true;

    supabase
      .from("chat_messages")
      .select("id, resident_id, body, created_at, residents ( handle, avatar_url )")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data }) => {
        if (!alive || !data) return;
        setMessages((data as unknown as ChatRow[]).reverse());
      });

    const channel = supabase
      .channel("global-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async (payload) => {
          const { data: sender } = await supabase
            .from("residents")
            .select("handle, avatar_url")
            .eq("id", payload.new.resident_id)
            .maybeSingle();

          const row: ChatRow = {
            id: payload.new.id,
            resident_id: payload.new.resident_id,
            body: payload.new.body,
            created_at: payload.new.created_at,
            residents: sender ?? null,
          };

          setMessages((prev) => [...prev, row].slice(-HISTORY_LIMIT));
          if (row.resident_id !== resident?.id) play("select");
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || !resident || sending || cooldown) return;

    if (LINK_PATTERN.test(body)) {
      setError("Links aren't allowed in chat.");
      return;
    }

    setSending(true);
    setError("");
    const { error: err } = await supabase.from("chat_messages").insert({ resident_id: resident.id, body });
    setSending(false);

    if (err) {
      if (err.message.includes("muted")) setError("You're temporarily muted from chat.");
      else if (err.message.includes("Links")) setError("Links aren't allowed in chat.");
      else if (err.message.includes("not allowed")) setError("That message isn't allowed here.");
      else if (err.message.includes("Slow down")) setError(`Slow down — one message every ${cooldownSeconds}s.`);
      else setError("That didn't send — try again.");
      return;
    }

    setDraft("");
    play("select");
    setCooldown(true);
    setTimeout(() => setCooldown(false), cooldownSeconds * 1000);
    onSent?.();
  }

  async function deleteMessage(id: number) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.rpc("admin_delete_message", { msg_id: id });
  }

  return (
    <div className="chat-panel">
      <p className="muted" style={{ margin: "0 0 6px", fontSize: "0.72rem" }}>
        +{pointsPerMessage} BP per message (until you hit the cap) · no links · one message every{" "}
        {cooldownSeconds}s
      </p>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="muted center" style={{ margin: "20px 0" }}>Nobody's said gYolk yet — be first.</p>}
        {messages.map((m) => (
          <div className={`chat-row ${m.resident_id === resident?.id ? "chat-row-me" : ""}`} key={m.id}>
            <img className="chat-avatar" src={m.residents?.avatar_url ?? ""} alt="" />
            <div className="chat-bubble">
              <div className="chat-meta">
                <b>@{m.residents?.handle ?? "flok"}</b>
                <span>{timeAgo(m.created_at)}</span>
                {isAdmin && (
                  <button className="chat-delete" onClick={() => deleteMessage(m.id)} title="Delete message">
                    ✕
                  </button>
                )}
              </div>
              <p>{m.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          className="ref-input"
          placeholder="Say something to the Flock…"
          value={draft}
          maxLength={MAX_LEN}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn btn-sm" onClick={send} disabled={sending || cooldown || !draft.trim()}>
          {cooldown ? "…" : "Send"}
        </button>
      </div>
      {error && <p className="notice" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
