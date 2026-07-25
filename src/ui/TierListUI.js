import gsap from 'gsap';
import * as THREE from 'three';
import { TIER_CONFIG } from '../data/cardData.js';
import { MovieUploadModal } from './MovieUploadModal.js';
import { MovieDetailsModal } from './MovieDetailsModal.js';
import { StorageManager } from '../data/StorageManager.js';

/**
 * Lightweight HTML overlay that floats OVER the WebGL canvas.
 * Only renders: header bar, tier labels (S/A/B/C), and reset button.
 * The actual card tiles remain in 3D — this just provides context labels.
 */
export class TierListUI {
  constructor(containerElement, onReset, transitionController) {
    this.container = containerElement;
    this.onReset = onReset;
    this.transitionCtrl = transitionController;

    // Initialize Modal
    this.uploadModal = new MovieUploadModal(document.body, (movieData) => {
      // Save to localStorage
      StorageManager.saveMovie(movieData);
      
      // Add to 3D board
      const tierIndex = Object.keys(TIER_CONFIG).indexOf(movieData.tier);
      this.transitionCtrl.addTileToRow(tierIndex, movieData);
    });

    // Details Modal
    this.detailsModal = new MovieDetailsModal(document.body, (cardInfo) => {
      // 1. Delete from localStorage
      StorageManager.deleteMovie(cardInfo.id);
      
      // 2. Remove from the 3D board
      this.transitionCtrl.removeTile(cardInfo.id);
    });

    this.build();
  }

  setTransitionController(tc) {
    this.transitionCtrl = tc;
  }

  build() {
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'tier-overlay';
    this.wrapper.className = 'tier-overlay';

    // ─── Top header bar ──────────────────────────────────────────────
    this.wrapper.innerHTML = `
      <header class="overlay-header">
        <div class="header-left">
          <span class="header-eyebrow">ULTIMATE</span>
          <h1 class="header-title">RANKING BOARD</h1>
        </div>
        <button id="resetBtn" class="reset-btn">
          <span class="reset-icon">↻</span>
          RE-ENTER TUNNEL
        </button>
      </header>
      <div class="overlay-labels" id="overlayLabels"></div>
    `;

    this.container.appendChild(this.wrapper);

    const labelsContainer = this.wrapper.querySelector('#overlayLabels');

    // ─── Tier label badges (positioned left side of each row) ───────
    const tierKeys = ['S', 'A', 'B', 'C'];
    tierKeys.forEach((key, idx) => {
      const cfg = TIER_CONFIG[key];

      const labelRow = document.createElement('div');
      labelRow.className = 'overlay-label-row';
      labelRow.setAttribute('data-tier', key);

      labelRow.innerHTML = `
        <div class="overlay-tier-badge" style="background: ${cfg.bgGradient}; border-left: 5px solid ${cfg.color}">
          <span class="overlay-tier-letter" style="color: ${cfg.color}">${key}</span>
          <span class="overlay-tier-sub">${cfg.label}</span>
        </div>
        <button class="overlay-add-btn" data-row="${idx}" data-tier="${key}" title="Add tile to ${key} Tier">
          <span>+</span>
        </button>
      `;

      labelsContainer.appendChild(labelRow);
    });

    // ─── Event listeners ─────────────────────────────────────────────
    this.wrapper.querySelector('#resetBtn').addEventListener('click', () => {
      if (this.onReset) this.onReset();
    });

    // Add-tile buttons
    this.wrapper.querySelectorAll('.overlay-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tier = btn.getAttribute('data-tier');
        this.uploadModal.open(tier);
      });
    });

    // Initially hidden
    this.wrapper.style.display = 'none';
    this.wrapper.style.opacity = '0';

    window.addEventListener('resize', () => {
      if (this.wrapper.style.display !== 'none') {
        this.updatePositions();
      }
    });
  }

  updatePositions() {
    if (!this.transitionCtrl || !this.transitionCtrl.threeSetup) return;
    
    const camera = this.transitionCtrl.threeSetup.camera;
    const gridZ = this.transitionCtrl.gridZ;
    const rows = this.wrapper.querySelectorAll('.overlay-label-row');
    const headerHeight = this.wrapper.querySelector('.overlay-header').offsetHeight;
    
    // We project the 3D row Y positions to 2D screen coordinates
    this.transitionCtrl.rowYPositions.forEach((y, idx) => {
      const vec = new THREE.Vector3(0, y, gridZ);
      vec.project(camera);
      // vec.y is between -1 (bottom) and 1 (top)
      const screenY = (-(vec.y - 1) / 2) * window.innerHeight;
      
      const rowEl = rows[idx];
      if (rowEl) {
        // Position relative to the .overlay-labels container which starts below the header
        rowEl.style.top = `${screenY - headerHeight}px`;
        rowEl.style.transform = 'translateY(-50%)';
      }
    });
  }

  showBoard() {
    this.wrapper.style.display = 'flex';
    this.updatePositions();

    const tl = gsap.timeline();

    // Header slides down
    tl.fromTo('.overlay-header',
      { y: -60, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
      0
    );

    // Overall fade-in
    tl.to(this.wrapper, {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.out'
    }, 0);

    // Tier labels stagger in from the left
    tl.fromTo('.overlay-label-row',
      { x: -80, opacity: 0 },
      {
        x: 0, opacity: 1,
        duration: 0.5,
        stagger: 0.1,
        ease: 'back.out(1.4)'
      },
      0.15
    );

    // Add buttons pop in
    tl.fromTo('.overlay-add-btn',
      { scale: 0, opacity: 0 },
      {
        scale: 1, opacity: 1,
        duration: 0.4,
        stagger: 0.08,
        ease: 'back.out(2)'
      },
      0.5
    );
  }

  hideBoard() {
    const tl = gsap.timeline({
      onComplete: () => {
        this.wrapper.style.display = 'none';
        this.wrapper.style.opacity = '0';
      }
    });

    tl.to('.overlay-label-row', {
      x: -80, opacity: 0,
      duration: 0.3,
      stagger: 0.04,
      ease: 'power2.in'
    }, 0);

    tl.to('.overlay-header', {
      y: -60, opacity: 0,
      duration: 0.3,
      ease: 'power2.in'
    }, 0.1);

    tl.to(this.wrapper, {
      opacity: 0,
      duration: 0.2,
      ease: 'power2.in'
    }, 0.3);
  }

  openMovieDetails(cardInfo) {
    this.detailsModal.open(cardInfo);
  }
}
