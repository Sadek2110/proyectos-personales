import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface ButtonProps {
  href: string;
  children: ReactNode;
  variant?: "solid" | "ghost" | "line";
  className?: string;
}

export default function Button({
  href,
  children,
  variant = "solid",
  className,
}: ButtonProps) {
  return (
    <a
      href={href}
      data-cursor="hover"
      className={cn(
        "group relative inline-flex items-center gap-3 overflow-hidden px-7 py-3.5 text-[13px] font-medium tracking-[0.14em] uppercase transition-colors duration-500",
        variant === "solid" && "bg-off text-ink hover:bg-white",
        variant === "ghost" &&
          "border border-off/20 text-off hover:border-off/60 hover:bg-off/5",
        variant === "line" && "px-0 py-2 text-off",
        className,
      )}
    >
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden
        className={cn(
          "relative z-10 inline-block transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1 group-hover:-translate-y-0.5",
        )}
      >
        →
      </span>
      {variant === "line" && (
        <span className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-100 bg-off/40 transition-transform duration-500 group-hover:scale-x-0" />
      )}
    </a>
  );
}
