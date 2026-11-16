import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { prefersReducedMotion } from "@/utils/motion";

export default function Preloader() {
  const wrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!wrap.current) return;

    const finish = () => {
      document.documentElement.classList.add("is-ready");
      window.dispatchEvent(new Event("aurora:ready"));
      setDone(true);
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    const obj = { n: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(wrap.current, {
          yPercent: -100,
          duration: 0.9,
          ease: "power4.inOut",
          onComplete: finish,
        });
      },
    });

    tl.from(".loader-mark", {
      y: 40,
      opacity: 0,
      duration: 0.7,
      ease: "power3.out",
    })
      .from(
        ".loader-word",
        { y: 28, opacity: 0, duration: 0.6, ease: "power3.out" },
        "-=0.4",
      )
      .to(
        obj,
        {
          n: 100,
          duration: 1.15,
          ease: "power2.inOut",
          onUpdate: () => {
            if (count.current) count.current.textContent = String(Math.round(obj.n)).padStart(3, "0");
            if (bar.current) bar.current.style.width = `${obj.n}%`;
          },
        },
        "-=0.2",
      );

    return () => {
      tl.kill();
    };
  }, []);

  if (done) return null;

  return (
    <div
      ref={wrap}
      className="fixed inset-0 z-[90] flex flex-col justify-between bg-ink px-6 py-8 md:px-10"
    >
      <div className="flex items-start justify-between">
        <span className="loader-mark font-display text-sm tracking-[0.28em]">
          AURORA°
        </span>
        <span
          ref={count}
          className="font-mono text-xs tracking-[0.2em] text-muted"
        >
          000
        </span>
      </div>

      <div className="overflow-hidden">
        <p className="loader-word font-display text-4xl leading-none tracking-tight md:text-7xl">
          Digital experiences
          <br />
          built to be remembered.
        </p>
      </div>

      <div className="h-px w-full bg-off/10">
        <div ref={bar} className="h-px w-0 bg-off" />
      </div>
    </div>
  );
}
