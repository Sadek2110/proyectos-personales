import { clients } from "@/data/clients";

export default function Clients() {
  return (
    <section className="border-b border-off/10">
      <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10 lg:px-16">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          Selected partners
        </p>
        <ul className="mt-10 grid grid-cols-2 sm:grid-cols-4">
          {clients.map((c) => (
            <li
              key={c.name}
              data-cursor="hover"
              className="group flex items-center justify-between border-t border-l border-off/10 px-5 py-8 first:border-l-0 sm:[&:nth-child(4n+1)]:border-l-0"
            >
              <span className="font-display text-xl tracking-[0.12em] text-off/55 transition-colors duration-300 group-hover:text-off md:text-2xl">
                {c.name}
              </span>
              <span className="text-muted/40 transition-colors group-hover:text-violet">
                {c.mark}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
