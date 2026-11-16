export type ProjectLayout = "overlay" | "split-dark" | "split-light" | "stack";

export interface Project {
  id: string;
  index: string;
  name: string;
  category: string;
  year: string;
  description: string;
  color: string;
  accent: string;
  image: string;
  layout: ProjectLayout;
}

export const projects: Project[] = [
  {
    id: "nova",
    index: "01",
    name: "NOVA",
    category: "Fintech / Product Design",
    year: "2025",
    description: "A new way to understand, manage and grow your money.",
    color: "#2F6BFF",
    accent: "#33D6FF",
    image: "/assets/projects/nova.svg",
    layout: "overlay",
  },
  {
    id: "mono",
    index: "02",
    name: "MONO",
    category: "Fashion / E-commerce",
    year: "2025",
    description:
      "Redefining digital fashion through a brutally simple shopping experience.",
    color: "#F3F0E8",
    accent: "#0A0A0B",
    image: "/assets/projects/mono.svg",
    layout: "split-light",
  },
  {
    id: "orbit",
    index: "03",
    name: "ORBIT",
    category: "Technology / AI",
    year: "2026",
    description: "An intelligent workspace designed around the way modern teams think.",
    color: "#7C3AED",
    accent: "#FF3CAC",
    image: "/assets/projects/orbit.svg",
    layout: "split-dark",
  },
  {
    id: "sol",
    index: "04",
    name: "SOL",
    category: "Hospitality / Brand Experience",
    year: "2026",
    description:
      "A digital identity inspired by Mediterranean light, architecture and culture.",
    color: "#FF7A1A",
    accent: "#FFD84D",
    image: "/assets/projects/sol.svg",
    layout: "stack",
  },
];
