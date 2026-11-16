import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Project } from "@/data/projects";
import { prefersReducedMotion } from "@/utils/motion";

gsap.registerPlugin(ScrollTrigger);

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      gsap.from(ref.current, {
        y: 72,
        opacity: 0,
        duration: 1.2,
        ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 86%" },
      });
    },
    { scope: ref },
  );

  const meta = (
    <div className="flex items-center justify-between gap-4 font-mono text-[11px] tracking-[0.18em] uppercase">
      <span>{project.category}</span>
      <span>{project.year}</span>
    </div>
  );

  if (project.layout === "overlay") {
    return (
      <a
        ref={ref}
        href="/#work"
        data-cursor="view"
        className="group relative block min-h-[70vh] overflow-hidden md:min-h-[82vh]"
      >
        <img
          src={project.image}
          alt={project.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
        />
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-between p-6 md:p-10 lg:p-14">
          <div className="flex items-start justify-between text-off">
            <span className="font-mono text-[11px] tracking-[0.22em]">
              {project.index} / {project.name}
            </span>
            {meta}
          </div>
          <div>
            <h3 className="font-display text-6xl tracking-tight md:text-8xl lg:text-9xl">
              {project.name}
            </h3>
            <p className="mt-4 max-w-md translate-y-3 text-sm text-off/80 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100 md:text-base">
              {project.description}
            </p>
          </div>
        </div>
      </a>
    );
  }

  if (project.layout === "split-light") {
    return (
      <a
        ref={ref}
        href="/#work"
        data-cursor="view"
        className="group grid overflow-hidden bg-off text-ink md:grid-cols-12"
      >
        <div className="relative min-h-[52vh] overflow-hidden md:col-span-7 md:min-h-[70vh]">
          <img
            src={project.image}
            alt={project.name}
            className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          />
        </div>
        <div className="flex flex-col justify-between p-6 md:col-span-5 md:p-10 lg:p-14">
          <div>
            <span className="font-mono text-[11px] tracking-[0.22em] text-ink/50">
              {project.index}
            </span>
            <h3 className="mt-6 font-display text-6xl tracking-tight md:text-7xl">
              {project.name}
              <span className="text-ink/30">™</span>
            </h3>
          </div>
          <div>
            <p className="max-w-xs text-sm leading-relaxed text-ink/70 md:text-[15px]">
              {project.description}
            </p>
            <div className="mt-8 text-ink/50">{meta}</div>
          </div>
        </div>
      </a>
    );
  }

  if (project.layout === "split-dark") {
    return (
      <a
        ref={ref}
        href="/#work"
        data-cursor="view"
        className="group grid overflow-hidden border-y border-off/10 md:grid-cols-12"
      >
        <div className="order-2 flex flex-col justify-between p-6 md:order-1 md:col-span-5 md:p-10 lg:p-14">
          <div>
            <span className="font-mono text-[11px] tracking-[0.22em] text-muted">
              {project.index} — {project.year}
            </span>
            <h3 className="mt-6 font-display text-6xl tracking-tight md:text-7xl">
              {project.name}
            </h3>
            <p
              className="mt-2 font-mono text-[11px] tracking-[0.2em] uppercase"
              style={{ color: project.accent }}
            >
              {project.category}
            </p>
          </div>
          <p className="mt-10 max-w-sm text-sm leading-relaxed text-muted md:mt-0 md:text-[15px]">
            {project.description}
          </p>
        </div>
        <div className="relative order-1 min-h-[52vh] overflow-hidden md:order-2 md:col-span-7 md:min-h-[70vh]">
          <img
            src={project.image}
            alt={project.name}
            className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          />
        </div>
      </a>
    );
  }

  return (
    <a
      ref={ref}
      href="/#work"
      data-cursor="view"
      className="group block overflow-hidden"
    >
      <div className="relative min-h-[48vh] overflow-hidden md:min-h-[62vh]">
        <img
          src={project.image}
          alt={project.name}
          className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
        />
      </div>
      <div className="grid gap-6 border-b border-off/10 px-6 py-8 md:grid-cols-12 md:px-10 md:py-12 lg:px-14">
        <div className="md:col-span-5">
          <span className="font-mono text-[11px] tracking-[0.22em] text-muted">
            {project.index} / {project.year}
          </span>
          <h3 className="mt-3 font-display text-5xl tracking-tight md:text-7xl">
            {project.name}
          </h3>
        </div>
        <div className="flex flex-col justify-end md:col-span-7">
          <p className="max-w-md text-sm leading-relaxed text-muted md:text-[15px]">
            {project.description}
          </p>
          <p className="mt-4 font-mono text-[11px] tracking-[0.18em] text-orange uppercase">
            {project.category}
          </p>
        </div>
      </div>
    </a>
  );
}
