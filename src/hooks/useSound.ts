import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Only two audio files needed — drop them in /public/sounds/:
 *
 *   select.mp3    short UI blip (the "game select" click)
 *   levelup.mp3   brighter reward chime
 *
 * Everything else is these two, pitch- and volume-shifted. No package required.
 */
const FILES = {
  select: "/sounds/select.mp3",
  levelup: "/sounds/levelup.mp3",
} as const;

type FileKey = keyof typeof FILES;

/**
 * The five things the UI asks for, mapped onto the two clips.
 * rate shifts pitch (preservesPitch is disabled below), volume shifts weight.
 */
const VOICES: Record<string, { file: FileKey; rate: number; volume: number }> = {
  select: { file: "select", rate: 1.0, volume: 0.4 }, // task tap, accordion
  purchase: { file: "select", rate: 1.25, volume: 0.5 }, // buy — same blip, brighter
  error: { file: "select", rate: 0.72, volume: 0.32 }, // buy — same blip, dropped low
  levelup: { file: "levelup", rate: 1.0, volume: 0.5 }, // egg levels up
  claim: { file: "levelup", rate: 0.9, volume: 0.55 }, // egg claimed — fuller, slower
};

export type SoundKey = keyof typeof VOICES;

const MUTE_KEY = "floks_muted";

export function useSound() {
  const cache = useRef<Partial<Record<FileKey, HTMLAudioElement>>>({});
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "true");
    } catch {
      /* storage blocked — default to unmuted */
    }
  }, []);

  // Warm the cache so the first click isn't silent while the file downloads.
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

      // Clone so rapid taps overlap instead of cutting each other off.
      const node = base.cloneNode(true) as HTMLAudioElement;
      node.volume = voice.volume;
      node.playbackRate = voice.rate;
      // Let the pitch move with the rate — that's what makes one clip read as several.
      (node as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
      (node as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = false;
      (node as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;

      // Autoplay policy rejects until the user has interacted — ignore quietly.
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

  return { play, muted, toggleMute };
}
