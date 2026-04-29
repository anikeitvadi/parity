import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Full-page interactive canvas background.
 * Market questions scroll with physics, react to cursor,
 * and are clickable — navigating to the market detail page.
 */

interface FloatingText {
  question: string;
  fullQuestion: string;
  pct: string;
  yesPrice: number;
  fontSize: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSpeed: number;
  width: number;
  hovered: boolean;
  platform: string;
  marketId: string;
  volume: number;
  baseY: number;
}

function probabilityColor(p: number, alpha: number): string {
  const dist = Math.abs(p - 0.5) * 2;
  if (dist < 0.2) return `rgba(6, 182, 212, ${alpha})`;
  if (dist < 0.4) return `rgba(139, 92, 246, ${alpha})`;
  if (dist < 0.7) return `rgba(245, 158, 11, ${alpha})`;
  return `rgba(107, 114, 128, ${alpha})`;
}

export function PretextHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textsRef = useRef<FloatingText[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const trailRef = useRef<{ x: number; y: number; age: number }[]>([]);
  const speedBoostRef = useRef(0);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  // Fetch markets
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/markets?limit=80');
        const data = await res.json();
        const markets = data.markets || [];

        const h = window.innerHeight;
        const w = window.innerWidth;
        const rows = Math.floor(h / 38);
        const texts: FloatingText[] = [];

        for (let row = 0; row < rows; row++) {
          const m = markets[row % markets.length];
          if (!m) continue;

          const yesPrice = m.prices?.Yes ?? m.prices?.yes ?? 0.5;
          const vol = m.volume || 1000;
          const fontSize = Math.max(12, Math.min(20, 10 + Math.log10(Math.max(vol, 1)) * 1.8));
          const question = (m.question?.slice(0, 50) || '') + (m.question?.length > 50 ? '...' : '');
          const pct = `${Math.round(yesPrice * 100)}%`;
          const baseSpeed = 0.2 + Math.random() * 0.3 + (fontSize / 80);
          const y = row * 38 + 22;

          texts.push({
            question,
            fullQuestion: m.question || '',
            pct,
            yesPrice,
            fontSize,
            x: -Math.random() * w * 2,
            y,
            vx: baseSpeed,
            vy: 0,
            baseSpeed,
            width: 0,
            hovered: false,
            platform: m.platform || 'polymarket',
            marketId: m.id || '',
            volume: vol,
            baseY: y,
          });
        }

        textsRef.current = texts;
        setReady(true);
      } catch { /* ignore */ }
    })();
  }, []);

  // Canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Mouse + scroll events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: MouseEvent) => {
      const prev = mouseRef.current;
      mouseRef.current = { x: e.clientX, y: e.clientY };

      // Add to trail
      trailRef.current.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (trailRef.current.length > 20) trailRef.current.shift();
    };

    const onLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    const onClick = (e: MouseEvent) => {
      // Find clicked text
      const x = e.clientX;
      const y = e.clientY;

      for (const t of textsRef.current) {
        if (
          x >= t.x && x <= t.x + t.width &&
          y >= t.y - t.fontSize && y <= t.y + 4
        ) {
          navigate(`/market/${t.platform}/${encodeURIComponent(t.marketId)}`);
          return;
        }
      }
    };

    const onScroll = () => {
      speedBoostRef.current = 3;
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onScroll, { passive: true });

    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onScroll);
    };
  }, [navigate]);

  // Render loop
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Decay speed boost
      speedBoostRef.current *= 0.95;

      // Age trail points
      for (const pt of trailRef.current) pt.age++;
      trailRef.current = trailRef.current.filter((pt) => pt.age < 30);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      // Draw cursor trail
      for (const pt of trailRef.current) {
        const fade = 1 - pt.age / 30;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3 * fade, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(6, 182, 212, ${fade * 0.3})`;
        ctx.fill();
      }

      let hoveredText: FloatingText | null = null;

      for (const t of textsRef.current) {
        // Measure width once
        if (t.width === 0) {
          ctx.font = `400 ${t.fontSize}px "Inter", system-ui, sans-serif`;
          t.width = ctx.measureText(t.question + '  ' + t.pct).width;
        }

        // --- Physics ---
        const boost = speedBoostRef.current;
        t.vx += ((t.baseSpeed + boost) - t.vx) * 0.05;

        // Mouse repulsion
        const dmx = (t.x + t.width / 2) - mx;
        const dmy = t.y - my;
        const mouseDist = Math.sqrt(dmx * dmx + dmy * dmy);
        t.hovered = mouseDist < 70;

        if (mouseDist < 140 && mouseDist > 0) {
          const force = ((140 - mouseDist) / 140) * 2.5;
          t.vx += (dmx / mouseDist) * force;
          t.vy += (dmy / mouseDist) * force;
        }

        // Trail repulsion (lighter)
        for (const pt of trailRef.current) {
          const tdx = (t.x + t.width / 2) - pt.x;
          const tdy = t.y - pt.y;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tdist < 80 && tdist > 0) {
            const fade = 1 - pt.age / 30;
            const f = ((80 - tdist) / 80) * 0.5 * fade;
            t.vy += (tdy / tdist) * f;
          }
        }

        // Spring back to base Y
        t.vy += (t.baseY - t.y) * 0.01;

        // Vertical bounds
        if (t.y < 15) t.vy += 0.3;
        if (t.y > H - 5) t.vy -= 0.3;

        // Damping
        t.vy *= 0.94;

        // Apply
        t.x += t.vx;
        t.y += t.vy;

        // Wrap
        if (t.x > W + 50) {
          t.x = -t.width - 50;
          t.vy = 0;
          t.y = t.baseY;
        }

        // --- Render ---
        // Text flows behind center — just render at lower opacity everywhere
        const alpha = t.hovered ? 0.9 : 0.22;

        ctx.font = `${t.hovered ? '600' : '400'} ${t.fontSize}px "Inter", system-ui, sans-serif`;
        ctx.fillStyle = probabilityColor(t.yesPrice, alpha);
        ctx.fillText(t.question, t.x, t.y);

        // Pct
        const qW = ctx.measureText(t.question + '  ').width;
        ctx.font = `700 ${t.fontSize}px "Inter", system-ui, sans-serif`;
        ctx.fillStyle = t.yesPrice > 0.5
          ? `rgba(34, 197, 94, ${alpha})`
          : `rgba(239, 68, 68, ${alpha * 0.9})`;
        ctx.fillText(t.pct, t.x + qW, t.y);

        if (t.hovered) hoveredText = t;
      }

      // Tooltip for hovered text
      if (hoveredText) {
        const t = hoveredText;
        const tipX = mx + 16;
        const tipY = my - 12;

        ctx.font = '500 12px "Inter", system-ui, sans-serif';
        const line1 = t.fullQuestion.slice(0, 60) + (t.fullQuestion.length > 60 ? '...' : '');
        const line2 = `${t.platform} · ${t.pct} · $${(t.volume / 1000).toFixed(0)}K vol`;
        const line3 = 'Click to view →';
        const maxW = Math.max(
          ctx.measureText(line1).width,
          ctx.measureText(line2).width,
          ctx.measureText(line3).width
        );

        // Background
        ctx.fillStyle = 'rgba(3, 7, 18, 0.9)';
        ctx.strokeStyle = 'rgba(55, 65, 81, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tipX - 8, tipY - 16, maxW + 20, 58, 8);
        ctx.fill();
        ctx.stroke();

        // Text
        ctx.fillStyle = 'rgba(229, 231, 235, 0.95)';
        ctx.fillText(line1, tipX, tipY);
        ctx.fillStyle = 'rgba(156, 163, 175, 0.8)';
        ctx.fillText(line2, tipX, tipY + 16);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.8)';
        ctx.fillText(line3, tipX, tipY + 32);
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [ready]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0"
      style={{ zIndex: 0, cursor: 'crosshair' }}
    />
  );
}
