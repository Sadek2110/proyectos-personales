import { projects } from "@/data/projects";
import ProjectCard from "./ProjectCard";
import Reveal from "./Reveal";

export default function Projects() {
  return (
    <section id="work">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-20 md:flex-row md:items-end md:justify-between md:px-10 md:py-28 lg:px-16">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            02 — Selected
          </p>
          <h2 className="mt-4 font-display text-5xl tracking-tight md:text-7xl">
            Selected work
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="max-w-sm text-sm leading-relaxed text-muted md:text-[15px]">
            A selection of projects where strategy, design and technology come
            together.
          </p>
        </Reveal>
      </div>
      <div className="flex flex-col">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
