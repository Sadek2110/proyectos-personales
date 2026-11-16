import { insights } from "@/data/insights";
import Reveal from "./Reveal";

export default function Insights() {
  return (
    <section id="insights" className="border-b border-off/10">
      <div className="mx-auto max-w-[1600px] px-6 py-20 md:px-10 md:py-28 lg:px-16">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            07 — Journal
          </p>
          <h2 className="mt-4 font-display text-5xl tracking-tight md:text-6xl">
            Insights
          </h2>
        </Reveal>

        <div className="mt-14 divide-y divide-off/10 border-y border-off/10">
          {insights.map((item) => (
            <a
              key={item.slug}
              href="/#insights"
              data-cursor="hover"
              className="group grid gap-4 py-8 md:grid-cols-12 md:items-center md:py-10"
            >
              <span className="font-mono text-[11px] text-muted md:col-span-1">
                {item.index}
              </span>
              <h3 className="font-display text-2xl tracking-tight transition-colors group-hover:text-off/70 md:col-span-7 md:text-3xl">
                {item.title}
              </h3>
              <div className="flex items-center justify-between text-sm text-muted md:col-span-4 md:justify-end md:gap-10">
                <span>
                  {item.date} · {item.read}
                </span>
                <span className="transition-transform duration-500 group-hover:translate-x-1">
                  →
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
