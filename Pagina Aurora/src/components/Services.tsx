import { useState } from "react";
import { services } from "@/data/services";
import Reveal from "./Reveal";
import { cn } from "@/utils/cn";

export default function Services() {
  const [active, setActive] = useState(0);
  const current = services[active];

  return (
    <section id="services" className="border-t border-off/10">
      <div className="mx-auto grid max-w-[1600px] gap-12 px-6 py-20 md:px-10 md:py-28 lg:grid-cols-12 lg:gap-8 lg:px-16">
        <div className="lg:col-span-4">
          <Reveal>
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
              03 — Capabilities
            </p>
            <h2 className="mt-4 font-display text-5xl tracking-tight md:text-6xl">
              What we do
            </h2>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">
              We help brands transform ideas into meaningful digital experiences.
            </p>
          </Reveal>

          <div
            className="relative mt-12 hidden min-h-[320px] overflow-hidden lg:block"
            style={{ background: current.tone }}
          >
            <div className="absolute inset-0 bg-linear-to-br from-black/20 to-ink/80" />
            <div className="absolute inset-0 flex flex-col justify-between p-8">
              <span className="font-mono text-[11px] tracking-[0.24em]">
                {current.index}
              </span>
              <div>
                <p className="font-display text-4xl tracking-tight">
                  {current.title}
                </p>
                <p className="mt-4 max-w-xs text-sm text-off/80">
                  {current.detail}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          {services.map((service, i) => {
            const on = i === active;
            return (
              <article
                key={service.index}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                tabIndex={0}
                data-cursor="hover"
                className={cn(
                  "group border-t border-off/10 py-6 transition-colors duration-500 last:border-b md:py-8",
                  on && "bg-off/[0.03]",
                )}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-baseline gap-5 md:gap-8">
                    <span
                      className="font-mono text-[11px] tracking-[0.18em] text-muted"
                      style={{ color: on ? service.tone : undefined }}
                    >
                      {service.index}
                    </span>
                    <h3
                      className={cn(
                        "font-display text-2xl tracking-tight transition-colors duration-500 md:text-4xl",
                        on ? "text-off" : "text-off/55",
                      )}
                    >
                      {service.title}
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "hidden h-2 w-2 shrink-0 rounded-full transition-opacity duration-500 md:block",
                      on ? "opacity-100" : "opacity-0",
                    )}
                    style={{ background: service.tone }}
                  />
                </div>
                <p
                  className={cn(
                    "mt-3 max-w-xl overflow-hidden pl-[3.25rem] text-sm leading-relaxed text-muted transition-all duration-500 md:pl-[4.5rem]",
                    on ? "max-h-24 opacity-100" : "max-h-0 opacity-0 md:max-h-24 md:opacity-60",
                  )}
                >
                  {service.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
