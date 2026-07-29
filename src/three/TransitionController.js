import * as THREE from 'three';
import gsap from 'gsap';
import { CARD_DATA, TIER_CONFIG } from '../data/cardData.js';
import { createCardTexture, createMovieTexture } from '../utils/textureGenerator.js';

/**
 * Cinematic multi-phase transition:
 *   Phase 1 — WARP CLIMAX: speed & FOV peak, vignette intensifies
 *   Phase 2 — TUNNEL SHATTER: tiles explode outward, white flash, camera shake
 *   Phase 3 — VORTEX REGROUP: tiles spiral back, rotate flat
 *   Phase 4 — GRID LOCK: tiles snap into clean 4-row ranking board
 *   Phase 5 — OVERLAY: HTML tier labels + header slide over the 3D board
 *
 *   The 3D tiles themselves ARE the ranking board. No canvas fade-out.
 */
export class TransitionController {
  constructor(threeSetup, tunnelManager) {
    this.threeSetup = threeSetup;
    this.tunnelManager = tunnelManager;
    this.isAnimating = false;
    this.isTransitioned = false;
    this.transitionPlanes = [];
    this.gridZ = 0;
    this.boardDistance = 21; // Unified camera distance for wide board view
    
    this.wallOrder = ['wall_0', 'wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5'];
    this.rowYPositions = [5.05, 2.75, 0.45, -1.85, -4.15, -6.45]; // Shifted down to clear header bar with 2.3 unit intervals
    
    // Grid config
    this.baseTileSpacing = 2.35; // Space between tiles horizontally
    this.baseTileScale = 1.05; // Proportioned to leave a clean gap between rows without colliding

    this.scrollY = 0;
    this.touchStartY = 0;
    this.touchLastY = 0;
    this.touchVelocity = 0;
    this.momentumRaf = null;

    this.createOverlays();

    window.addEventListener('resize', () => {
      if (this.isTransitioned && !this.isAnimating) {
        this.wallOrder.forEach((_, idx) => this.respaceTierRow(idx));
      }
    });

    window.addEventListener('wheel', (e) => {
      if (!this.isTransitioned || this.isAnimating) return;
      const detailsModal = document.querySelector('.movie-details-modal');
      const uploadModal = document.querySelector('.movie-modal-wrapper');
      if ((detailsModal && detailsModal.style.display !== 'none') || (uploadModal && uploadModal.style.display !== 'none')) {
        return;
      }

      const maxScroll = this.getMaxScrollY();
      if (maxScroll <= 0) return;

      this.scrollY += e.deltaY * 0.008;
      this.scrollY = THREE.MathUtils.clamp(this.scrollY, 0, maxScroll);
      this.applyScroll();
    }, { passive: true });

    // Touch scroll for mobile
    let touchScrollActive = false;
    window.addEventListener('touchstart', (e) => {
      if (!this.isTransitioned || this.isAnimating) return;
      const detailsModal = document.querySelector('.movie-details-modal');
      const uploadModal = document.querySelector('.movie-modal-wrapper');
      if ((detailsModal && detailsModal.style.display !== 'none') || (uploadModal && uploadModal.style.display !== 'none')) return;
      // Don't scroll if touching UI elements
      if (e.target.closest('.overlay-header, .overlay-tier-badge, .overlay-add-btn, .reset-btn')) return;
      
      if (this.momentumRaf) { cancelAnimationFrame(this.momentumRaf); this.momentumRaf = null; }
      this.touchStartY = e.touches[0].clientY;
      this.touchLastY = this.touchStartY;
      this.touchVelocity = 0;
      touchScrollActive = true;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!touchScrollActive || !this.isTransitioned || this.isAnimating) return;
      const currentY = e.touches[0].clientY;
      const deltaY = this.touchLastY - currentY;
      this.touchVelocity = deltaY;
      this.touchLastY = currentY;
      
      const maxScroll = this.getMaxScrollY();
      if (maxScroll <= 0) return;
      
      this.scrollY += deltaY * 0.015;
      this.scrollY = THREE.MathUtils.clamp(this.scrollY, 0, maxScroll);
      this.applyScroll();
    }, { passive: true });

    window.addEventListener('touchend', () => {
      if (!touchScrollActive) return;
      touchScrollActive = false;
      
      // Momentum scrolling
      const startVelocity = this.touchVelocity;
      if (Math.abs(startVelocity) < 1) return;
      
      let velocity = startVelocity * 0.5;
      const decelerate = () => {
        velocity *= 0.92;
        if (Math.abs(velocity) < 0.1) { this.momentumRaf = null; return; }
        
        const maxScroll = this.getMaxScrollY();
        if (maxScroll <= 0) { this.momentumRaf = null; return; }
        
        this.scrollY += velocity * 0.015;
        this.scrollY = THREE.MathUtils.clamp(this.scrollY, 0, maxScroll);
        this.applyScroll();
        this.momentumRaf = requestAnimationFrame(decelerate);
      };
      this.momentumRaf = requestAnimationFrame(decelerate);
    }, { passive: true });
  }

  createOverlays() {
    // Vignette for cinematic atmospheric depth
    this.vignette = document.createElement('div');
    this.vignette.className = 'screen-vignette';
    document.body.appendChild(this.vignette);

    // Smooth dimensional warp distortion
    this.warp = document.createElement('div');
    this.warp.className = 'screen-warp-distortion';
    document.body.appendChild(this.warp);

    // Gentle motion blur pulse during acceleration
    this.motionBlur = document.createElement('div');
    this.motionBlur.className = 'screen-motion-blur';
    document.body.appendChild(this.motionBlur);

    // Dark depth fade for seamless background transitions (zero white flash)
    this.depthFade = document.createElement('div');
    this.depthFade.className = 'screen-depth-fade';
    document.body.appendChild(this.depthFade);
  }

  /**
   * Selects ~48 nearest visible planes ahead of camera for the transition
   */
  getTransitionPlanes() {
    const camZ = this.threeSetup.camera.position.z;
    // We use camZ + 4 so we don't accidentally skip ring 0 (z=0) if camZ is slightly negative
    return [...this.tunnelManager.allPlanes]
      .filter(p => p.position.z <= camZ + 4 && p.position.z >= camZ - 32)
      .sort((a, b) => b.position.z - a.position.z)
      .slice(0, 48);
  }

  /**
   * Compute the available 3D width for tiles (from label edge to right screen edge)
   */
  getVisibleWidth() {
    const fovRad = 42 * THREE.MathUtils.DEG2RAD;
    const distance = this.boardDistance || 21;
    const vHeight = 2 * distance * Math.tan(fovRad / 2);
    const aspect = window.innerWidth / window.innerHeight;
    const vWidth = vHeight * aspect;
    return vWidth;
  }

  /**
   * Calculates the starting X coordinate for the 3D rows
   * so they align nicely just to the right of the HTML tier labels.
   */
  getGridStartX() {
    const vWidth = this.getVisibleWidth();
    const leftX = -vWidth / 2;
    const fovRad = 42 * THREE.MathUtils.DEG2RAD;
    const distance = this.boardDistance || 21;
    const vHeight = 2 * distance * Math.tan(fovRad / 2);
    const pixelToUnit = vHeight / window.innerHeight;

    // Responsive offset: smaller on mobile
    const labelOffset = window.innerWidth < 600 ? 90 : 145;
    return leftX + labelOffset * pixelToUnit + (this.getResponsiveTileScale() * 1.0);
  }

  getItemsPerRow() {
    const vWidth = this.getVisibleWidth();
    const startX = this.getGridStartX();
    const rightEdge = (vWidth / 2) - 0.6; // Margin from right edge of screen
    const availableWidth = Math.max(1, rightEdge - startX);
    const cols = Math.floor(availableWidth / this.getResponsiveTileSpacing()) + 1;
    // Responsive min columns
    const minCols = window.innerWidth < 600 ? 2 : (window.innerWidth < 900 ? 3 : 4);
    return Math.max(minCols, cols);
  }

  getResponsiveTileScale() {
    if (window.innerWidth < 480) return 0.78;
    if (window.innerWidth < 600) return 0.85;
    return this.baseTileScale;
  }

  getResponsiveTileSpacing() {
    if (window.innerWidth < 480) return 1.7;
    if (window.innerWidth < 600) return 1.85;
    return this.baseTileSpacing;
  }

  recalculateRowPositions() {
    let currentY = 5.05; // Starting Y for Peak tier
    const lineGap = 2.2;  // Gap between wrapped lines within the same tier
    const tierGap = 2.3;  // Gap between different tiers
    const itemsPerRow = this.getItemsPerRow();

    this.rowYPositions = [];
    this.wallOrder.forEach((wType) => {
      this.rowYPositions.push(currentY);
      
      const rowPlanes = this.rowMap && this.rowMap[wType] ? this.rowMap[wType] : [];
      const count = rowPlanes.length;
      const numLines = Math.max(1, Math.ceil(count / itemsPerRow));
      
      if (numLines > 1) {
        currentY -= (numLines - 1) * lineGap + tierGap;
      } else {
        currentY -= tierGap;
      }
    });
  }

  getMaxScrollY() {
    let bottomY = -6.45;
    const itemsPerRow = this.getItemsPerRow();
    if (this.rowYPositions && this.rowYPositions.length === 6) {
      const wType = this.wallOrder[5];
      const rowPlanes = this.rowMap && this.rowMap[wType] ? this.rowMap[wType] : [];
      const count = rowPlanes.length;
      const numLines = Math.max(1, Math.ceil(count / itemsPerRow));
      bottomY = this.rowYPositions[5] - (numLines - 1) * 2.2 - 1.2;
    }
    const limit = -7.5;
    if (bottomY < limit) {
      return limit - bottomY;
    }
    return 0;
  }

  applyScroll() {
    if (!this.transitionPlanes) return;
    this.transitionPlanes.forEach(plane => {
      if (plane.userData && plane.userData.gridPos) {
        plane.position.y = plane.userData.gridPos.y + this.scrollY;
      }
    });
    if (this.onLayoutChange) {
      this.onLayoutChange();
    }
  }

  /**
   * Always maintain uniform size and spacing. When exceeding 8 slots, items wrap onto new rows.
   */
  getRowLayout(tileCount) {
    return { spacing: this.getResponsiveTileSpacing(), scale: this.getResponsiveTileScale() };
  }

  startTransition(onOverlayReady) {
    if (this.isAnimating || this.isTransitioned) return;
    this.isAnimating = true;

    const camera = this.threeSetup.camera;

    // 1. Select transition planes right at start (t = 0)
    const planes = this.getTransitionPlanes();

    // Ensure all movie cards are included
    const allCards = this.tunnelManager.allPlanes.filter(p => p.userData.isCard);
    allCards.forEach(cardPlane => {
      if (!planes.includes(cardPlane)) {
        const emptyPlane = planes.find(p => p.userData.wallType === cardPlane.userData.wallType && !p.userData.isCard);
        if (emptyPlane) {
          const tempMat = emptyPlane.material;
          emptyPlane.material = cardPlane.material;
          cardPlane.material = tempMat;
          
          const tempIsCard = emptyPlane.userData.isCard;
          const tempCardInfo = emptyPlane.userData.cardInfo;
          const tempInitialIsCard = emptyPlane.userData.initialIsCard;
          
          emptyPlane.userData.isCard = cardPlane.userData.isCard;
          emptyPlane.userData.cardInfo = cardPlane.userData.cardInfo;
          emptyPlane.userData.initialIsCard = cardPlane.userData.initialIsCard;
          
          cardPlane.userData.isCard = tempIsCard;
          cardPlane.userData.cardInfo = tempCardInfo;
          cardPlane.userData.initialIsCard = tempInitialIsCard;
        } else {
          planes.push(cardPlane);
        }
      }
    });

    this.transitionPlanes = planes;
    const hidePlanes = this.tunnelManager.allPlanes.filter(p => !planes.includes(p));

    // Set isDetached for transition planes
    planes.forEach(p => {
      p.userData.isDetached = true;
    });

    const master = gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        this.isTransitioned = true;
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1 — GRAVITATIONAL PULL & WARP DISTORTION (0.0s – 0.50s)
    // ═══════════════════════════════════════════════════════════════════
    master.to(this.tunnelManager, {
      currentSpeed: 4.5,
      duration: 0.50,
      ease: 'power2.in'
    }, 0);

    master.to(camera, {
      fov: 105,
      duration: 0.50,
      ease: 'power2.inOut',
      onUpdate: () => camera.updateProjectionMatrix()
    }, 0);

    // Smooth atmospheric camera banking (barrel roll tilt)
    master.to(camera.rotation, {
      z: 0.12,
      x: 0.04,
      duration: 0.50,
      ease: 'power2.inOut'
    }, 0);

    master.to(this.vignette, {
      opacity: 0.65,
      duration: 0.45,
      ease: 'power2.out'
    }, 0);

    master.to(this.warp, {
      opacity: 0.75,
      duration: 0.45,
      ease: 'power2.in'
    }, 0.05);

    master.to(this.motionBlur, {
      opacity: 0.35,
      duration: 0.50,
      ease: 'power2.inOut'
    }, 0);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2 — DIMENSIONAL COLLAPSE & SLINGSHOT (0.45s – 1.10s)
    // ═══════════════════════════════════════════════════════════════════
    const initialCamZ = camera.position.z;
    const suddenStopZ = initialCamZ - 14;
    this.gridZ = suddenStopZ - 6.5;

    // Smooth deceleration instead of harsh sudden impact
    master.to(this.tunnelManager, {
      currentSpeed: 0, targetSpeed: 0,
      duration: 0.45, ease: 'power3.out'
    }, 0.45);

    // Fade out distortion overlays smoothly
    master.to(this.warp, { opacity: 0, duration: 0.65, ease: 'power2.out' }, 0.50);
    master.to(this.motionBlur, { opacity: 0, duration: 0.50, ease: 'power2.out' }, 0.50);

    // Gently dissolve unselected background architecture into deep space
    const bgGroup = new THREE.Group();
    this.tunnelManager.tunnelGroup.add(bgGroup);
    this.bgGroup = bgGroup;

    hidePlanes.forEach(p => bgGroup.add(p));
    this.tunnelManager.seamLines.forEach(line => bgGroup.add(line));

    master.to(bgGroup.position, {
      z: suddenStopZ - 40,
      duration: 0.85,
      ease: 'power2.out'
    }, 0.45);

    master.to(bgGroup.scale, {
      x: 0.05, y: 0.05, z: 0.05,
      duration: 0.85,
      ease: 'power2.out'
    }, 0.45);

    master.call(() => {
      bgGroup.visible = false;
    }, null, 1.35);

    // Gravitational Slingshot: Selected tiles pull inward briefly, then cast outward along elegant spiral arcs
    const phi = (1 + Math.sqrt(5)) / 2;
    planes.forEach((plane, i) => {
      const goldenAngle = i * Math.PI * 2 * (1 - 1 / phi);
      const distFromCenter = Math.sqrt(plane.position.x * plane.position.x + plane.position.y * plane.position.y);
      const slingRadius = 3.2 + (i / planes.length) * 5.0 + Math.min(2.0, distFromCenter * 0.2);
      
      const targetX = Math.cos(goldenAngle) * slingRadius;
      const targetY = Math.sin(goldenAngle) * slingRadius;

      // Stage 1: Gravitational pull toward axis
      master.to(plane.position, {
        x: plane.position.x * 0.35,
        y: plane.position.y * 0.35,
        z: suddenStopZ - 4,
        duration: 0.35,
        ease: 'power2.in'
      }, 0.40 + (i % 5) * 0.015);

      master.to(plane.rotation, {
        x: Math.PI / 3,
        y: Math.PI / 6,
        z: goldenAngle + Math.PI / 4,
        duration: 0.35,
        ease: 'power2.inOut'
      }, 0.40 + (i % 5) * 0.015);

      // Stage 2: Slingshot outward to suspended orbital positions
      master.to(plane.position, {
        x: targetX,
        y: targetY,
        z: this.gridZ + 3.0 + (i % 6) * 0.5,
        duration: 0.65,
        ease: 'power3.out'
      }, 0.75 + (i % 5) * 0.015);

      master.to(plane.rotation, {
        x: 0.2,
        y: (Math.random() - 0.5) * 0.4,
        z: goldenAngle * 0.3,
        duration: 0.65,
        ease: 'power3.out'
      }, 0.75 + (i % 5) * 0.015);
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 3 — MAGNETIC ALIGNMENT & CAMERA GLIDE (1.00s – 1.80s)
    // ═══════════════════════════════════════════════════════════════════
    // Seamless camera positioning to wide ranking board view
    master.to(camera.position, {
      x: 0, y: 0, z: this.gridZ + this.boardDistance,
      duration: 1.35,
      ease: 'power3.inOut'
    }, 0.85);

    master.to(camera.rotation, {
      x: 0, y: 0, z: 0,
      duration: 1.35,
      ease: 'power3.inOut'
    }, 0.85);

    master.to(camera, {
      fov: 42,
      duration: 1.35,
      ease: 'power3.inOut',
      onUpdate: () => camera.updateProjectionMatrix()
    }, 0.85);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 4 — PRECISION GRID LOCK (1.60s – 2.55s)
    // ═══════════════════════════════════════════════════════════════════
    const rowMap = {
      wall_0: [], wall_1: [], wall_2: [], wall_3: [], wall_4: [], wall_5: []
    };
    planes.forEach(p => {
      const w = p.userData.wallType;
      if (rowMap[w]) rowMap[w].push(p);
    });

    this.rowMap = rowMap;
    this.scrollY = 0;
    this.recalculateRowPositions();

    this.wallOrder.forEach((wType, tierIdx) => {
      const rowPlanes = this.rowMap[wType];
      
      // Sort: movie cards first, then by depth
      rowPlanes.sort((a, b) => {
        const aCard = a.userData.isCard ? 1 : 0;
        const bCard = b.userData.isCard ? 1 : 0;
        if (aCard !== bCard) return bCard - aCard;
        return b.userData.initialPos.z - a.userData.initialPos.z;
      });

      const startX = this.getGridStartX();
      const lineGap = 2.2;
      const scale = this.getResponsiveTileScale();
      const spacing = this.getResponsiveTileSpacing();
      const itemsPerRow = this.getItemsPerRow();
      
      rowPlanes.forEach((plane, colIdx) => {
        const lineIdx = Math.floor(colIdx / itemsPerRow);
        const colOnLine = colIdx % itemsPerRow;
        const targetX = startX + colOnLine * spacing;
        const targetY = this.rowYPositions[tierIdx] - lineIdx * lineGap;
        const delay = 1.60 + tierIdx * 0.09 + colIdx * 0.03;

        plane.userData.gridPos = { x: targetX, y: targetY, z: this.gridZ };
        plane.userData.gridScale = scale;
        plane.userData.gridRow = tierIdx;

        // Smoothly settle orientation to perfectly flat planar view
        master.to(plane.rotation, {
          x: 0, y: 0, z: 0,
          duration: 0.55,
          ease: 'power2.out'
        }, delay);

        // Fluid precision lock with refined, subtle overshoot
        master.to(plane.position, {
          x: targetX, y: targetY, z: this.gridZ,
          duration: 0.70,
          ease: 'back.out(1.25)'
        }, delay);

        master.to(plane.scale, {
          x: scale, y: scale, z: 1,
          duration: 0.60,
          ease: 'power2.out'
        }, delay);
      });
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 5 — SYNCHRONIZED OVERLAY REVEAL (2.40s)
    // ═══════════════════════════════════════════════════════════════════
    master.call(() => {
      if (onOverlayReady) onOverlayReady();
    }, null, 2.40);

    return master;
  }

  /**
   * Add a new 3D tile to a specific tier row.
   * Fills the leftmost empty tile first, falls back to adding a new tile.
   * After adding, auto-resizes the row if tiles exceed screen width.
   */
  addTileToRow(rowIndex, movieData) {
    const wType = this.wallOrder[rowIndex];
    const rowPlanes = this.rowMap[wType];

    // Card data to apply
    const tex = createMovieTexture(movieData);
    const newMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    // Find the leftmost empty tile
    const emptyTile = rowPlanes
      .slice()
      .sort((a, b) => a.position.x - b.position.x)
      .find(p => !p.userData.isCard);

    if (emptyTile) {
      // ─── Animate existing empty tile ───
      emptyTile.userData.isCard = true;
      emptyTile.userData.cardInfo = movieData;

      // Flip/shrink animation
      gsap.to(emptyTile.scale, {
        x: 0, y: 0, z: 1,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => {
          emptyTile.material = newMat;

          // Pop out with current row scale
          const { scale } = this.getRowLayout(rowPlanes.length);
          gsap.to(emptyTile.scale, {
            x: scale, y: scale, z: 1,
            duration: 0.6,
            ease: 'elastic.out(1, 0.5)'
          });

          // Flash effect
          const flashGeo = new THREE.PlaneGeometry(this.tunnelManager.tileSize, this.tunnelManager.tileSize);
          const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
          const flashMesh = new THREE.Mesh(flashGeo, flashMat);
          flashMesh.position.copy(emptyTile.position);
          flashMesh.position.z += 0.05;
          this.tunnelManager.tunnelGroup.add(flashMesh);

          gsap.to(flashMat, {
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
            onComplete: () => {
              this.tunnelManager.tunnelGroup.remove(flashMesh);
              flashGeo.dispose();
              flashMat.dispose();
            }
          });
        }
      });

      // After filling, re-layout the row (spacing may need to shrink)
      this.respaceTierRow(rowIndex);
      return emptyTile;
    }

    // ─── Fallback: Add completely new tile ───
    const size = this.tunnelManager.tileSize;
    const geo = new THREE.PlaneGeometry(size, size);
    const edgesGeo = new THREE.EdgesGeometry(geo);
    const blackLineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    const mesh = new THREE.Mesh(geo, newMat);
    const lineEdges = new THREE.LineSegments(edgesGeo, blackLineMat);
    mesh.add(lineEdges);

    mesh.userData = {
      isCard: true,
      cardInfo: movieData,
      wallType: wType,
      isDetached: true,
      gridRow: rowIndex
    };

    // Push first so recalculateRowPositions counts the new tile
    rowPlanes.push(mesh);
    this.recalculateRowPositions();

    const startX = this.getGridStartX();
    const scale = this.getResponsiveTileScale();
    const spacing = this.getResponsiveTileSpacing();
    const itemsPerRow = this.getItemsPerRow();
    const newColIdx = rowPlanes.length - 1;
    const lineIdx = Math.floor(newColIdx / itemsPerRow);
    const colOnLine = newColIdx % itemsPerRow;
    const targetX = startX + colOnLine * spacing;
    const targetY = (this.rowYPositions[rowIndex] - lineIdx * 2.2) + (this.scrollY || 0);

    mesh.position.set(targetX, targetY + 6, this.gridZ - 3);
    mesh.scale.set(0.3, 0.3, 1);
    mesh.material.opacity = 0;

    this.tunnelManager.tunnelGroup.add(mesh);
    this.tunnelManager.allPlanes.push(mesh);
    if (this.transitionPlanes) this.transitionPlanes.push(mesh);

    // Fly down
    gsap.to(mesh.position, { y: targetY, z: this.gridZ, duration: 0.8, ease: 'back.out(1.5)' });
    gsap.to(mesh.scale, { x: scale, y: scale, z: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)', delay: 0.1 });
    gsap.to(mesh.material, { opacity: 1, duration: 0.3, ease: 'power2.out' });

    // Re-layout entire row to fit new tile
    this.respaceTierRow(rowIndex);
    return mesh;
  }

  /**
   * Re-layout all tiles in a tier row with dynamic spacing/scale.
   */
  respaceTierRow(rowIndex) {
    this.recalculateRowPositions();
    const startX = this.getGridStartX();
    const lineGap = 2.2;
    const scale = this.getResponsiveTileScale();
    const spacing = this.getResponsiveTileSpacing();

    this.wallOrder.forEach((wType, idx) => {
      const rowPlanes = this.rowMap[wType];
      if (!rowPlanes) return;

      // Ensure movies stay grouped on the far-left whenever layout updates
      rowPlanes.sort((a, b) => {
        const aCard = a.userData.isCard ? 1 : 0;
        const bCard = b.userData.isCard ? 1 : 0;
        if (aCard !== bCard) return bCard - aCard;
        return 0;
      });

      const itemsPerRow = this.getItemsPerRow();
      rowPlanes.forEach((plane, colIdx) => {
        const lineIdx = Math.floor(colIdx / itemsPerRow);
        const colOnLine = colIdx % itemsPerRow;
        const targetX = startX + colOnLine * spacing;
        const targetY = (this.rowYPositions[idx] - lineIdx * lineGap) + (this.scrollY || 0);

        plane.userData.gridPos = { x: targetX, y: targetY - (this.scrollY || 0), z: this.gridZ };
        plane.userData.gridScale = scale;
        
        gsap.to(plane.position, {
          x: targetX,
          y: targetY,
          duration: 0.6,
          ease: 'power2.out',
          overwrite: 'auto'
        });
        gsap.to(plane.scale, {
          x: scale, y: scale,
          duration: 0.5,
          ease: 'power2.out',
          overwrite: 'auto'
        });
      });
    });

    if (this.onLayoutChange) {
      this.onLayoutChange();
    }
  }

  /**
   * Visually removes a tile from the board and resets it to empty.
   */
  removeTile(id) {
    if (!this.transitionPlanes) return;

    // Find the mesh with the matching movie ID
    const tile = this.transitionPlanes.find(
      p => p.userData.isCard && p.userData.cardInfo && p.userData.cardInfo.id === id
    );

    if (tile) {
      // Animate it shrinking away
      gsap.to(tile.scale, {
        x: 0, y: 0, z: 1,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
          // Reset to empty tile
          tile.userData.isCard = false;
          tile.userData.cardInfo = null;
          tile.material = tile.userData.emptyMat || tile.userData.initialMat;

          // Pop back out as an empty tile
          const wType = tile.userData.wallType;
          const rowIndex = this.wallOrder.indexOf(wType);
          const rowPlanes = this.rowMap[wType];
          
          // Move the now-empty tile to the end of the array to shift other tiles left
          if (rowPlanes) {
            const tileIdx = rowPlanes.indexOf(tile);
            if (tileIdx > -1) {
              rowPlanes.splice(tileIdx, 1);
              rowPlanes.push(tile);
            }
          }

          // Trigger a re-layout so the remaining tiles gracefully shift left
          this.respaceTierRow(rowIndex);
          
          let scale = 1.0;
          if (rowPlanes) {
            const layout = this.getRowLayout(rowPlanes.length);
            scale = layout.scale;
          }

          gsap.to(tile.scale, {
            x: scale, y: scale, z: 1,
            duration: 0.5,
            ease: 'elastic.out(1, 0.5)'
          });
        }
      });
    }
  }

  /**
   * Updates an existing tile's 3D card info & texture live on the board.
   */
  updateTile(movieData) {
    if (!this.transitionPlanes) return;

    const tile = this.transitionPlanes.find(
      p => p.userData.isCard && p.userData.cardInfo && p.userData.cardInfo.id === movieData.id
    );

    if (tile) {
      tile.userData.cardInfo = movieData;
      const tex = createMovieTexture(movieData);
      const newMat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });

      // Dispose old material
      if (tile.material && tile.material !== tile.userData.emptyMat) {
        tile.material.dispose();
      }
      tile.material = newMat;

      // Pop pulse feedback
      const currentScale = tile.userData.gridScale || this.baseTileScale;
      gsap.fromTo(tile.scale,
        { x: currentScale * 1.15, y: currentScale * 1.15 },
        { x: currentScale, y: currentScale, duration: 0.4, ease: 'back.out(2)' }
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  REVERSE TRANSITION — Cinematic Re-entry into the Tunnel (Zero Flash)
  //
  //  Phase R1 — ANTI-GRAVITY LIFT: Tiles softly uncouple and float upward
  //  Phase R2 — SPIRAL CONVERGENCE: Tiles converge fluidly down tunnel centerline
  //  Phase R3 — WORMHOLE TRANSIT: High-speed forward acceleration & eclipse fade
  //  Phase R4 — EMERGENCE: Smooth emergence into restored cruising tunnel
  // ═══════════════════════════════════════════════════════════════════

  reverseTransition(onComplete) {
    if (this.isAnimating || !this.isTransitioned) return;
    this.isAnimating = true;

    const camera = this.threeSetup.camera;
    const planes = this.transitionPlanes;
    const total = planes.length;

    // Remove any dynamically added tiles first
    this._cleanupDynamicTiles();
    this.scrollY = 0;
    if (this.onLayoutChange) this.onLayoutChange();

    const tl = gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        this.isTransitioned = false;
        if (onComplete) onComplete();
      }
    });

    // ─── Phase R1 — ANTI-GRAVITY LIFT (0s – 0.45s) ────
    // Tiles uncouple and lift gently off the ranking grid toward camera with soft weightlessness
    this.wallOrder.forEach((wType, rowIdx) => {
      const rowPlanes = this.rowMap && this.rowMap[wType] ? this.rowMap[wType] : [];
      rowPlanes.forEach((plane, colIdx) => {
        const delay = rowIdx * 0.03 + colIdx * 0.012;
        
        tl.to(plane.position, {
          z: this.gridZ + 2.8,
          duration: 0.35,
          ease: 'power2.out'
        }, delay);

        tl.to(plane.rotation, {
          x: (Math.random() - 0.5) * 0.25,
          y: (Math.random() - 0.5) * 0.25,
          z: (Math.random() - 0.5) * 0.15,
          duration: 0.35,
          ease: 'power2.out'
        }, delay);
      });
    });

    tl.to(this.vignette, {
      opacity: 0.75,
      duration: 0.45,
      ease: 'power2.inOut'
    }, 0.05);

    // ─── Phase R2 — SPIRAL CONVERGENCE (0.35s – 1.15s) ─
    // Smooth golden spiral convergence toward forward centerline
    const phi = (1 + Math.sqrt(5)) / 2;
    planes.forEach((plane, i) => {
      const t_norm = i / total;
      const delay = 0.35 + t_norm * 0.25;
      const goldenAngle = i * Math.PI * 2 * (1 - 1 / phi) * 2;
      const radius = 4.0 * (1 - t_norm * 0.75);

      tl.to(plane.position, {
        x: Math.cos(goldenAngle) * radius,
        y: Math.sin(goldenAngle) * radius,
        z: this.gridZ - 5 - t_norm * 8,
        duration: 0.50,
        ease: 'power2.inOut'
      }, delay);

      tl.to(plane.rotation, {
        z: goldenAngle,
        x: Math.PI / 2,
        duration: 0.50,
        ease: 'power2.in'
      }, delay);

      // Smoothly scale down into the deep focal point (replaces material opacity fade for performance)
      tl.to(plane.scale, {
        x: 0, y: 0, z: 1.5,
        duration: 0.40,
        ease: 'power3.in'
      }, delay + 0.20);
    });

    // ─── Phase R3 — WORMHOLE TRANSIT (1.00s – 1.85s) ──
    const warpStart = 1.05;

    // Introduce smooth warp distortion & motion blur
    tl.to(this.warp, {
      opacity: 0.85,
      duration: 0.35,
      ease: 'power2.in'
    }, warpStart);

    tl.to(this.motionBlur, {
      opacity: 0.45,
      duration: 0.35,
      ease: 'power2.inOut'
    }, warpStart);

    // Smooth forward camera dive & fov expansion
    tl.to(camera, {
      fov: 115,
      duration: 0.65,
      ease: 'power3.in',
      onUpdate: () => camera.updateProjectionMatrix()
    }, warpStart);

    tl.to(camera.position, {
      z: this.gridZ - 30,
      duration: 0.70,
      ease: 'power3.in'
    }, warpStart);

    // Eclipse depth fade (darkness instead of blinding white flash) to transition geometry
    tl.to(this.depthFade, {
      opacity: 0.95,
      duration: 0.35,
      ease: 'power2.in'
    }, warpStart + 0.35);

    // Rebuild infinite tunnel seamlessly behind dark eclipse fade
    tl.call(() => {
      if (this.bgGroup && this.bgGroup.parent) {
        this.bgGroup.parent.remove(this.bgGroup);
        this.bgGroup = null;
      }
      this.tunnelManager.rebuildTunnel();
    }, null, warpStart + 0.72);

    // ─── Phase R4 — EMERGENCE & CRUISE LOCK (1.75s – 2.65s) ───
    const arriveStart = warpStart + 0.75;

    // Decelerate camera FOV back to comfortable cruising 75
    tl.to(camera, {
      fov: 75,
      duration: 0.95,
      ease: 'power3.out',
      onUpdate: () => camera.updateProjectionMatrix()
    }, arriveStart);

    // Gently dissolve dark depth fade to unveil the restored 3D tunnel
    tl.to(this.depthFade, {
      opacity: 0,
      duration: 0.85,
      ease: 'power2.out'
    }, arriveStart);

    // Fade warp & motion overlays
    tl.to(this.warp, {
      opacity: 0,
      duration: 0.75,
      ease: 'power2.out'
    }, arriveStart + 0.05);

    tl.to(this.motionBlur, {
      opacity: 0,
      duration: 0.65,
      ease: 'power2.out'
    }, arriveStart);

    // Dissolve vignette back to transparent
    tl.to(this.vignette, {
      opacity: 0,
      duration: 0.85,
      ease: 'power2.out'
    }, arriveStart + 0.10);

    return tl;
  }

  /**
   * Remove tiles that were dynamically added via addTileToRow (fallback path)
   * so resetTunnel works cleanly with only original meshes.
   */
  _cleanupDynamicTiles() {
    const scene = this.tunnelManager.tunnelGroup;
    const toRemove = [];

    this.tunnelManager.allPlanes.forEach(plane => {
      if (!plane.userData.initialPos) {
        // This was a dynamically added tile — remove it
        if (plane.parent) plane.parent.remove(plane);
        plane.geometry?.dispose();
        plane.material?.dispose();
        toRemove.push(plane);
      }
    });

    // Clean from allPlanes array
    this.tunnelManager.allPlanes = this.tunnelManager.allPlanes.filter(
      p => !toRemove.includes(p)
    );
    if (this.transitionPlanes) {
      this.transitionPlanes = this.transitionPlanes.filter(p => !toRemove.includes(p));
    }
  }
}

