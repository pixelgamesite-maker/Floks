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
  requested_amount: number | null;
  created_at: string;
  residents: { handle: string; avatar_url: string } | null;
};

/** Who fulfilled a given request message, once someone has. */
type GiftInfo = { handle: string; amount: number };

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
 *
 * A message can also carry a requested BP amount — anyone else can gift
 * against it via gift_bp() (schema.sql). A request can only ever be
 * fulfilled once: a unique index on bp_gifts(message_id) is the actual
 * guarantee (race-proof even if two people click Gift at the same instant),
 * enforced here in the UI by hiding the Gift button and showing who already
 * sent it, kept live across every open tab via the bp_gifts Realtime
 * subscription below.
 */
export function GlobalChat({ onSent }: { onSent?: () => void }) {
  const { resident } = useAuth();
  const { play } = useSound();
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [gifted, setGifted] = useState<Record<number, GiftInfo>>({});
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [askAmount, setAskAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(10);
  const [pointsPerMessage, setPointsPerMessage] = useState(3);
  const [isAdmin, setIsAdmin] = useState(false);
  const [giftOpen, setGiftOpen] = useState<number | null>(null);
  const [giftAmount, setGiftAmount] = useState("");
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftMsg, setGiftMsg] = useState<Record<number, string>>({});
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
      .select("id, resident_id, body, requested_amount, created_at, residents ( handle, avatar_url )")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(async ({ data }) => {
        if (!alive || !data) return;
        const rows = (data as unknown as ChatRow[]).reverse();
        setMessages(rows);

        // Pull fulfillment status for every request in this batch, in one
        // query rather than one per message.
        const requestIds = rows.filter((r) => r.requested_amount != null).map((r) => r.id);
        if (requestIds.length === 0) return;

        const { data: gifts } = await supabase
          .from("bp_gifts")
          .select("message_id, amount, residents:sender_id ( handle )")
          .in("message_id", requestIds);

        if (!alive || !gifts) return;
        const map: Record<number, GiftInfo> = {};
        for (const g of gifts as unknown as { message_id: number; amount: number; residents: { handle: string } | null }[]) {
          if (g.message_id != null) map[g.message_id] = { handle: g.residents?.handle ?? "flok", amount: g.amount };
        }
        setGifted(map);
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
            requested_amount: payload.new.requested_amount ?? null,
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bp_gifts" },
        async (payload) => {
          const msgId = payload.new.message_id;
          if (msgId == null) return; // a gift not tied to any chat request
          const { data: sender } = await supabase
            .from("residents")
            .select("handle")
            .eq("id", payload.new.sender_id)
            .maybeSingle();
          setGifted((prev) => ({ ...prev, [msgId]: { handle: sender?.handle ?? "flok", amount: payload.new.amount } }));
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

    const amt = asking ? parseInt(askAmount, 10) : null;
    if (asking && (!amt || amt <= 0)) {
      setError("Enter a positive amount to request.");
      return;
    }

    setSending(true);
    setError("");
    const { error: err } = await supabase
      .from("chat_messages")
      .insert({ resident_id: resident.id, body, requested_amount: amt });
    setSending(false);

    if (err) {
      console.error("chat send failed:", err);
      if (err.message.includes("muted")) setError("You're temporarily muted from chat.");
      else if (err.message.includes("Links")) setError("Links aren't allowed in chat.");
      else if (err.message.includes("not allowed")) setError("That message isn't allowed here.");
      else if (err.message.includes("Slow down")) setError(`Slow down — one message every ${cooldownSeconds}s.`);
      else setError("That didn't send — try again.");
      return;
    }

    setDraft("");
    setAsking(false);
    setAskAmount("");
    play("select");
    setCooldown(true);
    setTimeout(() => setCooldown(false), cooldownSeconds * 1000);
    onSent?.();
  }

  async function deleteMessage(id: number) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.rpc("admin_delete_message", { msg_id: id });
  }

  function openGift(m: ChatRow) {
    setGiftOpen(m.id);
    setGiftAmount(m.requested_amount ? String(m.requested_amount) : "");
    setGiftMsg((g) => ({ ...g, [m.id]: "" }));
  }

  async function sendGift(m: ChatRow) {
    const amount = parseInt(giftAmount, 10);
    if (!amount || amount <= 0) {
      setGiftMsg((g) => ({ ...g, [m.id]: "Enter a positive amount." }));
      return;
    }
    setGiftBusy(true);
    const { data, error } = await supabase.rpc("gift_bp", {
      recipient: m.resident_id,
      amount,
      msg_id: m.id,
    });
    setGiftBusy(false);

    if (error) {
      // "already fulfilled" shows up here if someone else's gift landed a
      // moment before this one — the unique index in schema.sql is what
      // actually stopped it, this is just surfacing that outcome.
      setGiftMsg((g) => ({ ...g, [m.id]: error.message.replace(/^.*?:\s*/, "") || "That didn't go through." }));
      return;
    }

    const sent = data?.sent ?? amount;
    play("levelup");
    setGiftOpen(null);
    // Optimistic — the bp_gifts Realtime INSERT above will also set this for
    // every other open tab, this just makes the sender's own view instant.
    setGifted((g) => ({ ...g, [m.id]: { handle: resident?.handle ?? "you", amount: sent } }));
    onSent?.();
  }

  return (
    <div className="chat-panel">
      <p className="muted" style={{ margin: "0 0 6px", fontSize: "0.72rem" }}>
        +{pointsPerMessage} BP per message (until you hit the cap) · no links · one message every{" "}
        {cooldownSeconds}s
      </p>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="muted center" style={{ margin: "20px 0" }}>Nobody's said gYolk yet — be first.</p>}
        {messages.map((m) => {
          const isMe = m.resident_id === resident?.id;
          const gift = gifted[m.id];
          return (
            <div className={`chat-row ${isMe ? "chat-row-me" : ""}`} key={m.id}>
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

                {m.requested_amount != null && (
                  <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                    <div className="row" style={{ gap: 8, alignItems: "center", justifyContent: gift ? "flex-end" : "space-between" }}>
                      {gift ? (
                        <span
                          className="chip chip-live gift-badge"
                          title={`Gifted by @${gift.handle} — ${gift.amount} BP`}
                        >
                          🎁 @{gift.handle} +{gift.amount}
                        </span>
                      ) : (
                        <>
                          <span className="chip" style={{ fontSize: "0.62rem" }}>
                            🎁 Requesting {m.requested_amount} BP
                          </span>
                          {!isMe && giftOpen !== m.id && (
                            <button className="btn btn-sm btn-ghost" onClick={() => openGift(m)}>
                              Gift
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {!gift && giftOpen === m.id && (
                      <div className="row" style={{ gap: 6 }}>
                        <input
                          className="ref-input"
                          style={{ width: 90 }}
                          type="number"
                          min={1}
                          value={giftAmount}
                          onChange={(e) => setGiftAmount(e.target.value)}
                          disabled={giftBusy}
                        />
                        <button className="btn btn-sm" onClick={() => sendGift(m)} disabled={giftBusy}>
                          {giftBusy ? "…" : "Send"}
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setGiftOpen(null)} disabled={giftBusy}>
                          Cancel
                        </button>
                      </div>
                    )}

                    {giftMsg[m.id] && (
                      <p className="muted" style={{ fontSize: "0.7rem", margin: 0 }}>
                        {giftMsg[m.id]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <label className="row" style={{ gap: 6, fontSize: "0.72rem", opacity: 0.75 }}>
          <input type="checkbox" checked={asking} onChange={(e) => setAsking(e.target.checked)} />
          Attach a BP request to this message
        </label>

        {asking && (
          <input
            className="ref-input"
            type="number"
            min={1}
            placeholder="Amount to request"
            value={askAmount}
            onChange={(e) => setAskAmount(e.target.value)}
          />
        )}

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
      </div>
      {error && <p className="notice" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
