export interface Service {
  index: string;
  title: string;
  description: string;
  detail: string;
  tone: string;
}

export const services: Service[] = [
  {
    index: "01",
    title: "Digital Strategy",
    description: "Research, positioning, product strategy and digital direction.",
    detail:
      "We map the market, the audience and the ambition — then turn that into a sharp, usable plan.",
    tone: "#2F6BFF",
  },
  {
    index: "02",
    title: "Brand Identity",
    description: "Visual systems, art direction and identities built for the digital age.",
    detail:
      "Identities that hold up on a billboard and in a 16px favicon. Systems, not one-off logos.",
    tone: "#7C3AED",
  },
  {
    index: "03",
    title: "Web Design",
    description: "High-end websites focused on storytelling, interaction and conversion.",
    detail:
      "Pages that feel authored. Rhythm, type, motion and space working as one composition.",
    tone: "#FF3CAC",
  },
  {
    index: "04",
    title: "Development",
    description:
      "Fast, scalable and maintainable digital products built with modern technology.",
    detail:
      "Production-grade frontends. Clean architecture, serious performance, no template residue.",
    tone: "#33D6FF",
  },
  {
    index: "05",
    title: "Motion & Interaction",
    description: "Animation and interaction systems that bring digital experiences to life.",
    detail:
      "Motion with intent — revealing hierarchy, guiding attention, making the product feel alive.",
    tone: "#FF7A1A",
  },
];
