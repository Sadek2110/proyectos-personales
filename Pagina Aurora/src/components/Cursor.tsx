import { useEffect, useRef, useState } from "react";

type Mode = "default" | "hover" | "view";

export default function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>("default");
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    setEnabled(true);
    document.documentElement.classList.add("has-cursor");

    const onMove = (e: MouseEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
      setVisible(true);
    };
    const onLeave = () => setVisible(false);

    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("[data-cursor]");
      const next = (el?.getAttribute("data-cursor") as Mode | null) ?? "default";
      setMode(next);
    };

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);

    let raf = 0;
    const tick = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.18;
      pos.current.y += (target.current.y - pos.current.y) * 0.18;
      if (dot.current) {
        dot.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0) translate(-50%, -50%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  if (!enabled) return null;

  const size =
    mode === "view" ? "h-24 w-24" : mode === "hover" ? "h-12 w-12" : "h-3 w-3";
  const look =
    mode === "view"
      ? "bg-off text-ink mix-blend-normal"
      : "bg-off mix-blend-difference";

  return (
    <div
      ref={dot}
      aria-hidden
      className={`pointer-events-none fixed top-0 left-0 z-[100] flex items-center justify-center rounded-full transition-[width,height,background-color,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${size} ${look} ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {mode === "view" && (
        <span className="font-mono text-[10px] font-medium tracking-[0.28em]">
          VIEW
        </span>
      )}
    </div>
  );
}
