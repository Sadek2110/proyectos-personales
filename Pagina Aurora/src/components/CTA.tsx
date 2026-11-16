import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Button from "./Button";
import { prefersReducedMotion } from "@/utils/motion";

gsap.registerPlugin(ScrollTrigger);

export default function CTA() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!root.current || prefersReducedMotion()) return;
      gsap.from(".cta-line", {
        yPercent: 110,
        duration: 1.1,
        stagger: 0.1,
        ease: "power3.out",
        scrollTrigger: { trigger: root.current, start: "top 75%" },
      });
      gsap.to(".cta-glow", {
        scale: 1.15,
        xPercent: 8,
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
      ref={root}
      className="relative overflow-hidden"
    >
      <div
        className="cta-glow pointer-events-none absolute top-1/2 left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/35 blur-[110px]"
        aria-hidden
      />
      <div
        className="cta-glow pointer-events-none absolute top-[30%] right-[10%] h-[280px] w-[280px] rounded-full bg-magenta/25 blur-[90px]"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-[70vh] max-w-[1600px] flex-col items-start justify-center px-6 py-28 md:px-10 lg:px-16">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          Have something in mind?
        </p>
        <h2 className="mt-8 font-display text-[12vw] leading-[0.9] font-semibold tracking-[-0.045em] sm:text-7xl md:text-8xl lg:text-9xl">
          <span className="block overflow-hidden">
            <span className="cta-line inline-block">Let's make something</span>
          </span>
          <span className="block overflow-hidden">
            <span className="cta-line inline-block text-off/50">
              people remember.
            </span>
          </span>
        </h2>
        <div className="mt-12">
          <Button href="/contact">Start a project</Button>
        </div>
      </div>
    </section>
  );
}
