import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "@/utils/motion";

gsap.registerPlugin(ScrollTrigger);

const stats = [
  { value: 47, label: "Projects launched" },
  { value: 12, label: "Design awards" },
  { value: 9, label: "Countries" },
  { value: 6, label: "Years creating" },
];

export default function Stats() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!root.current) return;
      const reduce = prefersReducedMotion();

      root.current.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const end = Number(el.dataset.count);
        if (reduce) {
          el.textContent = String(end);
          return;
        }
        const obj = { n: 0 };
        gsap.to(obj, {
          n: end,
          duration: 1.8,
          ease: "power2.out",
          snap: { n: 1 },
          onUpdate: () => {
            el.textContent = String(obj.n);
          },
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
          },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="border-y border-off/10">
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`px-6 py-12 md:px-10 md:py-16 ${i % 2 === 1 ? "border-l border-off/10" : ""} ${i >= 2 ? "border-t border-off/10 lg:border-t-0" : ""} lg:border-l lg:first:border-l-0`}
          >
            <p className="font-display text-5xl tracking-tight md:text-7xl">
              <span data-count={s.value}>0</span>
            </p>
            <p className="mt-3 text-sm text-muted">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
