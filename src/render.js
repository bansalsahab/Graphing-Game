// Rendering: grid, axes, balls, stars, curves
import { World } from './utils.js';

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
  }

  clear() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  drawGrid() {
    const { ctx, world } = this;
    const { xMin, xMax, yMin, yMax } = world;

    // background
    ctx.fillStyle = '#0b1520';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // grid lines
    ctx.lineWidth = 1;
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
      const p0 = world.toPixel(x, yMin);
      const p1 = world.toPixel(x, yMax);
      ctx.strokeStyle = x === 0 ? '#ffffff' : '#1e3954';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
      const p0 = world.toPixel(xMin, y);
      const p1 = world.toPixel(xMax, y);
      ctx.strokeStyle = y === 0 ? '#ffffff' : '#1e3954';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // axis labels (simple)
    ctx.fillStyle = '#b6c6e3';
    ctx.font = '12px system-ui, Arial';
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
      const p = world.toPixel(x, 0);
      ctx.fillText(String(x), p.x + 2, p.y - 2);
    }
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
      const p = world.toPixel(0, y);
      ctx.fillText(String(y), p.x + 4, p.y - 2);
    }
  }

  drawCurve(points, color = '#4ade80', thickness = 2, dashed = false) {
    const { ctx, world } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    if (dashed) ctx.setLineDash([8, 6]); else ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    for (const pt of points) {
      if (!pt) { started = false; continue; }
      const p = world.toPixel(pt.x, pt.y);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
  }

  drawBeginnerLine() {
    if (!this.game.beginnerLine) return;
    
    const xMin = this.game.world.xMin;
    const xMax = this.game.world.xMax;
    const { type } = this.game.beginnerLine;
    
    // Draw a dashed line based on the pattern type
    this.ctx.save();
    this.ctx.setLineDash([5, 5]);
    this.ctx.strokeStyle = 'rgba(100, 100, 255, 0.3)'; // More subtle hint
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    
    // Sample points for the curve based on pattern type
    const numPoints = 100;
    let firstPoint = true;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const x = xMin + t * (xMax - xMin);
      let y;
      
      if (type === 'linear') {
        const { m, b } = this.game.beginnerLine;
        y = m * x + b;
      } else if (type === 'quadratic') {
        const { a, b, c } = this.game.beginnerLine;
        y = a * x * x + b * x + c;
      } else if (type === 'sin') {
        const { a, b, c } = this.game.beginnerLine;
        y = a * Math.sin(b * x) + c;
      }
      
      const [pixelX, pixelY] = this.world.worldToPixel(x, y);
      
      if (firstPoint) {
        this.ctx.moveTo(pixelX, pixelY);
        firstPoint = false;
      } else {
        this.ctx.lineTo(pixelX, pixelY);
      }
    }
    
    this.ctx.stroke();
    this.ctx.restore();
    
    // Draw a hint text
    this.ctx.save();
    this.ctx.font = '14px Arial';
    this.ctx.fillStyle = 'rgba(100, 100, 255, 0.7)';
    const textX = this.canvas.width / 2;
    const textY = 20;
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Try to collect all stars with your own curve', textX, textY);
    this.ctx.restore();
  }

  drawBall(ball, color = '#60a5fa') {
    const { ctx, world } = this;
    const p = world.toPixel(ball.x, ball.y);
    const r = ball.r * (this.canvas.width / (world.xMax - world.xMin));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    // small highlight
    ctx.fillStyle = '#cfe3ff';
    ctx.beginPath();
    ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStar(star) {
    const { ctx, world } = this;
    const p = world.toPixel(star.x, star.y);
    let size = 10;
    
    // Handle collection animation
    if (star.collected && star.collectedTime) {
      const elapsed = performance.now() - star.collectedTime;
      const animDuration = 500; // ms
      
      if (elapsed < animDuration) {
        // Scale effect during collection animation
        const progress = elapsed / animDuration;
        const scale = 1.5 - (progress * 0.5); // Start larger, shrink down
        size *= scale;
        
        // Fade out effect
        ctx.globalAlpha = 1 - (progress * 0.75);
      } else {
        // After animation completes, show collected state
        ctx.globalAlpha = 0.25;
      }
    }
    
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(performance.now() * 0.001);
    ctx.fillStyle = star.collected ? 'rgba(255, 215, 0, 0.25)' : '#ffd700';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5;
      const r1 = size;
      const r2 = size * 0.45;
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a + Math.PI / 5) * r2, Math.sin(a + Math.PI / 5) * r2);
    }
    ctx.closePath();
    ctx.fill();
    
    // Add glow effect for uncollected stars
    if (!star.collected) {
      const glow = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.5);
      glow.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
      glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
    ctx.globalAlpha = 1.0; // Reset alpha
  }

  drawDropper() {
    const [x, y] = this.world.worldToPixel(this.game.dropX, this.world.yMax);
    
    // Draw the dropper with a handle to indicate it's draggable
    this.ctx.save();
    
    // Draw a vertical line from top to the dropper
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    this.ctx.setLineDash([3, 3]);
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    
    // Draw the dropper circle
    this.ctx.beginPath();
    this.ctx.setLineDash([]);
    
    // Use a different color when being moved
    if (this.game.isMovingDropper) {
      this.ctx.fillStyle = '#f59e0b'; // Amber color when active
      this.ctx.strokeStyle = '#d97706';
    } else {
      this.ctx.fillStyle = '#60a5fa'; // Blue color when inactive
      this.ctx.strokeStyle = '#3b82f6';
    }
    
    this.ctx.lineWidth = 2;
    this.ctx.arc(x, y, this.game.dropperRadius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Draw a grip handle to indicate draggability
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.moveTo(x - 4, y);
    this.ctx.lineTo(x + 4, y);
    this.ctx.moveTo(x, y - 4);
    this.ctx.lineTo(x, y + 4);
    this.ctx.stroke();
    
    // Add tooltip text
    this.ctx.font = '12px Arial';
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Drag to move', x, y - 15);
    
    this.ctx.restore();
  }
}
