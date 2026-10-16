/**
 * Big screens: the layouts are tuned for ~1600×900, so above that the whole UI is zoomed up
 * proportionally (1080p ≈ 1.2×, 1440p ≈ 1.6×, 4K ≈ 2.4×). Laptops and touch devices stay at 1×.
 * Full-height sizes divide by --zoom (see the viewport-unit classes), so one-screen layouts still fit.
 */
export function applyScreenScale() {
  const root = document.documentElement;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const raw = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  const zoom = coarse ? 1 : Math.max(1, Math.min(2.4, raw));
  const rounded = Math.round(zoom * 100) / 100;
  root.style.setProperty('--zoom', String(rounded));
  root.style.zoom = rounded === 1 ? '' : String(rounded);
}

/** Current UI zoom, for code that turns measured screen distances into CSS movement. */
export const getUiZoom = () => Number(document.documentElement.style.getPropertyValue('--zoom')) || 1;

export function installScreenScale() {
  if (typeof window === 'undefined') return;
  applyScreenScale();
  window.addEventListener('resize', applyScreenScale);
}
