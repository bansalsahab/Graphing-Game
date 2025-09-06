// Equation parsing and sampling utilities
// Converts user input like "y = 0.5x + 2" or "y = -0.1x^2 + 3x - 4"
// into a function f(x) and its derivative f'(x) for physics reflections.

const ALLOWED_IDENTIFIERS = new Set([
  'x','y',
  // Math constants
  'PI', 'E',
  // Math functions
  'sin','cos','tan','asin','acos','atan','atan2',
  'abs','sqrt','pow','log','exp','min','max',
  'floor','ceil','round','sign',
]);

function sanitizeExpression(input) {
  let expr = input.trim();
  // Remove leading 'y =' or 'x =' if present
  expr = expr.replace(/^[yx]\s*=\s*/i, '');
  // replace caret with exponent operator
  expr = expr.replace(/\^/g, '**');
  // Replace ln( with log( base e
  expr = expr.replace(/\bln\s*\(/gi, 'log(');
  // Implicit multiplication fixes:
  // 2x -> 2*x, 2y -> 2*y
  expr = expr.replace(/(\d)\s*([xy])\b/gi, '$1*$2');
  // x2 -> x*2, y2 -> y*2
  expr = expr.replace(/\b([xy])\s*(\d)/gi, '$1*$2');
  // x( -> x*( , y( -> y*(
  expr = expr.replace(/\b([xy])\s*\(/gi, '$1*(');
  // )x -> )*x, )y -> )*y
  expr = expr.replace(/\)\s*([xy])\b/gi, ')*$1');
  // )( -> )*(
  expr = expr.replace(/\)\s*\(/g, ')*(');
  return expr;
}

function validateCondition(expr) {
  // Allow comparisons and logical ops too
  const invalid = /[^0-9+\-*/^()\. ,a-zA-Z_<>!=&|]/.test(expr);
  if (invalid) throw new Error('Invalid characters in condition');
  const idRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
  const found = expr.match(idRegex) || [];
  for (const id of found) {
    if (!ALLOWED_IDENTIFIERS.has(id)) {
      throw new Error(`Unknown identifier in condition: ${id}`);
    }
  }
}

function extractCondition(raw) {
  // Supports trailing { condition } at the end
  const m = raw.match(/\{([^}]*)\}\s*$/);
  if (!m) return { base: raw, condSrc: null };
  const condSrc = m[1].trim();
  const base = raw.slice(0, m.index).trim();
  return { base, condSrc };
}

// Sample for x = g(y), producing polyline points {x:g(y), y}
export function sampleCurveY(g, yMin, yMax, step = 0.1, cond = null) {
  const MAX_DEPTH = 12;
  const TOL = 0.01;
  const MAX_X = 1e6;

  const pts = [];

  function safeEval(y) {
    try {
      const x = g(y);
      if (!Number.isFinite(x)) return null;
      if (Math.abs(x) > MAX_X) return null;
      if (cond && !cond(x, y)) return null;
      return x;
    } catch {
      return null;
    }
  }

  function addBreak() { if (pts.length === 0 || pts[pts.length - 1] !== null) pts.push(null); }

  function subdivide(y0, x0, y1, x1, depth) {
    if (x0 === null && x1 === null) { addBreak(); return; }
    if (x0 === null || x1 === null) {
      if (depth >= MAX_DEPTH) { addBreak(); return; }
      const ym = 0.5 * (y0 + y1);
      const xm = safeEval(ym);
      subdivide(y0, x0, ym, xm, depth + 1);
      subdivide(ym, xm, y1, x1, depth + 1);
      return;
    }
    const ym = 0.5 * (y0 + y1);
    const xm = safeEval(ym);
    if (xm === null) {
      if (depth >= MAX_DEPTH) { addBreak(); return; }
      subdivide(y0, x0, ym, xm, depth + 1);
      subdivide(ym, xm, y1, x1, depth + 1);
      return;
    }
    // straight-line approx in x(y)
    const xl = x0 + (x1 - x0) * ((ym - y0) / (y1 - y0));
    const err = Math.abs(xm - xl);
    const steepJump = Math.abs(x1 - x0) > 10 / Math.max(1e-6, (y1 - y0));
    if ((err > TOL || steepJump) && depth < MAX_DEPTH) {
      subdivide(y0, x0, ym, xm, depth + 1);
      subdivide(ym, xm, y1, x1, depth + 1);
    } else {
      if (pts.length === 0 || pts[pts.length - 1] === null) pts.push({ x: x0, y: y0 });
      const last = pts[pts.length - 1];
      if (!last || last === null || Math.abs(ym - last.y) > 1e-9) pts.push({ x: xm, y: ym });
      if (Math.abs(y1 - ym) > 1e-9) pts.push({ x: x1, y: y1 });
    }
  }

  const coarse = Math.max(step, (yMax - yMin) / 64);
  let y0 = yMin;
  let x0 = safeEval(y0);
  for (let y1 = Math.min(y0 + coarse, yMax); y0 < yMax + 1e-9; y1 = Math.min(y1 + coarse, yMax)) {
    const x1 = safeEval(y1);
    subdivide(y0, x0, y1, x1, 0);
    y0 = y1;
    x0 = x1;
    if (y1 >= yMax) break;
  }

  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p === null) {
      if (out.length && out[out.length - 1] !== null) out.push(null);
    } else {
      if (!out.length || out[out.length - 1] === null || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > 1e-9) out.push(p);
    }
  }
  return out;
}

function validateExpression(expr) {
  // Very basic validation: allowed chars and identifiers
  // Allow numbers, operators, parentheses, dots, commas, spaces, and letters for allowed functions
  const invalid = /[^0-9+\-*/^()\. ,a-zA-Z_]/.test(expr);
  if (invalid) throw new Error('Invalid characters in expression');

  // Tokenize identifiers and ensure they are allowed or numbers/operators
  const idRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
  const found = expr.match(idRegex) || [];
  for (const id of found) {
    if (!ALLOWED_IDENTIFIERS.has(id)) {
      throw new Error(`Unknown identifier: ${id}`);
    }
  }
}

function buildFunction(expr) {
  // Build f(x) with Math in scope
  // We pass Math as a param to restrict access
  try {
    const f = new Function(
      'x',
      'Math',
      `"use strict";
       const { PI, E, sin, cos, tan, asin, acos, atan, atan2, abs, sqrt, pow, log, exp, min, max, floor, ceil, round, sign } = Math;
       return (${expr});`
    );
    return (x) => f(x, Math);
  } catch (e) {
    throw new Error('Failed to parse expression');
  }
}

function buildDerivative(expr) {
  // Numerical derivative using central difference
  const f = buildFunction(expr);
  const h = 1e-4;
  return (x) => (f(x + h) - f(x - h)) / (2 * h);
}

// Build function for x = g(y)
function buildFunctionForY(expr) {
  try {
    const g = new Function(
      'y',
      'Math',
      `"use strict";
       const { PI, E, sin, cos, tan, asin, acos, atan, atan2, abs, sqrt, pow, log, exp, min, max, floor, ceil, round, sign } = Math;
       return (${expr});`
    );
    return (y) => g(y, Math);
  } catch (e) {
    throw new Error('Failed to parse expression for x as a function of y');
  }
}

function buildDerivativeForY(expr) {
  const g = buildFunctionForY(expr);
  const h = 1e-4;
  return (y) => (g(y + h) - g(y - h)) / (2 * h);
}

export function parseEquationToFunction(input) {
  let raw = input.trim();
  const { base, condSrc } = extractCondition(raw);
  // Detect orientation using the base part
  const isXofY = /^x\s*=/.test(base.toLowerCase());

  // Build condition function if provided
  let cond = null;
  if (condSrc && condSrc.length) {
    const condExpr = sanitizeExpression(condSrc); // reuse for implicit mult and caret
    validateCondition(condExpr);
    try {
      const cfun = new Function(
        'x','y','Math',
        `"use strict";
         const { PI, E, sin, cos, tan, asin, acos, atan, atan2, abs, sqrt, pow, log, exp, min, max, floor, ceil, round, sign } = Math;
         return !!(${condExpr});`
      );
      cond = (x,y) => {
        try { return !!cfun(x,y,Math); } catch { return false; }
      };
    } catch (e) {
      throw new Error('Failed to parse condition');
    }
  }

  const expr = sanitizeExpression(base);
  validateExpression(expr);
  if (isXofY) {
    const g = buildFunctionForY(expr); // expects variable 'y'
    const dg = buildDerivativeForY(expr);
    return { expr, f: g, df: dg, type: 'xOfY', cond };
  } else {
    const f = buildFunction(expr);
    const df = buildDerivative(expr);
    return { expr, f, df, type: 'yOfX', cond };
  }
}

export function sampleCurve(f, xMin, xMax, step = 0.1, cond = null) {
  // Adaptive sampling with discontinuity detection
  const MAX_DEPTH = 12;
  const TOL = 0.01; // acceptable deviation from straight line
  const MAX_Y = 1e6; // clamp for sanity

  const pts = [];

  function safeEval(x) {
    try {
      const y = f(x);
      if (!Number.isFinite(y)) return null;
      if (Math.abs(y) > MAX_Y) return null;
      if (cond && !cond(x, y)) return null;
      return y;
    } catch {
      return null;
    }
  }

  function addBreak() {
    if (pts.length === 0 || pts[pts.length - 1] !== null) pts.push(null);
  }

  function subdivide(x0, y0, x1, y1, depth) {
    // If either end invalid, try to localize the break
    if (y0 === null && y1 === null) { addBreak(); return; }
    if (y0 === null) {
      if (depth >= MAX_DEPTH) { addBreak(); return; }
      const xm = 0.5 * (x0 + x1);
      const ym = safeEval(xm);
      subdivide(x0, y0, xm, ym, depth + 1);
      subdivide(xm, ym, x1, y1, depth + 1);
      return;
    }
    if (y1 === null) {
      if (depth >= MAX_DEPTH) { addBreak(); return; }
      const xm = 0.5 * (x0 + x1);
      const ym = safeEval(xm);
      subdivide(x0, y0, xm, ym, depth + 1);
      subdivide(xm, ym, x1, y1, depth + 1);
      return;
    }

    // Both valid: check straight-line approximation using midpoint error
    const xm = 0.5 * (x0 + x1);
    const ym = safeEval(xm);
    if (ym === null) {
      if (depth >= MAX_DEPTH) { addBreak(); return; }
      subdivide(x0, y0, xm, ym, depth + 1);
      subdivide(xm, ym, x1, y1, depth + 1);
      return;
    }

    // linear interpolation at mid
    const yl = y0 + (y1 - y0) * ((xm - x0) / (x1 - x0));
    const err = Math.abs(ym - yl);
    const steepJump = Math.abs(y1 - y0) > 10 / Math.max(1e-6, (x1 - x0));
    if ((err > TOL || steepJump) && depth < MAX_DEPTH) {
      subdivide(x0, y0, xm, ym, depth + 1);
      subdivide(xm, ym, x1, y1, depth + 1);
    } else {
      // Accept segment: push start if needed, then mid, end will be pushed by caller chain
      if (pts.length === 0 || pts[pts.length - 1] === null) pts.push({ x: x0, y: y0 });
      // ensure monotonic x ordering and avoid duplicates
      const last = pts[pts.length - 1];
      if (!last || last === null || Math.abs(xm - last.x) > 1e-9) pts.push({ x: xm, y: ym });
      if (Math.abs(x1 - xm) > 1e-9) pts.push({ x: x1, y: y1 });
    }
  }

  // Start with coarse stepping but allow refinement per segment
  const coarse = Math.max(step, (xMax - xMin) / 64);
  let x0 = xMin;
  let y0 = safeEval(x0);
  for (let x1 = Math.min(x0 + coarse, xMax); x0 < xMax + 1e-9; x1 = Math.min(x1 + coarse, xMax)) {
    const y1 = safeEval(x1);
    subdivide(x0, y0, x1, y1, 0);
    x0 = x1;
    y0 = y1;
    if (x1 >= xMax) break;
  }

  // Clean up duplicates and excessive nulls
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p === null) {
      if (out.length && out[out.length - 1] !== null) out.push(null);
    } else {
      if (!out.length || out[out.length - 1] === null || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > 1e-9) {
        out.push(p);
      }
    }
  }
  return out;
}
