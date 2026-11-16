import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import HeroCanvas from "./HeroCanvas";
import Button from "./Button";
import { prefersReducedMotion } from "@/utils/motion";

export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!root.current || prefersReducedMotion()) return;

      const play = () => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.from(".hero-line", {
          yPercent: 110,
          duration: 1.15,
          stagger: 0.12,
        })
          .from(".hero-copy", { y: 24, opacity: 0, duration: 0.8 }, "-=0.45")
          .from(".hero-actions a", { y: 16, opacity: 0, duration: 0.6, stagger: 0.08 }, "-=0.5")
          .from(".hero-meta", { opacity: 0, duration: 0.8 }, "-=0.4");
      };

      if (document.documentElement.classList.contains("is-ready")) play();
      else window.addEventListener("aurora:ready", play, { once: true });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="relative isolate flex min-h-svh flex-col justify-end overflow-hidden"
    >
      <HeroCanvas />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-ink/20 via-transparent to-ink" />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-6 pt-32 pb-10 md:px-10 md:pb-14 lg:px-16">
        <p className="hero-meta mb-8 font-mono text-[11px] tracking-[0.28em] text-muted uppercase">
          Independent digital studio — Madrid
        </p>

        <h1 className="font-display text-[12vw] leading-[0.9] font-semibold tracking-[-0.045em] sm:text-[10vw] lg:text-[7.4vw]">
          <span className="block overflow-hidden">
            <span className="hero-line inline-block">We build digital</span>
          </span>
          <span className="block overflow-hidden">
            <span className="hero-line inline-block">
              <em className="bg-linear-to-r from-violet via-magenta to-cyan bg-clip-text pr-[0.08em] not-italic text-transparent">
                experiences
              </em>{" "}
              that
            </span>
          </span>
          <span className="block overflow-hidden">
            <span className="hero-line inline-block">move people.</span>
          </span>
        </h1>

        <div className="mt-10 flex max-w-5xl flex-col gap-8 md:mt-14 md:flex-row md:items-end md:justify-between">
          <p className="hero-copy max-w-md text-[15px] leading-relaxed text-muted md:text-base">
            We partner with ambitious brands to create digital products, identities
            and experiences that people actually remember.
          </p>
          <div className="hero-actions flex flex-wrap gap-3">
            <Button href="#work">Explore our work</Button>
            <Button href="#studio" variant="ghost">
              Meet the studio
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
