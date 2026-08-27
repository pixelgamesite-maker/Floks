import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ASSETS } from "../lib/assets";

/**
 * Only two audio files needed — paths live in lib/assets.ts:
 *
 *   sounds/select.mp3    short UI blip (the "game select" click)
 *   sounds/levelup.mp3   brighter reward chime
 *
 * Everything else is these two, pitch- and volume-shifted. No package required.
 */
const FILES = {
  select: ASSETS.sounds.select,
  levelup: ASSETS.sounds.levelup,
} as const;

type FileKey = keyof typeof FILES;

/** The five things the UI asks for, mapped onto the two clips. */
const VOICES: Record<string, { file: FileKey; rate: number; volume: number }> = {
  select: { file: "select", rate: 1.0, volume: 0.4 },
  purchase: { file: "select", rate: 1.25, volume: 0.5 },
  error: { file: "select", rate: 0.72, volume: 0.32 },
  levelup: { file: "levelup", rate: 1.0, volume: 0.5 },
  claim: { file: "levelup", rate: 0.9, volume: 0.55 },
};

export type SoundKey = keyof typeof VOICES;

const MUTE_KEY = "floks_muted";

type SoundValue = {
  play: (key: SoundKey) => void;
  muted: boolean;
  toggleMute: () => void;
};

const SoundContext = createContext<SoundValue | null>(null);

/**
 * Wrap the app once (in App.tsx) so every component shares one mute state.
 * Two separate `useSound()` calls used to get two separate `muted` values —
 * toggling it in the profile menu had no effect on sounds played elsewhere.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const cache = useRef<Partial<Record<FileKey, HTMLAudioElement>>>({});
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "true");
    } catch {
      /* storage blocked — default to unmuted */
    }
  }, []);

  useEffect(() => {
    (Object.keys(FILES) as FileKey[]).forEach((key) => {
      if (cache.current[key]) return;
      const audio = new Audio(FILES[key]);
      audio.preload = "auto";
      cache.current[key] = audio;
    });
  }, []);

  const play = useCallback(
    (key: SoundKey) => {
      if (muted) return;
      const voice = VOICES[key];
      const base = voice && cache.current[voice.file];
      if (!base) return;

      const node = base.cloneNode(true) as HTMLAudioElement;
      node.volume = voice.volume;
      node.playbackRate = voice.rate;
      (node as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
      (node as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = false;
      (node as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;

      node.play().catch(() => {});
    },
    [muted]
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, String(next));
      } catch {
        /* no-op */
      }
      return next;
    });
  }, []);

  return <SoundContext.Provider value={{ play, muted, toggleMute }}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used inside <SoundProvider>");
  return ctx;
}
