import { useEffect, useState, type RefObject } from "react";

export function usePlayerShortcuts(element: RefObject<HTMLVideoElement | null>, active: boolean) {
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setFeedback("");
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const notify = (message: string) => {
      setFeedback(message);
      clearTimeout(timer);
      timer = setTimeout(() => setFeedback(""), 1200);
    };
    const onKey = (event: KeyboardEvent) => {
      const video = element.current;
      if (!video || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.composedPath().some((target) => target instanceof HTMLElement &&
        (target.isContentEditable || target.matches("input, textarea, select, [role='textbox']")))) return;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

      // Capture once, including when native video controls have keyboard focus.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const volume = Math.max(0, Math.min(1, Math.round(((video.muted ? 0 : video.volume) + (event.key === "ArrowUp" ? 0.05 : -0.05)) * 100) / 100));
        video.volume = volume;
        video.muted = volume === 0;
        notify(`音量 ${Math.round(volume * 100)}%`);
        return;
      }

      const start = video.seekable.length ? video.seekable.start(0) : 0;
      const end = Number.isFinite(video.duration) ? video.duration :
        video.seekable.length ? video.seekable.end(video.seekable.length - 1) : NaN;
      if (!Number.isFinite(end) || end <= start || video.readyState === 0) {
        notify("视频加载中，暂不能跳转");
        return;
      }
      const before = video.currentTime;
      const next = Math.max(start, Math.min(end, before + (event.key === "ArrowRight" ? 5 : -5)));
      video.currentTime = next;
      notify(`${event.key === "ArrowRight" ? "快进" : "后退"} ${Math.round(Math.abs(next - before) * 10) / 10} 秒`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); clearTimeout(timer); };
  }, [element, active]);

  return feedback;
}
