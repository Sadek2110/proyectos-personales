import { useState } from "react";
import { cn } from "@/utils/cn";

const fields = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "company", label: "Company", type: "text", required: false },
] as const;

export default function ContactForm() {
  const [sent, setSent] = useState(false);

  const onSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex min-h-[420px] flex-col justify-center border border-off/10 p-8 md:p-12">
        <p className="font-mono text-[11px] tracking-[0.22em] text-violet uppercase">
          Received
        </p>
        <h2 className="mt-6 font-display text-4xl tracking-tight md:text-5xl">
          We'll be in touch.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
          Thanks for reaching out. Someone from the studio will reply within two
          working days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-0">
      {fields.map((field) => (
        <label
          key={field.name}
          className="border-t border-off/15 py-5 last:border-b"
        >
          <span className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            {field.label}
            {field.required ? "" : " — optional"}
          </span>
          <input
            name={field.name}
            type={field.type}
            required={field.required}
            autoComplete={field.name}
            className="mt-2 w-full bg-transparent text-lg outline-none placeholder:text-off/20"
            placeholder=" "
          />
        </label>
      ))}

      <label className="border-t border-off/15 py-5">
        <span className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
          Budget
        </span>
        <select
          name="budget"
          className="mt-2 w-full appearance-none bg-transparent text-lg outline-none"
          defaultValue=""
        >
          <option value="" disabled className="bg-ink">
            Select a range
          </option>
          <option className="bg-ink" value="20-40">
            €20k — €40k
          </option>
          <option className="bg-ink" value="40-80">
            €40k — €80k
          </option>
          <option className="bg-ink" value="80+">
            €80k+
          </option>
        </select>
      </label>

      <label className="border-y border-off/15 py-5">
        <span className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
          Project
        </span>
        <textarea
          name="message"
          required
          rows={5}
          className="mt-2 w-full resize-none bg-transparent text-lg outline-none placeholder:text-off/20"
          placeholder="Tell us what you want to build."
        />
      </label>

      <button
        type="submit"
        data-cursor="hover"
        className={cn(
          "mt-8 inline-flex items-center justify-between gap-3 bg-off px-7 py-4 text-[13px] tracking-[0.16em] text-ink uppercase transition-colors hover:bg-white",
        )}
      >
        Send the brief
        <span aria-hidden>→</span>
      </button>
    </form>
  );
}
