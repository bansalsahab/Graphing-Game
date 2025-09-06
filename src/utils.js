// Utility helpers: coordinate transforms, RNG, clamping

export class World {
  // Defines the world-coordinate bounds and pixel mapping
  constructor({ xMin = -10, xMax = 10, yMin = -7.5, yMax = 7.5, width = 900, height = 600 } = {}) {
    this.xMin = xMin; this.xMax = xMax; this.yMin = yMin; this.yMax = yMax;
    this.width = width; this.height = height;
  }
  setCanvasSize(w, h) { this.width = w; this.height = h; }
  // world (x,y) -> pixel (px,py)
  toPixel(x, y) {
    const px = (x - this.xMin) / (this.xMax - this.xMin) * this.width;
    const py = this.height - (y - this.yMin) / (this.yMax - this.yMin) * this.height;
    return { x: px, y: py };
  }
  // pixel -> world
  toWorld(px, py) {
    const x = this.xMin + (px / this.width) * (this.xMax - this.xMin);
    const y = this.yMin + ((this.height - py) / this.height) * (this.yMax - this.yMin);
    return { x, y };
  }
}

export const randRange = (min, max) => Math.random() * (max - min) + min;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function closestPointOnSegment(px, py, ax, ay, bx, by) {
  // Returns closest point Q on segment AB to point P
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
  t = clamp(t, 0, 1);
  return { x: ax + t * abx, y: ay + t * aby, t };
}

export function reflectVelocityAcrossNormal(vx, vy, nx, ny) {
  // Assumes (nx, ny) is normalized
  const dot = vx * nx + vy * ny;
  const rx = vx - 2 * dot * nx;
  const ry = vy - 2 * dot * ny;
  return { vx: rx, vy: ry };
}

export function normalize(x, y) {
  const m = Math.hypot(x, y);
  if (m === 0) return { x: 0, y: 0 };
  return { x: x / m, y: y / m };
}
