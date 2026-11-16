import { useState } from "react";
import { testimonials } from "@/data/testimonials";
import { cn } from "@/utils/cn";

export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const t = testimonials[index];

  const prev = () => setIndex((i) => (i === 0 ? testimonials.length - 1 : i - 1));
  const next = () => setIndex((i) => (i === testimonials.length - 1 ? 0 : i + 1));

  return (
    <section className="border-b border-off/10">
      <div className="mx-auto max-w-[1600px] px-6 py-20 md:px-10 md:py-28 lg:px-16">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
              06 — Voices
            </p>
            <h2 className="mt-4 max-w-lg font-display text-4xl tracking-tight md:text-6xl">
              People we've worked with
            </h2>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={prev}
              data-cursor="hover"
              aria-label="Previous testimonial"
              className="flex h-12 w-12 items-center justify-center border border-off/20 transition-colors hover:border-off/60"
            >
              ←
            </button>
            <button
              type="button"
              onClick={next}
              data-cursor="hover"
              aria-label="Next testimonial"
              className="flex h-12 w-12 items-center justify-center border border-off/20 transition-colors hover:border-off/60"
            >
              →
            </button>
          </div>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-12">
          <p
            key={t.name}
            className="font-display text-3xl leading-[1.15] tracking-tight md:text-5xl lg:col-span-9 lg:text-6xl"
          >
            “{t.quote}”
          </p>
          <div className="flex flex-col justify-end lg:col-span-3">
            <p className="font-medium">{t.name}</p>
            <p className="mt-1 text-sm text-muted">{t.role}</p>
            <div className="mt-8 flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Show testimonial ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={cn(
                    "h-px w-10 transition-colors",
                    i === index ? "bg-off" : "bg-off/20",
                  )}
                />
              ))}
            </div>
            <div className="mt-8 flex gap-2 md:hidden">
              <button
                type="button"
                onClick={prev}
                className="flex h-11 w-11 items-center justify-center border border-off/20"
              >
                ←
              </button>
              <button
                type="button"
                onClick={next}
                className="flex h-11 w-11 items-center justify-center border border-off/20"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
