import { ASSETS } from "./assets";

export type Community = {
  key: string;
  /** What's shown on the tile. */
  displayName: string;
  /**
   * What has to match (case-insensitively) in the "Community" column of the
   * published sheet for a claim to be accepted. Kept separate from
   * displayName because the two don't always agree — e.g. the image is
   * "Original Blokyz.avif" but the sheet just says "Blokyz".
   */
  sheetName: string;
  image: string;
};

export const COMMUNITIES: Community[] = [
  { key: "cash-cats", displayName: "Cash Cats", sheetName: "CashCats", image: ASSETS.community("Cash cats.avif") },
  { key: "bull-runners", displayName: "Bull Runners", sheetName: "Bull Runners", image: ASSETS.community("Bull runners.avif") },
  { key: "clay-stonkz", displayName: "Clay Stonkz", sheetName: "Clay Stonkz", image: ASSETS.community("Clay Stonkz.avif") },
  { key: "gremlin-cartel", displayName: "Gremlin Cartel", sheetName: "Gremlin Cartel", image: ASSETS.community("Gremlin Cartel.avif") },
  { key: "h00dle", displayName: "H00dle", sheetName: "H00dle", image: ASSETS.community("H00dle.avif") },
  { key: "internet-monkes", displayName: "Internet Monkes", sheetName: "Internet Monkes", image: ASSETS.community("Internet Monkes.avif") },
  { key: "monkeyhood", displayName: "MonkeyHood", sheetName: "MonkeyHood", image: ASSETS.community("MonkeyHood.avif") },
  { key: "normies", displayName: "Normies", sheetName: "Normies", image: ASSETS.community("NORMIES.svg") },
  { key: "onchainhoodies", displayName: "OnChainHoodies", sheetName: "OnChainHoodies", image: ASSETS.community("OnChainHoodies.avif") },
  { key: "blokyz", displayName: "Blokyz", sheetName: "Blokyz", image: ASSETS.community("Original Blokyz.avif") },
  { key: "pyopyopyopyo", displayName: "PyoPyoPyoPyo", sheetName: "Pyopyopyopyo", image: ASSETS.community("PyoPyoPyoPyo.avif") },
  { key: "quotrons", displayName: "Quotrons", sheetName: "Quotrons", image: ASSETS.community("Quotrons.avif") },
  { key: "rh-machine", displayName: "RH Machine", sheetName: "RH Machine", image: ASSETS.community("RH Machine.avif") },
  { key: "script-kiddies", displayName: "Script Kiddies", sheetName: "Script Kiddies", image: ASSETS.community("Script Kiddies.avif") },
  { key: "stackers", displayName: "Stackers", sheetName: "Stackers", image: ASSETS.community("Stackers.avif") },
  { key: "npc", displayName: "NPC", sheetName: "NPC", image: ASSETS.community("NPC.avif") },
];

export const ELIGIBILITY_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTeEe2jePaZ_c9YJyfL7cc4hWiVCsOp9rXZq_MlOnUKN89cBHB7MSmvdVgRYpnCaa7yB-eaoXTHmLPk/pub?output=csv";
