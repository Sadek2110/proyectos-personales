import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "@/utils/motion";

gsap.registerPlugin(ScrollTrigger);

const lineOne = ["The", "internet", "doesn't", "need", "more", "websites."];
const lineTwo = ["It", "needs", "better", "experiences."];

export default function Manifesto() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!root.current || prefersReducedMotion()) return;

      gsap.from(".man-word", {
        yPercent: 110,
        duration: 1,
        ease: "power3.out",
        stagger: 0.05,
        scrollTrigger: {
          trigger: root.current,
          start: "top 70%",
        },
      });

      gsap.from(".man-copy", {
        opacity: 0,
        y: 28,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".man-copy",
          start: "top 85%",
        },
      });

      gsap.to(".man-orb", {
        yPercent: -18,
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    },
    { scope: root },
  );

  return (
    <section
      id="studio"
      ref={root}
      className="relative overflow-hidden border-t border-off/10"
    >
      <div
        className="man-orb pointer-events-none absolute -top-24 -right-24 h-[480px] w-[480px] rounded-full bg-violet/30 blur-[90px]"
        aria-hidden
      />
      <div
        className="man-orb pointer-events-none absolute bottom-0 left-[-10%] h-[380px] w-[380px] rounded-full bg-electric/20 blur-[90px]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1600px] px-6 py-28 md:px-10 md:py-40 lg:px-16">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          04 — Manifesto
        </p>

        <h2 className="mt-10 max-w-6xl font-display text-[11vw] leading-[0.95] font-semibold tracking-[-0.04em] sm:text-6xl md:text-7xl lg:text-8xl">
          <span className="block">
            {lineOne.map((w) => (
              <span key={w} className="inline-block overflow-hidden pr-[0.28em]">
                <span className="man-word inline-block">{w}</span>
              </span>
            ))}
          </span>
          <span className="mt-2 block text-off/50">
            {lineTwo.map((w) => (
              <span key={w} className="inline-block overflow-hidden pr-[0.28em]">
                <span className="man-word inline-block">{w}</span>
              </span>
            ))}
          </span>
        </h2>

        <p className="man-copy mt-14 max-w-lg text-base leading-relaxed text-muted md:text-lg">
          We believe digital products should feel intuitive, expressive and
          unmistakably human. Technology is only interesting when it creates
          emotion.
        </p>
      </div>
    </section>
  );
}
