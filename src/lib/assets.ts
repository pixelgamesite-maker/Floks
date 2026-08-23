// ── FUXEL CLUB ASSETS ─────────────────────────────────────────────────────────

// Chip image
export const CHIP_IMAGE = "https://keihfhxdgfoladjhuvlk.supabase.co/storage/v1/object/public/Images/Chips/Chips.png";

// Background
export const BG_IMAGE = "https://keihfhxdgfoladjhuvlk.supabase.co/storage/v1/object/public/Images/Background.PNG";

// ── CARD SUITS & RANKS ────────────────────────────────────────────────────────

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = typeof SUITS[number];

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export type Rank = typeof RANKS[number];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades:   "♠",
  hearts:   "♥",
  diamonds: "♦",
  clubs:    "♣",
};

export const SUIT_COLORS: Record<Suit, string> = {
  spades:   "#fff",
  hearts:   "#e53e3e",
  diamonds: "#e53e3e",
clubs:    "#fff",
};

// Full 52-card deck
export interface CardDef {
  rank: Rank;
  suit: Suit;
  label: string;          // e.g. "A♠"
  displayRank: string;    // e.g. "Ace"
  value: number;          // 2–14 (Ace = 14)
}

const RANK_DISPLAY: Record<Rank, string> = {
  "2": "Two", "3": "Three", "4": "Four", "5": "Five",
  "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine", "10": "Ten",
  J: "Jack", Q: "Queen", K: "King", A: "Ace",
};

const RANK_VALUE: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

export const FULL_DECK: CardDef[] = SUITS.flatMap((suit) =>
  RANKS.map((rank) => ({
    rank,
    suit,
    label: `${rank}${SUIT_SYMBOLS[suit]}`,
    displayRank: RANK_DISPLAY[rank],
    value: RANK_VALUE[rank],
  }))
);

// Helper — get a single card definition
export function getCard(rank: Rank, suit: Suit): CardDef | undefined {
  return FULL_DECK.find((c) => c.rank === rank && c.suit === suit);
}

// ── TASKS ─────────────────────────────────────────────────────────────────────

export type TaskType = "like" | "retweet" | "follow" | "comment";

export interface TaskDef {
  type: TaskType;
  label: string;
  description: string;
  chips: number;
  icon: string;
  actionLabel: string;
  url: string;
}

// The tweet / profile to interact with
const TWEET_URL = "https://x.com/i/status/2048766004918890533";
const FOLLOW_URL = "https://x.com/fuxelclub"; // update to real handle if different

export const TASKS: TaskDef[] = [
  {
    type: "like",
    label: "Like the Post",
    description: "Like our launch post on X",
    chips: 250,
    icon: "♥",
    actionLabel: "Like on X",
    url: TWEET_URL,
  },
  {
    type: "retweet",
    label: "Retweet",
    description: "Retweet our launch post on X",
    chips: 250,
    icon: "♻",
    actionLabel: "Retweet on X",
    url: TWEET_URL,
  },
  {
    type: "follow",
    label: "Follow Us",
    description: "Follow @fuxelclub on X",
    chips: 250,
    icon: "★",
    actionLabel: "Follow on X",
    url: FOLLOW_URL,
  },
  {
    type: "comment",
    label: "Leave a Comment",
    description: "Comment on our launch post on X",
    chips: 250,
    icon: "💬",
    actionLabel: "Comment on X",
    url: TWEET_URL,
  },
];

export const TASK_CHIPS_TOTAL = TASKS.reduce((sum, t) => sum + t.chips, 0); // 1000
