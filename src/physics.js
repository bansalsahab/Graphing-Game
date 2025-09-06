// Physics: balls, gravity, collisions with polyline curves
import { clamp, closestPointOnSegment, normalize } from './utils.js';

export class Ball {
  constructor(x, y, radius = 0.2) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = radius;
    this.collected = false; // for potential future use per-ball
  }
}

export function updateBalls(balls, dt, gravity, bounds, curves) {
  // bounds: {xMin,xMax,yMin,yMax}
  for (const b of balls) {
    // apply gravity to velocity (free fall default)
    b.vy += gravity * dt;

    // world bounds (horizontal): allow pass-through; removal handled in game.update()
    // (no horizontal wall bounce)
    // bottom: let balls pass through; removal handled in game.update()
    // if (b.y - b.r < bounds.yMin) { }
    // no top bounce; allow exiting top, removal handled in game.update()

    // Mark immediately if ball has exited any world boundary
    if (
      (b.x + b.r) < bounds.xMin ||
      (b.x - b.r) > bounds.xMax ||
      (b.y + b.r) < bounds.yMin ||
      (b.y - b.r) > bounds.yMax
    ) {
      b._oob = true;
      continue; // skip further processing this step
    }

    // Sliding along curves: find closest segment within contact range
    let best = null; // { a,c,q,dist,tx,ty,nx,ny }
    for (const curve of curves) {
      const pts = curve.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const c = pts[i + 1];
        if (!a || !c) continue;
        // broad-phase AABB
        const minx = Math.min(a.x, c.x) - b.r - 0.05;
        const maxx = Math.max(a.x, c.x) + b.r + 0.05;
        const miny = Math.min(a.y, c.y) - b.r - 0.05;
        const maxy = Math.max(a.y, c.y) + b.r + 0.05;
        if (b.x < minx || b.x > maxx || b.y < miny || b.y > maxy) continue;

        const q = closestPointOnSegment(b.x, b.y, a.x, a.y, c.x, c.y);
        const dx = b.x - q.x;
        const dy = b.y - q.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= b.r + 0.02) {
          const sx = c.x - a.x, sy = c.y - a.y;
          const tnorm = normalize(sx, sy);
          // normal direction from surface toward ball
          let nx, ny;
          const guessN = normalize(-tnorm.y, tnorm.x);
          if (dx * guessN.x + dy * guessN.y >= 0) { nx = guessN.x; ny = guessN.y; }
          else { nx = -guessN.x; ny = -guessN.y; }
          best = { a, c, q, dist, tx: tnorm.x, ty: tnorm.y, nx, ny };
        }
      }
    }

    if (best) {
      // Constrain ball to surface and slide
      const { q, nx, ny, tx, ty, dist } = best;
      // Snap to just above surface
      const penetration = (b.r - dist) + 1e-4;
      if (penetration > 0) {
        b.x += nx * penetration;
        b.y += ny * penetration;
      } else {
        // place on surface rim if slightly outside
        b.x = q.x + nx * (b.r + 1e-4);
        b.y = q.y + ny * (b.r + 1e-4);
      }

      // Decompose velocity into tangent/normal
      const vt = b.vx * tx + b.vy * ty;
      // normal component is discarded (no bounce)
      // Apply tangential acceleration due to gravity
      const gx = 0, gy = gravity; // gravity vector in world
      const gt = gx * tx + gy * ty;
      let newVt = vt + gt * dt;
      // friction
      newVt *= 0.995;
      // reconstruct velocity along tangent only
      b.vx = newVt * tx;
      b.vy = newVt * ty;

      // integrate along surface
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    } else {
      // free integrate when not on any surface
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
  }
}

export function checkStarCollection(balls, stars, radius = 0.3) {
  let collectedCount = 0;
  let newlyCollected = false;
  
  for (const s of stars) {
    if (s.collected) { 
      collectedCount++; 
      continue; 
    }
    
    for (const b of balls) {
      const d = Math.hypot(b.x - s.x, b.y - s.y);
      if (d <= (b.r + radius)) {
        // Star wasn't collected before but is now
        if (!s.collected) {
          newlyCollected = true;
          
          // Add collection animation
          s.collected = true;
          s.collectedTime = performance.now();
          s.collectionScale = 1.5; // Initial scale for animation
          
          // Add points to the ball that collected it
          b.collected = true;
          b.collectionTime = performance.now();
        }
        
        collectedCount++;
        break;
      }
    }
  }
  
  // Return both the count and whether any new stars were collected this frame
  return {
    count: collectedCount,
    newlyCollected: newlyCollected
  };
}
