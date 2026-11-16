import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/utils/motion";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
}

export default function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = prefersReducedMotion();
    const mouse = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4 };
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const orbs = [
      { bx: 0.22, by: 0.28, r: 0.42, color: "124, 58, 237", par: 28 },
      { bx: 0.78, by: 0.26, r: 0.46, color: "47, 107, 255", par: -22 },
      { bx: 0.58, by: 0.78, r: 0.36, color: "255, 60, 172", par: 18 },
      { bx: 0.38, by: 0.62, r: 0.22, color: "51, 214, 255", par: -14 },
    ];

    let particles: Particle[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.round((w * h) / 18000);
      particles = Array.from({ length: Math.min(count, 110) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.4 + 0.4,
        a: Math.random() * 0.45 + 0.08,
      }));
    };

    const onMove = (e: MouseEvent) => {
      mouse.tx = e.clientX / window.innerWidth;
      mouse.ty = e.clientY / window.innerHeight;
    };

    const draw = () => {
      mouse.x += (mouse.tx - mouse.x) * 0.045;
      mouse.y += (mouse.ty - mouse.y) * 0.045;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const dx = (mouse.x - 0.5) * 2;
      const dy = (mouse.y - 0.5) * 2;

      for (const o of orbs) {
        const x = (o.bx + dx * (o.par / 400)) * w;
        const y = (o.by + dy * (o.par / 400)) * h;
        const radius = o.r * Math.max(w, h) * 0.55;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, `rgba(${o.color}, 0.42)`);
        g.addColorStop(0.45, `rgba(${o.color}, 0.12)`);
        g.addColorStop(1, `rgba(${o.color}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      for (const p of particles) {
        if (!reduce) {
          p.x += p.vx + dx * 0.15;
          p.y += p.vy + dy * 0.12;
          if (p.x < 0) p.x = w;
          if (p.x > w) p.x = 0;
          if (p.y < 0) p.y = h;
          if (p.y > h) p.y = 0;
        }
        ctx.fillStyle = `rgba(243, 240, 232, ${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(243,240,232,0.06)";
      ctx.lineWidth = 1;
      const gx = w * (0.5 + dx * 0.04);
      const gy = h * (0.48 + dy * 0.04);
      ctx.beginPath();
      ctx.arc(gx, gy, Math.min(w, h) * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, Math.min(w, h) * 0.34, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
