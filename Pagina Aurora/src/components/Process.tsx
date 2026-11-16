import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { processSteps } from "@/data/process";
import { prefersReducedMotion } from "@/utils/motion";

gsap.registerPlugin(ScrollTrigger);

export default function Process() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!root.current || prefersReducedMotion()) return;

      gsap.from(".proc-step", {
        y: 40,
        opacity: 0,
        duration: 0.9,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: root.current, start: "top 72%" },
      });

      gsap.fromTo(
        ".proc-line",
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            trigger: ".proc-list",
            start: "top 75%",
            end: "bottom 60%",
            scrub: true,
          },
        },
      );
    },
    { scope: root },
  );

  return (
    <section ref={root} className="border-b border-off/10">
      <div className="mx-auto grid max-w-[1600px] gap-16 px-6 py-20 md:px-10 md:py-28 lg:grid-cols-12 lg:px-16">
        <div className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            05 — Method
          </p>
          <h2 className="mt-4 font-display text-5xl tracking-tight md:text-6xl">
            How we work
          </h2>
        </div>

        <ol className="proc-list relative lg:col-span-8">
          <span
            className="proc-line absolute top-0 left-[11px] hidden h-full w-px origin-top bg-linear-to-b from-violet via-electric to-magenta md:block"
            aria-hidden
          />
          {processSteps.map((step) => (
            <li
              key={step.index}
              className="proc-step relative grid gap-3 border-t border-off/10 py-10 md:grid-cols-12 md:gap-8"
            >
              <div className="flex items-center gap-4 md:col-span-4">
                <span className="hidden h-[23px] w-[23px] rounded-full border border-off/30 bg-ink md:block" />
                <span className="font-mono text-[11px] tracking-[0.2em] text-muted">
                  {step.index}
                </span>
                <h3 className="font-display text-3xl tracking-tight md:text-4xl">
                  {step.title}
                </h3>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-muted md:col-span-8 md:pt-1 md:text-[15px]">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
