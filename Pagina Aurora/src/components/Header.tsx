import { useEffect, useState } from "react";
import { navItems } from "@/data/nav";
import { cn } from "@/utils/cn";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 right-0 left-0 z-50 transition-all duration-500",
          scrolled
            ? "border-b border-off/10 bg-ink/70 backdrop-blur-xl"
            : "bg-transparent",
        )}
      >
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5 md:px-10 lg:px-16">
          <a
            href="/"
            data-cursor="hover"
            className="font-display text-[15px] tracking-[0.28em]"
          >
            AURORA<span className="text-violet">°</span>
          </a>

          <nav className="hidden items-center gap-9 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                data-cursor="hover"
                className="text-[12px] tracking-[0.18em] text-off/70 uppercase transition-colors duration-300 hover:text-off"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <a
            href="/contact"
            data-cursor="hover"
            className="hidden items-center gap-2 text-[12px] tracking-[0.16em] uppercase lg:inline-flex"
          >
            Start a project
            <span aria-hidden>→</span>
          </a>

          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="relative z-[60] flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
          >
            <span
              className={cn(
                "h-px w-6 bg-off transition-transform duration-500",
                open && "translate-y-[4px] rotate-45",
              )}
            />
            <span
              className={cn(
                "h-px w-6 bg-off transition-transform duration-500",
                open && "-translate-y-[4px] -rotate-45",
              )}
            />
          </button>
        </div>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-40 flex flex-col justify-between bg-ink px-6 py-28 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden",
          open ? "translate-y-0" : "-translate-y-full",
        )}
      >
        <nav className="flex flex-col gap-2">
          {navItems.map((item, i) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-baseline gap-4 border-b border-off/10 py-4"
            >
              <span className="font-mono text-[11px] text-muted">
                0{i + 1}
              </span>
              <span className="font-display text-4xl tracking-tight">
                {item.label}
              </span>
            </a>
          ))}
        </nav>
        <a
          href="/contact"
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-3 bg-off px-6 py-4 text-sm tracking-[0.16em] text-ink uppercase"
        >
          Start a project →
        </a>
      </div>
    </>
  );
}
