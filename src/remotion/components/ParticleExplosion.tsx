import React, { useMemo } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
}

export const ParticleExplosion: React.FC<{ startFrame: number; colorPalette?: string[] }> = ({
  startFrame,
  colorPalette = ['#ccff00', '#ff6b00', '#00f0ff', '#fbbf24', '#ffffff'],
}) => {
  const currentFrame = useCurrentFrame();
  const progress = currentFrame - startFrame;

  const particles = useMemo<Particle[]>(() => {
    const list: Particle[] = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI + (Math.random() - 0.5) * 0.5;
      const speed = 12 + Math.random() * 25;
      list.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 8 + Math.random() * 14,
        color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
        rotation: Math.random() * 360,
      });
    }
    return list;
  }, [colorPalette]);

  if (progress < 0 || progress > 45) return null;

  const opacity = interpolate(progress, [0, 5, 35, 45], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{ opacity }}
      className="absolute inset-0 pointer-events-none flex items-center justify-center z-50"
    >
      {particles.map((p, idx) => {
        const posX = p.vx * progress;
        const posY = p.vy * progress + 0.5 * 0.8 * progress * progress; // gravity
        const rot = p.rotation + progress * 10;
        return (
          <div
            key={idx}
            style={{
              transform: `translate(${posX}px, ${posY}px) rotate(${rot}deg)`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              borderRadius: idx % 2 === 0 ? '50%' : '3px',
              boxShadow: `0 0 12px ${p.color}`,
            }}
            className="absolute"
          />
        );
      })}
    </div>
  );
};
