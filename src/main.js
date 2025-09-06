import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
const starsStatusEl = document.getElementById('stars-status');
const levelStatusEl = document.getElementById('level-status');
const equationForm = document.getElementById('equation-form');
const equationInput = document.getElementById('equation-input');
const resetBtn = document.getElementById('reset-btn');
const launchBtn = document.getElementById('launch-btn');
const levelSelect = document.getElementById('level-select');

const game = new Game(canvas, { starsStatusEl, levelStatusEl });

function onResize() {
  // Keep canvas pixel size in sync with CSS size for crisp rendering
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(rect.width * dpr);
  const height = Math.floor(rect.height * dpr);
  let changed = false;
  if (canvas.width !== width) { canvas.width = width; changed = true; }
  if (canvas.height !== height) { canvas.height = height; changed = true; }
  if (changed) game.resize();
}
window.addEventListener('resize', onResize);
// Initial resize to account for layout
onResize();

// Initialize mode based on selector and populate helper equation if any
initializeModeFromUI();
function initializeModeFromUI() {
  if (!levelSelect) return;
  const eq = game.setMode(levelSelect.value);
  if (eq) {
    equationInput.value = eq;
    game.setPreviewEquation(eq);
    // Ensure the helper line is actually drawn
    if (game.curves.length === 0) {
      game.submitEquation(eq);
    }
  } else {
    equationInput.value = '';
    game.setPreviewEquation('');
  }
}
levelSelect?.addEventListener('change', () => {
  initializeModeFromUI();
});

// UI: submit equation
EquationFormHandler();
function EquationFormHandler() {
  equationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = (equationInput.value || '').trim();
    if (!value) return;
    
    // Basic validation before submitting
    if (!value.includes('=')) {
      showEquationError('Equation must include an equals sign (=)');
      return;
    }
    
    const result = game.submitEquation(value);
    if (!result.ok) {
      showEquationError(result.error);
    } else {
      equationInput.value = '';
      // After submitting, keep preview empty until user starts typing again
      game.setPreviewEquation('');
      // Show success feedback
      showSuccessFeedback();
    }
  });
  
  // Helper function to show equation errors
  function showEquationError(message) {
    equationInput.classList.add('error');
    equationInput.title = message;
    
    // Create or update error message element
    let errorMsg = document.getElementById('equation-error');
    if (!errorMsg) {
      errorMsg = document.createElement('div');
      errorMsg.id = 'equation-error';
      errorMsg.style.color = '#ef4444';
      errorMsg.style.fontSize = '0.8rem';
      errorMsg.style.marginTop = '4px';
      equationForm.appendChild(errorMsg);
    }
    errorMsg.textContent = message;
    
    // Clear error after delay
    setTimeout(() => { 
      equationInput.classList.remove('error'); 
      equationInput.title = '';
      errorMsg.textContent = '';
    }, 3000);
  }
  
  // Show success feedback
  function showSuccessFeedback() {
    let successMsg = document.getElementById('equation-success');
    if (!successMsg) {
      successMsg = document.createElement('div');
      successMsg.id = 'equation-success';
      successMsg.style.color = '#10b981';
      successMsg.style.fontSize = '0.8rem';
      successMsg.style.marginTop = '4px';
      equationForm.appendChild(successMsg);
    }
    successMsg.textContent = 'Equation added successfully!';
    setTimeout(() => { successMsg.textContent = ''; }, 2000);
  }

  // Live preview while typing
  equationInput.addEventListener('input', () => {
    const value = equationInput.value;
    game.setPreviewEquation(value);
  });
}

// UI: reset
resetBtn.addEventListener('click', () => {
  game.reset();
  game.setPreviewEquation('');
});

// UI: launch balls on demand
launchBtn.addEventListener('click', () => {
  // Prevent spamming while burst is active
  launchBtn.disabled = true;
  game.launchBurst(20);
  // Re-enable after a short delay longer than total burst time
  const totalMs = (20 * game.spawnInterval + 0.2) * 1000;
  setTimeout(() => { launchBtn.disabled = false; }, totalMs);
});

// Game loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Add instructions about draggable dropper
const instructionsElement = document.getElementById('instructions');
if (instructionsElement) {
  instructionsElement.innerHTML += '<p><strong>Tip:</strong> You can drag the blue circle at the bottom to change where balls drop from!</p>';
}
