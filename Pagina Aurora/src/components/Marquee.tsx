const items = [
  "STRATEGY",
  "DESIGN",
  "DEVELOPMENT",
  "BRANDING",
  "MOTION",
  "DIGITAL PRODUCTS",
];

export default function Marquee() {
  const row = [...items, ...items, ...items, ...items];

  return (
    <div className="relative overflow-hidden border-y border-off/10 bg-ink py-5 md:py-6">
      <div className="marquee-track flex w-max items-center gap-8">
        {row.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-8">
            <span className="font-display text-xl tracking-[0.18em] whitespace-nowrap md:text-3xl">
              {item}
            </span>
            <span className="text-violet" aria-hidden>
              °
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
