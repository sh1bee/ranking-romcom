import gsap from 'gsap';
import * as THREE from 'three';
import { TIER_CONFIG } from '../data/cardData.js';
import { MovieUploadModal } from './MovieUploadModal.js';
import { MovieDetailsModal } from './MovieDetailsModal.js';
import { StorageManager } from '../data/StorageManager.js';
import { ThemeManager } from '../utils/ThemeManager.js';

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
    if (this.transitionCtrl) {
      this.transitionCtrl.onLayoutChange = () => this.updatePositions();
    }

    // Initialize Modal (supports both add and edit)
    this.uploadModal = new MovieUploadModal(document.body, (movieData, isEdit) => {
      if (isEdit) {
        // Save update to storage
        StorageManager.updateMovie(movieData);
        
        // Live update 3D tile
        if (this.transitionCtrl) {
          this.transitionCtrl.updateTile(movieData);
        }
      } else {
        // Save new movie to storage
        StorageManager.saveMovie(movieData);
        
        // Add to 3D board
        const tierIndex = Object.keys(TIER_CONFIG).indexOf(movieData.tier);
        if (this.transitionCtrl) {
          this.transitionCtrl.addTileToRow(tierIndex, movieData);
        }
      }
    });

    // Details Modal
    this.detailsModal = new MovieDetailsModal(
      document.body,
      (cardInfo) => {
        // 1. Delete from storage
        StorageManager.deleteMovie(cardInfo.id);
        
        // 2. Remove from the 3D board
        if (this.transitionCtrl) {
          this.transitionCtrl.removeTile(cardInfo.id);
        }
      },
      (cardInfo) => {
        // Edit movie callback: opens upload modal pre-populated with existing movie data
        this.uploadModal.open(cardInfo.tier, cardInfo);
      }
    );

    this.build();
  }

  setTransitionController(tc) {
    this.transitionCtrl = tc;
    if (this.transitionCtrl) {
      this.transitionCtrl.onLayoutChange = () => this.updatePositions();
    }
  }

  build() {
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'tier-overlay';
    this.wrapper.className = 'tier-overlay';

    // ─── Top header bar ──────────────────────────────────────────────
    this.wrapper.innerHTML = `
      <header class="overlay-header">
        <div class="header-left">
          <span class="header-eyebrow">RANKING BOARD</span>
          <h1 class="header-title">ROM-COM</h1>
        </div>
        <div class="header-right">
          <button id="themeToggleBtn" class="theme-toggle-btn" aria-label="Toggle Dark Mode">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="theme-icon moon-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="theme-icon sun-icon"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          </button>
          <button id="resetBtn" class="reset-btn">
            <span class="reset-icon">↻</span>
            <span class="reset-text">RE-ENTER TUNNEL</span>
          </button>
        </div>
      </header>
      <div class="overlay-labels" id="overlayLabels"></div>
    `;

    this.container.appendChild(this.wrapper);

    // Theme Toggle listener
    const themeBtn = this.wrapper.querySelector('#themeToggleBtn');
    themeBtn.addEventListener('click', () => {
      ThemeManager.toggle();
    });

    const labelsContainer = this.wrapper.querySelector('#overlayLabels');

    // ─── Tier label badges (positioned left side of each row) ───────
    // Update order for the 2D UI to match our new tiers
    const tierKeys = ['Peak', 'S', 'A', 'B', 'C', 'Trash'];
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
    
    // We project the 3D row Y positions (with vertical scroll offset) to 2D screen coordinates
    this.transitionCtrl.rowYPositions.forEach((y, idx) => {
      const scrollY = this.transitionCtrl.scrollY || 0;
      const vec = new THREE.Vector3(0, y + scrollY, gridZ);
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

    // Overall fade-in
    tl.to(this.wrapper, {
      opacity: 1,
      duration: 0.3,
      ease: 'power2.inOut'
    }, 0);

    // Header dramatic power-up (scale down + blur resolve)
    tl.fromTo('.overlay-header',
      { y: -30, scale: 1.1, opacity: 0, filter: 'blur(10px)' },
      { y: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.6, ease: 'power4.out' },
      0.1
    );

    // Tier labels slam in from the left with high energy
    tl.fromTo('.overlay-label-row',
      { x: -100, scale: 0.8, opacity: 0 },
      {
        x: 0, scale: 1, opacity: 1,
        duration: 0.5,
        stagger: 0.06, // Faster stagger
        ease: 'back.out(1.8)'
      },
      0.2
    );

    // Add buttons spin and pop in
    tl.fromTo('.overlay-add-btn',
      { scale: 0, rotation: -90, opacity: 0 },
      {
        scale: 1, rotation: 0, opacity: 1,
        duration: 0.5,
        stagger: 0.05,
        ease: 'elastic.out(1, 0.6)'
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
