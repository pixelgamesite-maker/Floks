/**
 * Every media asset the app references, in one place. When art moves —
 * local file → Supabase Storage, a filename change, a v2 of an image —
 * this is the only file that needs to change.
 */

const STORAGE = "https://kkhttmjvokztlcttfbcy.supabase.co/storage/v1/object/public/Floks";

export const ASSETS = {
  logo: `${STORAGE}/Logo.jpg`,

  /** One of the 4,000 pieces (nft_1.png … nft_4000.png), assigned server-side via claim_wl(). */
  nft: (n: number) => `${STORAGE}/NFTs/nft_${n}.png`,

  /**
   * A community logo from the /claim page — pass the plain filename as it
   * actually is in Storage ("Cash cats.avif", space and all); this encodes
   * it, so nobody has to hand-type %20 into a URL again.
   */
  community: (filename: string) => `${STORAGE}/Communities/${encodeURIComponent(filename)}`,

  // Coop cards on /home
  cards: {
    barn: `${STORAGE}/Barn.jpg`,
    roost: `${STORAGE}/Roost.jpg`,
    challenge: `${STORAGE}/Challenge.jpg`,
  },

  // Still local — move to STORAGE the same way as the cards above if you'd
  // rather host these on Supabase too; nothing else needs to change.
  background: "/Flok-background.png",

  items: {
    nest: "/Nest.png",
    water: "/Water-.png",
    thermometer: "/Thermometer.png",
    heat_bulb: "/Bulb.png",
    incubator: "/Incubator.png",
  },

  eggStages: [
    "/Level-1-egg.png",
    "/Level-1-egg.png",
    "/Level-2-egg.png",
    "/Level-3-egg.png",
    "/Level-4-egg.png",
    "/Level-5-egg.png",
  ],

  sounds: {
    select: "/sounds/select.mp3",
    levelup: "/sounds/levelup.mp3",
  },
} as const;
