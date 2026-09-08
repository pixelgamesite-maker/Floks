import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

/**
 * ⚠️ PLACEHOLDER VALUES — wallet connection will not actually work until
 * these are real. I don't have a verified RPC URL or chain ID for
 * "Robinhood Chain" and can't browse to confirm one, so rather than
 * silently guess something that looks plausible but is wrong, this is
 * flagged loudly instead. Fill in:
 *   - id: the real numeric chain ID
 *   - rpcUrls: a working RPC endpoint (from the chain's docs, or your own
 *     node/provider)
 *   - blockExplorers: optional, but nice for linking out to transactions
 */
export const robinhoodChain = defineChain({
  id: 0, // ⚠️ placeholder — not a real chain ID, connection will fail until this is correct
  name: "Robinhood Chain",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, // confirm this is actually right for the chain
  rpcUrls: {
    default: { http: ["https://REPLACE-WITH-REAL-RPC-URL"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://REPLACE-WITH-REAL-EXPLORER-URL" },
  },
});

/**
 * RainbowKit requires a WalletConnect project ID even to boot — without a
 * real one it'll throw at startup, not just fail silently on connect. Get
 * a free one from https://cloud.walletconnect.com and drop it in here.
 */
const WALLETCONNECT_PROJECT_ID = "REPLACE_WITH_WALLETCONNECT_PROJECT_ID";

export const wagmiConfig = getDefaultConfig({
  appName: "Floks",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [robinhoodChain],
  ssr: false, // this is a client-only Vite SPA, not a server-rendered app
});
