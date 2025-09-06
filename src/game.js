// Game orchestration: state, UI bindings, loop
import { World, randRange } from './utils.js';
import { Renderer } from './render.js';
import { parseEquationToFunction, sampleCurve, sampleCurveY } from './equations.js';
import { Ball, updateBalls, checkStarCollection } from './physics.js';

export class Game {
  constructor(canvas, statusEls) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = new World();
    this.renderer = new Renderer(canvas, this.world);

    this.balls = [];
    this.stars = [];
    this.curves = []; // { expr, f, df, points, color }
    this.preview = null; // { expr, f, df, points }

    // Negative gravity because increasing world-y goes up on the canvas
    this.gravity = -20.0; // stronger gravity for faster fall
    this.spawnTimer = 0;
    this.spawnInterval = 0.08; // rapid succession between drops
    this.burstTotal = 20; // total balls per burst
    this.spawned = 0; // spawned in current burst
    this.launched = false; // only spawn when user triggers
    this.dropX = 0; // drop position on x-axis (can be changed)
    this.isMovingDropper = false; // track if user is moving the dropper

    this.level = 1;
    this.mode = 'beginner'; // 'beginner' | 'pro'
    this.statusEls = statusEls; // { starsStatusEl, levelStatusEl }

    this.resize();
    this.generateStars(5);
    // Seed helper in beginner mode
    if (this.mode === 'beginner') this.seedBeginnerHelper();
    this.updateStatus();
  }

  resize() {
    // Keep internal world bounds centered and proportional to canvas aspect
    const aspect = this.canvas.width / this.canvas.height;
    const yHalf = 8;
    const xHalf = yHalf * aspect;
    this.world.xMin = -xHalf;
    this.world.xMax = xHalf;
    this.world.yMin = -yHalf;
    this.world.yMax = yHalf;
    this.world.setCanvasSize(this.canvas.width, this.canvas.height);
    // Keep dropper centered (can be changed later via UI if needed)
    this.dropX = 0;
  }

  generateStars(n) {
    this.stars = [];
    this.beginnerLine = null;
    if (this.mode === 'beginner') {
      // Create a more interesting pattern for stars in beginner mode
      // Use a quadratic or sinusoidal pattern instead of just a line
      const patternType = Math.floor(Math.random() * 3); // 0: quadratic, 1: sinusoidal, 2: linear
      
      // Evenly spaced x positions across the world with small jitter
      const margin = 0.8;
      const xMin = this.world.xMin * margin;
      const xMax = this.world.xMax * margin;
      
      // Parameters for the patterns
      const midY = (this.world.yMin + this.world.yMax) / 2;
      const amplitude = (this.world.yMax - this.world.yMin) * 0.25;
      
      // Generate stars based on pattern type
      if (patternType === 0) {
        // Quadratic pattern: y = a*x^2 + b*x + c
        const a = randRange(-0.2, 0.2);
        const b = randRange(-1, 1);
        const c = midY;
        this.beginnerLine = { type: 'quadratic', a, b, c };
        
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          let x = xMin + t * (xMax - xMin);
          x += randRange(-0.2, 0.2);
          let y = a * x * x + b * x + c + randRange(-0.3, 0.3);
          // clamp to world vertically
          y = Math.max(this.world.yMin * 0.9, Math.min(this.world.yMax * 0.9, y));
          this.stars.push({ x, y, collected: false });
        }
      } else if (patternType === 1) {
        // Sinusoidal pattern: y = a*sin(b*x) + c
        const a = amplitude;
        const b = randRange(0.5, 1.5);
        const c = midY;
        this.beginnerLine = { type: 'sin', a, b, c };
        
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          let x = xMin + t * (xMax - xMin);
          x += randRange(-0.2, 0.2);
          let y = a * Math.sin(b * x) + c + randRange(-0.3, 0.3);
          // clamp to world vertically
          y = Math.max(this.world.yMin * 0.9, Math.min(this.world.yMax * 0.9, y));
          this.stars.push({ x, y, collected: false });
        }
      } else {
        // Linear pattern: y = m*x + b (but with more variation)
        const slopes = [-1.5, -1, -0.5, 0.5, 1, 1.5];
        const m = slopes[Math.floor(Math.random() * slopes.length)];
        const b = midY;
        this.beginnerLine = { type: 'linear', m, b };
        
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          let x = xMin + t * (xMax - xMin);
          x += randRange(-0.3, 0.3);
          let y = m * x + b + randRange(-0.4, 0.4);
          // clamp to world vertically
          y = Math.max(this.world.yMin * 0.9, Math.min(this.world.yMax * 0.9, y));
          this.stars.push({ x, y, collected: false });
        }
      }
      
      // Set initial drop position to a strategic point
      // For beginner, we'll set it to a position that makes the challenge interesting
      // but not impossible
      const starXs = this.stars.map(s => s.x);
      const minStarX = Math.min(...starXs);
      const maxStarX = Math.max(...starXs);
      
      // Choose a drop position that requires some curve drawing
      // but not too far from the stars
      this.dropX = (minStarX + maxStarX) / 2;
      
      // Add some randomness to make it more interesting
      this.dropX += randRange(-1, 1);
      
      // Ensure it's within bounds
      this.dropX = Math.max(this.world.xMin + 0.5, Math.min(this.world.xMax - 0.5, this.dropX));
      return;
    }
    
    // Pro or default: random stars with more interesting patterns
    const usePattern = Math.random() < 0.7; // 70% chance to use a pattern
    
    if (usePattern) {
      // Create a cluster or line of stars
      const centerX = randRange(this.world.xMin * 0.6, this.world.xMax * 0.6);
      const centerY = randRange(this.world.yMin * 0.3, this.world.yMax * 0.6);
      const spread = randRange(1, 3);
      
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2; // Circular arrangement
        const distance = randRange(0.5, spread);
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        // Ensure within bounds
        if (x > this.world.xMin && x < this.world.xMax && 
            y > this.world.yMin && y < this.world.yMax) {
          this.stars.push({ x, y, collected: false });
        } else {
          // If out of bounds, create a random star instead
          const x = randRange(this.world.xMin * 0.8, this.world.xMax * 0.8);
          const y = randRange(this.world.yMin * 0.2, this.world.yMax * 0.6);
          this.stars.push({ x, y, collected: false });
        }
      }
    } else {
      // Completely random stars
      for (let i = 0; i < n; i++) {
        const x = randRange(this.world.xMin * 0.8, this.world.xMax * 0.8);
        const y = randRange(this.world.yMin * 0.2, this.world.yMax * 0.6);
        this.stars.push({ x, y, collected: false });
      }
    }
    
    // For non-beginner, drop over a strategic position
    if (this.stars.length) {
      // Choose a position that makes the game challenging
      const starXs = this.stars.map(s => s.x);
      const minStarX = Math.min(...starXs);
      const maxStarX = Math.max(...starXs);
      
      // Set drop position to be slightly offset from the center of stars
      const meanX = this.stars.reduce((a,s)=>a+s.x,0) / this.stars.length;
      this.dropX = meanX + randRange(-2, 2);
      
      // Ensure it's within bounds
      this.dropX = Math.max(this.world.xMin + 0.5, Math.min(this.world.xMax - 0.5, this.dropX));
    }
  }

  reset() {
    this.balls = [];
    this.curves = [];
    this.preview = null;
    this.generateStars(5);
    // reset burst
    this.spawnTimer = 0;
    this.spawned = 0;
    this.launched = false;
    // if beginner, re-seed helper curve
    if (this.mode === 'beginner') this.seedBeginnerHelper();
    this.updateStatus();
  }

  submitEquation(inputStr) {
    try {
      const parsed = parseEquationToFunction(inputStr);
      let points;
      if (parsed.type === 'xOfY') {
        points = sampleCurveY(parsed.f, this.world.yMin, this.world.yMax, 0.05, parsed.cond);
      } else {
        points = sampleCurve(parsed.f, this.world.xMin, this.world.xMax, 0.05, parsed.cond);
      }
      const color = this.pickCurveColor();
      this.curves.push({ expr: parsed.expr, f: parsed.f, df: parsed.df, points, color, thickness: 2 });
      // keep preview but do not force-clear; user may continue typing a new one
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  pickCurveColor() {
    const palette = ['#4ade80', '#f472b6', '#fbbf24', '#60a5fa', '#a78bfa'];
    return palette[this.curves.length % palette.length];
  }

  spawnBall() {
    const x = this.dropX; // fixed drop location
    const y = this.world.yMax - 0.5; // top
    const b = new Ball(x, y, 0.12); // smaller balls
    b.vx = 0; // drop straight down from the dropper
    b.vy = 0;
    this.balls.push(b);
    this.spawned++;
  }

  update(dt) {
    // spawn balls (only when launched)
    if (this.launched) {
      this.spawnTimer += dt;
      if (this.spawned < this.burstTotal && this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.spawnBall();
      }
      if (this.spawned >= this.burstTotal) {
        // stop spawning after burst completes
        this.launched = false;
      }
    }

    // integrate physics
    updateBalls(this.balls, dt, this.gravity, this.world, this.curves);

    // remove balls that exit world bounds: left, right, bottom, or top
    const { xMin, xMax, yMin, yMax } = this.world;
    const pad = 0.0; // cull as soon as they touch/exceed boundary
    this.balls = this.balls.filter(b => {
      if (b._oob) return false;
      const aboveBottom = (b.y + b.r) >= (yMin - pad);
      const belowTop = (b.y - b.r) <= (yMax + pad);
      const insideLeft = (b.x + b.r) >= (xMin - pad);
      const insideRight = (b.x - b.r) <= (xMax + pad);
      return aboveBottom && belowTop && insideLeft && insideRight;
    });

    // trim balls that fall too long (prevent perf issues)
    if (this.balls.length > 150) this.balls.splice(0, this.balls.length - 150);

    // stars collection
    const starResult = checkStarCollection(this.balls, this.stars, 0.35);
    this.updateStatus();
    
    // Play sound or show visual feedback when stars are collected
    if (starResult.newlyCollected) {
      this.showStarCollectionFeedback();
    }

    if (starResult.count === this.stars.length && this.stars.length > 0) {
      // level complete: small pause then new level
      this.level++;
      this.generateStars(5 + Math.min(5, this.level));
      // reset burst for new level
      this.spawnTimer = 0;
      this.spawned = 0;
      this.launched = false; // wait for user to launch again
      // if beginner, seed a new helper for the new star layout
      if (this.mode === 'beginner') this.seedBeginnerHelper();
      
      // Show level completion message
      this.showLevelCompletionMessage();
    }
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.drawGrid();

    for (const curve of this.curves) {
      r.drawCurve(curve.points, curve.color, 2);
    }
    if (this.preview?.points) {
      r.drawCurve(this.preview.points, '#93c5fd', 2, true);
    }
    // draw dropper marker
    this.renderer.drawDropper(this.dropX);
    for (const s of this.stars) r.drawStar(s);
    for (const b of this.balls) r.drawBall(b);
  }

  updateStatus() {
    const total = this.stars.length;
    const collected = this.stars.filter(s => s.collected).length;
    if (this.statusEls?.starsStatusEl) this.statusEls.starsStatusEl.textContent = `Stars: ${collected}/${total}`;
    if (this.statusEls?.levelStatusEl) this.statusEls.levelStatusEl.textContent = `Level ${this.level}`;
  }

  // Live preview handling
  setPreviewEquation(inputStr) {
    if (!inputStr || !inputStr.trim()) { this.preview = null; return; }
    try {
      const parsed = parseEquationToFunction(inputStr);
      let points;
      if (parsed.type === 'xOfY') {
        points = sampleCurveY(parsed.f, this.world.yMin, this.world.yMax, 0.05, parsed.cond);
      } else {
        points = sampleCurve(parsed.f, this.world.xMin, this.world.xMax, 0.05, parsed.cond);
      }
      this.preview = { expr: parsed.expr, f: parsed.f, df: parsed.df, points };
    } catch (e) {
      // invalid expression => no preview
      this.preview = null;
    }
  }

  // Public: trigger a new burst of balls
  launchBurst(count = this.burstTotal) {
    this.burstTotal = count;
    this.spawned = 0;
    this.spawnTimer = 0;
    this.launched = true;
  }
  
  // Move the dropper to a new x position
  moveDropper(x) {
    // Constrain to world bounds with a small margin
    this.dropX = Math.max(this.world.xMin + 0.5, Math.min(this.world.xMax - 0.5, x));
    
    // If we're in beginner mode, we might want to provide feedback
    // about the dropper position relative to the stars
    if (this.mode === 'beginner' && this.stars.length > 0) {
      // Calculate average star x position
      const avgStarX = this.stars.reduce((sum, star) => sum + star.x, 0) / this.stars.length;
      // Could provide visual or audio feedback based on distance
      const distance = Math.abs(this.dropX - avgStarX);
      // This could be used for a hint system in the future
    }
  }

  // Mode switching
  setMode(mode) {
    if (mode !== 'beginner' && mode !== 'pro') return null;
    this.mode = mode;
    // clear and reseed
    this.balls = [];
    this.curves = [];
    this.preview = null;
    this.spawnTimer = 0;
    this.spawned = 0;
    this.launched = false;
    this.generateStars(5 + Math.min(5, this.level));
    if (this.mode === 'beginner') {
      return this.seedBeginnerHelper();
    }
    return null;
  }

  // Beginner helper: build a simple line approximating star positions
  seedBeginnerHelper() {
    if (!this.stars.length) return null;
    // If a beginner target line was chosen during star generation, use it for the helper
    if (this.beginnerLine) {
      const { m, b } = this.beginnerLine;
      const eq = `y = ${m.toFixed(2)}x + ${b.toFixed(2)}`;
      this.submitEquation(eq);
      return eq;
    }
    // Fallback: linear regression y = m x + b from current stars
    let sumx = 0, sumy = 0, sumxy = 0, sumx2 = 0;
    const n = this.stars.length;
    for (const s of this.stars) { sumx += s.x; sumy += s.y; sumxy += s.x * s.y; sumx2 += s.x * s.x; }
    const denom = (n * sumx2 - sumx * sumx) || 1e-6;
    let m = (n * sumxy - sumx * sumy) / denom;
    let b = (sumy - m * sumx) / n;
    m = Math.max(-2, Math.min(2, m));
    b = Math.max(this.world.yMin * 0.8, Math.min(this.world.yMax * 0.8, b));
    const eq = `y = ${m.toFixed(2)}x + ${b.toFixed(2)}`;
    this.submitEquation(eq);
    return eq;
  }
  
  // Visual feedback when stars are collected
  showStarCollectionFeedback() {
    // Create a temporary visual effect on the canvas
    const starEffect = {
      time: performance.now(),
      duration: 1000, // ms
      active: true
    };
    
    // Add to effects list if we don't already have one
    if (!this.visualEffects) this.visualEffects = [];
    this.visualEffects.push(starEffect);
    
    // Play a sound if audio is available
    this.playCollectionSound();
  }
  
  // Play a sound when stars are collected
  playCollectionSound() {
    try {
      // Create a simple sound using Web Audio API
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.2); // A4
      
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      // Silently fail if audio isn't supported
      console.log("Audio not supported");
    }
  }
  
  // Show level completion message
  showLevelCompletionMessage() {
    // Create a level completion message element
    const messageContainer = document.createElement('div');
    messageContainer.style.position = 'absolute';
    messageContainer.style.top = '50%';
    messageContainer.style.left = '50%';
    messageContainer.style.transform = 'translate(-50%, -50%)';
    messageContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    messageContainer.style.color = 'white';
    messageContainer.style.padding = '20px';
    messageContainer.style.borderRadius = '10px';
    messageContainer.style.fontSize = '24px';
    messageContainer.style.textAlign = 'center';
    messageContainer.style.zIndex = '1000';
    messageContainer.style.animation = 'fadeInOut 2s forwards';
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; }
        20% { opacity: 1; }
        80% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    
    messageContainer.textContent = `Level ${this.level - 1} Complete! Starting Level ${this.level}`;
    document.body.appendChild(messageContainer);
    
    // Remove the message after animation completes
    setTimeout(() => {
      document.body.removeChild(messageContainer);
    }, 2000);
  }
}
