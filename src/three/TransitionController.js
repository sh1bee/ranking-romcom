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

    // Row layout config (shared between grid-lock & reverse)
    this.wallOrder = ['top', 'left', 'right', 'bottom'];
    this.tierKeys = ['S', 'A', 'B', 'C'];
    this.rowYPositions = [3.8, 1.3, -1.2, -3.7];
    this.baseTileSpacing = 2.9; // Increased from 2.4 to fill more space
    this.baseTileScale = 1.35; // Increased from 1.1

    // Shockwave ring pool for reverse transition VFX
    this.shockwaveRings = [];

    this.createOverlays();

    window.addEventListener('resize', () => {
      if (this.isTransitioned && !this.isAnimating) {
        this.wallOrder.forEach((_, idx) => this.respaceTierRow(idx));
      }
    });
  }

  createOverlays() {
    // White flash
    this.flash = document.createElement('div');
    this.flash.className = 'screen-flash';
    document.body.appendChild(this.flash);

    // Vignette
    this.vignette = document.createElement('div');
    this.vignette.className = 'screen-vignette';
    document.body.appendChild(this.vignette);

    // Speed lines overlay for reverse transition
    this.speedLines = document.createElement('div');
    this.speedLines.className = 'screen-speed-lines';
    document.body.appendChild(this.speedLines);
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
    const distance = 20;
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
    const distance = 20;
    const vHeight = 2 * distance * Math.tan(fovRad / 2);
    const pixelToUnit = vHeight / window.innerHeight;

    // UI badge width is ~160px from the left edge
    return leftX + 160 * pixelToUnit + (this.baseTileSpacing / 2);
  }

  /**
   * Calculates the dynamic tile spacing and scale for a row
   * to keep all tiles visible on screen.
   */
  getRowLayout(tileCount) {
    const vWidth = this.getVisibleWidth();
    const startX = this.getGridStartX();
    const rightEdge = vWidth / 2;
    const availableWidth = rightEdge - startX - 0.5; // 0.5 margin from right edge

    const neededWidth = (tileCount - 1) * this.baseTileSpacing;

    if (neededWidth <= availableWidth || tileCount <= 1) {
      // All tiles fit with default spacing
      return { spacing: this.baseTileSpacing, scale: this.baseTileScale };
    }

    // Shrink spacing (and proportionally scale) to fit
    const newSpacing = availableWidth / (tileCount - 1);
    // Scale proportionally but don't go below 60% of base
    const scaleRatio = Math.max(newSpacing / this.baseTileSpacing, 0.5);
    const newScale = this.baseTileScale * scaleRatio;

    return { spacing: newSpacing, scale: newScale };
  }

  startTransition(onOverlayReady) {
    if (this.isAnimating || this.isTransitioned) return;
    this.isAnimating = true;

    const camera = this.threeSetup.camera;
    const planes = this.getTransitionPlanes();
    this.transitionPlanes = planes;

    // Ensure all movies (isCard === true) are included in the transition planes!
    // Because the tunnel loops infinitely, a movie tile might have been pooled far behind the camera.
    // If a card is not in `planes`, we swap it with an empty plane inside `planes` of the same wallType.
    const allCards = this.tunnelManager.allPlanes.filter(p => p.userData.isCard);
    allCards.forEach(cardPlane => {
      if (!planes.includes(cardPlane)) {
        // Find an empty plane in `planes` on the same wall
        const emptyPlane = planes.find(p => p.userData.wallType === cardPlane.userData.wallType && !p.userData.isCard);
        if (emptyPlane) {
          // Swap materials
          const tempMat = emptyPlane.material;
          emptyPlane.material = cardPlane.material;
          cardPlane.material = tempMat;
          
          // Swap userData relevant to cards
          const tempIsCard = emptyPlane.userData.isCard;
          const tempCardInfo = emptyPlane.userData.cardInfo;
          const tempInitialIsCard = emptyPlane.userData.initialIsCard;
          
          emptyPlane.userData.isCard = cardPlane.userData.isCard;
          emptyPlane.userData.cardInfo = cardPlane.userData.cardInfo;
          emptyPlane.userData.initialIsCard = cardPlane.userData.initialIsCard;
          
          cardPlane.userData.isCard = tempIsCard;
          cardPlane.userData.cardInfo = tempCardInfo;
          cardPlane.userData.initialIsCard = tempInitialIsCard;
        }
      }
    });

    const hidePlanes = this.tunnelManager.allPlanes.filter(p => !planes.includes(p));
    const camZ = camera.position.z;
    this.gridZ = camZ - 4;

    const master = gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        this.isTransitioned = true;
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1 — WARP CLIMAX (0s – 0.5s)
    // ═══════════════════════════════════════════════════════════════════

    master.to(this.tunnelManager, {
      currentSpeed: 4.5,
      duration: 0.4,
      ease: 'power4.in'
    }, 0);

    master.to(camera, {
      fov: 110,
      duration: 0.5,
      ease: 'power3.in',
      onUpdate: () => camera.updateProjectionMatrix()
    }, 0);

    master.to(this.vignette, {
      opacity: 0.6,
      duration: 0.4,
      ease: 'power2.in'
    }, 0);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2 — TUNNEL SHATTER (0.5s – 1.4s)
    // ═══════════════════════════════════════════════════════════════════

    // Sudden stop
    master.to(this.tunnelManager, {
      currentSpeed: 0, targetSpeed: 0,
      duration: 0.15, ease: 'power4.out'
    }, 0.5);

    // WHITE FLASH
    master.to(this.flash, { opacity: 0.85, duration: 0.08, ease: 'power4.in' }, 0.5);
    master.to(this.flash, { opacity: 0, duration: 0.8, ease: 'power2.out' }, 0.58);

    // CAMERA SHAKE
    const shakeTimeline = gsap.timeline();
    const camOrigX = camera.position.x, camOrigY = camera.position.y;
    for (let i = 0; i < 8; i++) {
      const intensity = (8 - i) * 0.04;
      shakeTimeline.to(camera.position, {
        x: camOrigX + (Math.random() - 0.5) * intensity,
        y: camOrigY + (Math.random() - 0.5) * intensity,
        duration: 0.04, ease: 'none'
      });
    }
    shakeTimeline.to(camera.position, { x: camOrigX, y: camOrigY, duration: 0.05 });
    master.add(shakeTimeline, 0.5);

    // Hide background planes instantly
    hidePlanes.forEach(p => {
      master.set(p.material, { opacity: 0 }, 0.52);
    });

    // Hide seam lines instantly
    this.tunnelManager.seamLines.forEach(line => {
      master.set(line.material, { opacity: 0 }, 0.52);
    });

    // Vignette fades out
    master.to(this.vignette, { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0.6);

    // EXPLODE tiles outward by wall direction
    planes.forEach((plane) => {
      const wall = plane.userData.wallType;
      plane.userData.isDetached = true;

      let ex = 0, ey = 0;
      const force = 6 + Math.random() * 8;
      if (wall === 'top')    { ey =  force; ex = (Math.random() - 0.5) * 4; }
      if (wall === 'bottom') { ey = -force; ex = (Math.random() - 0.5) * 4; }
      if (wall === 'left')   { ex = -force; ey = (Math.random() - 0.5) * 4; }
      if (wall === 'right')  { ex =  force; ey = (Math.random() - 0.5) * 4; }

      master.to(plane.position, {
        x: plane.position.x + ex,
        y: plane.position.y + ey,
        z: camZ - 8 + Math.random() * 4,
        duration: 0.7, ease: 'power2.out'
      }, 0.52 + Math.random() * 0.1);

      master.to(plane.rotation, {
        x: plane.rotation.x + (Math.random() - 0.5) * Math.PI * 2,
        y: plane.rotation.y + (Math.random() - 0.5) * Math.PI * 2,
        z: (Math.random() - 0.5) * Math.PI,
        duration: 0.7, ease: 'power2.out'
      }, 0.52 + Math.random() * 0.1);
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 3 — VORTEX REGROUP (1.4s – 2.5s)
    // ═══════════════════════════════════════════════════════════════════

    // Camera pulls back to wide-angle board view
    master.to(camera.position, {
      x: 0, y: 0, z: camZ + 16,
      duration: 1.4, ease: 'power2.inOut'
    }, 1.3);

    master.to(camera, {
      fov: 42,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => camera.updateProjectionMatrix()
    }, 1.3);

    // Spiral mid-waypoints
    planes.forEach((plane, i) => {
      const delay = 1.4 + i * 0.015;
      const angle = (i / planes.length) * Math.PI * 2;
      const spiralR = 3 + Math.random() * 2;

      master.to(plane.position, {
        x: Math.cos(angle) * spiralR,
        y: Math.sin(angle) * spiralR,
        z: this.gridZ + 2,
        duration: 0.6, ease: 'power2.in'
      }, delay);

      master.to(plane.rotation, {
        x: 0, y: 0, z: 0,
        duration: 0.8, ease: 'power2.inOut'
      }, delay);
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 4 — GRID LOCK (2.5s – 3.5s)
    //   Tiles snap into a 4-row ranking grid.
    //   These tiles ARE the final ranking board.
    //   Uses dynamic layout to handle many tiles per row.
    // ═══════════════════════════════════════════════════════════════════

    const rowMap = { top: [], left: [], right: [], bottom: [] };
    planes.forEach(p => {
      const w = p.userData.wallType;
      if (rowMap[w]) rowMap[w].push(p);
    });

    // Store row data for later use (add card, etc.)
    this.rowMap = rowMap;

    this.wallOrder.forEach((wType, rowIdx) => {
      const rowPlanes = rowMap[wType];
      
      // Sort so populated cards snap to the left, empty slots to the right
      rowPlanes.sort((a, b) => {
        if (a.userData.isCard && !b.userData.isCard) return -1;
        if (!a.userData.isCard && b.userData.isCard) return 1;
        return 0;
      });

      const startX = this.getGridStartX();
      const { spacing, scale } = this.getRowLayout(rowPlanes.length);

      rowPlanes.forEach((plane, colIdx) => {
        const targetX = startX + colIdx * spacing;
        const targetY = this.rowYPositions[rowIdx];
        const delay = 2.5 + rowIdx * 0.08 + colIdx * 0.03;

        // Store grid position for reset
        plane.userData.gridPos = { x: targetX, y: targetY, z: this.gridZ };
        plane.userData.gridRow = rowIdx;

        master.to(plane.position, {
          x: targetX, y: targetY, z: this.gridZ,
          duration: 0.7, ease: 'back.out(1.2)'
        }, delay);

        master.to(plane.scale, {
          x: scale, y: scale, z: 1,
          duration: 0.5, ease: 'power2.out'
        }, delay + 0.1);
      });
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 5 — OVERLAY (3.4s – 3.8s)
    //   HTML tier labels + header slide in over the 3D grid.
    //   No canvas fade. The 3D tiles stay visible as the board.
    // ═══════════════════════════════════════════════════════════════════

    master.call(() => {
      if (onOverlayReady) onOverlayReady();
    }, null, 3.4);

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

    // Push first so getRowLayout counts the new tile
    rowPlanes.push(mesh);

    const startX = this.getGridStartX();
    const { spacing, scale } = this.getRowLayout(rowPlanes.length);
    const newColIdx = rowPlanes.length - 1;
    const targetX = startX + newColIdx * spacing;
    const targetY = this.rowYPositions[rowIndex];

    mesh.position.set(targetX, targetY + 6, this.gridZ - 3);
    mesh.scale.set(0.3, 0.3, 1);
    mesh.material.opacity = 0;

    this.tunnelManager.tunnelGroup.add(mesh);
    this.tunnelManager.allPlanes.push(mesh);

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
    const wType = this.wallOrder[rowIndex];
    const rowPlanes = this.rowMap[wType];
    const startX = this.getGridStartX();
    const { spacing, scale } = this.getRowLayout(rowPlanes.length);

    rowPlanes.forEach((plane, colIdx) => {
      const targetX = startX + colIdx * spacing;
      if (plane.userData.gridPos) {
        plane.userData.gridPos.x = targetX;
      }
      gsap.to(plane.position, {
        x: targetX,
        duration: 0.6,
        ease: 'power2.out'
      });
      gsap.to(plane.scale, {
        x: scale, y: scale,
        duration: 0.5,
        ease: 'power2.out'
      });
    });
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
          tile.material = tile.userData.initialMat;

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

  // ═══════════════════════════════════════════════════════════════════
  //  REVERSE TRANSITION — Cinematic Re-entry into the Tunnel
  //
  //  Phase R1 — PULSE WAVE: Ripple dissolves through the grid
  //  Phase R2 — VORTEX IMPLOSION: Tiles spiral into tightening helix
  //  Phase R3 — WARP TUNNEL: Camera plunges forward through speed lines
  //             while tunnel walls materialize around the camera
  //  Phase R4 — ARRIVAL: Flash clears, tunnel is restored, cruising
  // ═══════════════════════════════════════════════════════════════════

  reverseTransition(onComplete) {
    if (this.isAnimating || !this.isTransitioned) return;
    this.isAnimating = true;

    const camera = this.threeSetup.camera;
    const planes = this.transitionPlanes;
    const total = planes.length;

    // Remove any dynamically added tiles first
    this._cleanupDynamicTiles();

    const tl = gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        this.isTransitioned = false;
        this.cleanupShockwaves();

        if (onComplete) onComplete();

        if (onComplete) onComplete();
      }
    });

    // ─── Phase R1 — PULSE WAVE (0s – 0.5s) ──────────────────────────
    // Quick ripple-pulse through the grid rows to signal departure

    this.wallOrder.forEach((wType, rowIdx) => {
      const rowPlanes = this.rowMap[wType] || [];
      rowPlanes.forEach((plane, colIdx) => {
        const delay = rowIdx * 0.06 + colIdx * 0.015;
        tl.to(plane.scale, {
          x: 1.5, y: 1.5,
          duration: 0.12,
          ease: 'power2.out',
          yoyo: true,
          repeat: 1
        }, delay);
      });
    });

    // ─── Phase R2 — VORTEX IMPLOSION (0.4s – 1.5s) ──────────────────
    // All tiles spiral into a shrinking helix and vanish into singularity

    // Vignette builds tension
    tl.to(this.vignette, {
      opacity: 0.8,
      duration: 0.6,
      ease: 'power2.in'
    }, 0.3);

    planes.forEach((plane, i) => {
      const t_norm = i / total;
      const delay = 0.4 + t_norm * 0.35;
      const angle = t_norm * Math.PI * 6; // 3 full helix turns
      const radius = 5 * (1 - t_norm * 0.7);

      // Spiral waypoint
      tl.to(plane.position, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: this.gridZ - 3 - t_norm * 8,
        duration: 0.6,
        ease: 'power3.in'
      }, delay);

      tl.to(plane.rotation, {
        z: `+=${Math.PI * 3}`,
        duration: 0.6,
        ease: 'power2.in'
      }, delay);

      // Implode into center
      tl.to(plane.position, {
        x: 0, y: 0, z: this.gridZ - 14,
        duration: 0.35,
        ease: 'power4.in'
      }, delay + 0.45);

      tl.to(plane.scale, {
        x: 0, y: 0,
        duration: 0.35,
        ease: 'power4.in'
      }, delay + 0.45);

      tl.to(plane.material, {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in'
      }, delay + 0.6);
    });

    // Shockwave rings at the singularity
    tl.call(() => this.createShockwaveRings(3), null, 1.2);

    // Camera shake at implosion climax
    const shakeTl = gsap.timeline();
    for (let i = 0; i < 10; i++) {
      const intensity = (10 - i) * 0.05;
      shakeTl.to(camera.position, {
        x: (Math.random() - 0.5) * intensity,
        y: (Math.random() - 0.5) * intensity,
        duration: 0.03, ease: 'none'
      });
    }
    shakeTl.to(camera.position, { x: 0, y: 0, duration: 0.04 });
    tl.add(shakeTl, 1.2);

    // Short flash at implosion
    tl.to(this.flash, { opacity: 0.7, duration: 0.06, ease: 'none' }, 1.25);
    tl.to(this.flash, { opacity: 0, duration: 0.4, ease: 'power2.out' }, 1.32);

    // ─── Phase R3 — WARP TUNNEL (1.5s – 3.0s) ───────────────────────
    // Camera pulls back, FOV widens, speed lines activate.
    // Tunnel walls fade in AROUND the camera while it's moving,
    // creating the sensation of re-entering the tunnel at warp speed.

    const warpStart = 1.5;

    // Speed lines activate
    tl.to(this.speedLines, {
      opacity: 1,
      duration: 0.3,
      ease: 'power2.in'
    }, warpStart);

    // FOV blows out wide for warp sensation
    tl.to(camera, {
      fov: 120,
      duration: 0.6,
      ease: 'power3.in',
      onUpdate: () => camera.updateProjectionMatrix()
    }, warpStart);

    // Camera zooms forward dramatically
    tl.to(camera.position, {
      z: this.gridZ - 30,
      duration: 0.7,
      ease: 'power3.in'
    }, warpStart);

    // Vignette goes full dark
    tl.to(this.vignette, {
      opacity: 1,
      duration: 0.5,
      ease: 'power2.in'
    }, warpStart + 0.2);

    // === THE KEY MOMENT: Reset behind a flash ===

    // Full white flash as we "arrive"
    tl.to(this.flash, { opacity: 1, duration: 0.1, ease: 'none' }, warpStart + 0.7);

    // Behind the flash: reset everything
    tl.call(() => {
      // Rebuild the tunnel in the background (will wrap around current camera Z)
      this.tunnelManager.rebuildTunnel();
    }, null, warpStart + 0.8);

    // ─── Phase R4 — ARRIVAL (2.3s – 3.5s) ───────────────────────────
    // Flash fades out gently, FOV eases back to 75,
    // speed lines dissolve, tunnel is cruising.

    const arriveStart = warpStart + 0.8;

    // FOV eases back to normal — this creates the "deceleration" feeling
    tl.to(camera, {
      fov: 75,
      duration: 1.2,
      ease: 'power2.out',
      onUpdate: () => camera.updateProjectionMatrix()
    }, arriveStart);

    // Flash fades out slowly to reveal the tunnel
    tl.to(this.flash, {
      opacity: 0,
      duration: 1.0,
      ease: 'power2.out'
    }, arriveStart);

    // Speed lines fade
    tl.to(this.speedLines, {
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out'
    }, arriveStart + 0.1);

    // Vignette recedes
    tl.to(this.vignette, {
      opacity: 0,
      duration: 1.0,
      ease: 'power2.out'
    }, arriveStart + 0.2);

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
        scene.remove(plane);
        plane.geometry?.dispose();
        plane.material?.dispose();
        toRemove.push(plane);
      }
    });

    // Clean from allPlanes array
    this.tunnelManager.allPlanes = this.tunnelManager.allPlanes.filter(
      p => !toRemove.includes(p)
    );
  }

  /**
   * Creates expanding shockwave ring meshes at the singularity point
   */
  createShockwaveRings(count) {
    const scene = this.tunnelManager.tunnelGroup;

    for (let i = 0; i < count; i++) {
      const ringGeo = new THREE.RingGeometry(0.1, 0.3, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, 0, this.gridZ - 14);

      scene.add(ring);
      this.shockwaveRings.push(ring);

      const delay = i * 0.1;
      gsap.to(ring.scale, {
        x: 35 + i * 10, y: 35 + i * 10, z: 1,
        duration: 0.7, ease: 'power2.out', delay
      });
      gsap.to(ringMat, {
        opacity: 0,
        duration: 0.6, ease: 'power2.out', delay: delay + 0.1
      });
    }
  }

  cleanupShockwaves() {
    const scene = this.tunnelManager.tunnelGroup;
    this.shockwaveRings.forEach(ring => {
      scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    });
    this.shockwaveRings = [];
  }
}

