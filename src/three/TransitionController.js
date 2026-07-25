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

    // Shockwave ring pool for reverse transition VFX
    this.shockwaveRings = [];
    this.scrollY = 0;

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

      this.scrollY -= e.deltaY * 0.008;
      this.scrollY = THREE.MathUtils.clamp(this.scrollY, 0, maxScroll);
      this.applyScroll();
    }, { passive: true });
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

    // Position immediately adjacent to the HTML tier badge and add '+' button (~145px from edge)
    return leftX + 145 * pixelToUnit + (this.baseTileScale * 1.0);
  }

  getItemsPerRow() {
    const vWidth = this.getVisibleWidth();
    const startX = this.getGridStartX();
    const rightEdge = (vWidth / 2) - 0.6; // Margin from right edge of screen
    const availableWidth = Math.max(1, rightEdge - startX);
    const cols = Math.floor(availableWidth / this.baseTileSpacing) + 1;
    return Math.max(4, cols); // Responsive: expands to fill large monitors!
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
    return { spacing: this.baseTileSpacing, scale: this.baseTileScale };
  }

  startTransition(onOverlayReady) {
    if (this.isAnimating || this.isTransitioned) return;
    this.isAnimating = true;

    const camera = this.threeSetup.camera;

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1 — WARP CLIMAX (0s – 0.5s)
    //   During this 0.5s high-speed warp, NO tiles are detached yet so that
    //   TunnelManager object pooling recycles all rings without leaving any gap!
    // ═══════════════════════════════════════════════════════════════════
    const phase1 = gsap.timeline({
      onComplete: () => {
        this._executePhase2To5(onOverlayReady);
      }
    });

    phase1.to(this.tunnelManager, {
      currentSpeed: 4.5,
      duration: 0.4,
      ease: 'power4.in'
    }, 0);

    phase1.to(camera, {
      fov: 110,
      duration: 0.5,
      ease: 'power3.in',
      onUpdate: () => camera.updateProjectionMatrix()
    }, 0);

    phase1.to(this.vignette, {
      opacity: 0.6,
      duration: 0.4,
      ease: 'power2.in'
    }, 0);

    return phase1;
  }

  _executePhase2To5(onOverlayReady) {
    const camera = this.threeSetup.camera;

    // Now that the camera has reached its sudden stop, we select the 48 nearest tiles
    // right in front of the camera and detach them for the explosion!
    const planes = this.getTransitionPlanes();

    // Ensure all movies (isCard === true) are included in the transition planes!
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
          // Khi tier có hơn 8 phim (không còn ô rỗng trong cụm 8 ô đầu của wall để hoán đổi),
          // mang trực tiếp thẻ phim này từ dưới hầm lên tham gia vào cụm bay ra bảng Ranking!
          planes.push(cardPlane);
        }
      }
    });

    this.transitionPlanes = planes;
    const hidePlanes = this.tunnelManager.allPlanes.filter(p => !planes.includes(p));

    // Tách (clone) material của 48 tấm ngói chuyển lên Ranking Board để khi làm mờ hầm, ngói trên board không bị suy giảm opacity do dùng chung material
    planes.forEach(p => {
      if (p.material) p.material = p.material.clone();
      if (p.userData.emptyMat) p.userData.emptyMat = p.userData.emptyMat.clone();
      if (p.userData.initialMat) p.userData.initialMat = p.userData.initialMat.clone();
      if (p.children) {
        p.children.forEach(child => {
          if (child.isLineSegments && child.material) {
            child.material = child.material.clone();
          }
        });
      }
    });

    const camZ = camera.position.z;
    this.gridZ = camZ - 7.5; // Pushed further back to fit 6 rows

    const master = gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        this.isTransitioned = true;
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2 — TUNNEL SHATTER (0.0s – 0.9s)
    // ═══════════════════════════════════════════════════════════════════

    // Sudden stop
    master.to(this.tunnelManager, {
      currentSpeed: 0, targetSpeed: 0,
      duration: 0.15, ease: 'power4.out'
    }, 0);

    // WHITE FLASH
    master.to(this.flash, { opacity: 0.85, duration: 0.08, ease: 'power4.in' }, 0);
    master.to(this.flash, { opacity: 0, duration: 0.8, ease: 'power2.out' }, 0.08);

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
    master.add(shakeTimeline, 0);

    // Hướng tiếp cận hoàn toàn mới (0 Lag - 60 FPS): Hút sâu background hầm về điểm kỳ dị ở cuối hầm (Warp-out Implosion)
    // Thay vì làm mờ opacity trên 1400+ vật thể gây quá tải Alpha Blending và CPU sorting, ta gom toàn bộ phần sau của hầm
    // vào 1 Group duy nhất và hút tốc độ cao vào điểm kỳ dị trong lén lút lúc màn hình trắng sáng nổ ra.
    const bgGroup = new THREE.Group();
    this.tunnelManager.tunnelGroup.add(bgGroup);
    this.bgGroup = bgGroup;

    hidePlanes.forEach(p => bgGroup.add(p));
    this.tunnelManager.seamLines.forEach(line => bgGroup.add(line));

    // Animate HÚT SÂU background vào điểm kỳ dị (với vỏn vẹn 2 tweens trên 1 object duy nhất)
    master.to(bgGroup.position, {
      z: -120, // Hút lùi về hố sâu vô tận
      duration: 0.85,
      ease: 'power3.in'
    }, 0.15);

    master.to(bgGroup.scale, {
      x: 0.001,
      y: 0.001,
      z: 0.001,
      duration: 0.85,
      ease: 'power3.in'
    }, 0.15);

    // Ẩn group nền ngay khi hút xong để trả lại 100% sức mạnh GPU cho Bảng Xếp Hạng
    master.call(() => {
      bgGroup.visible = false;
    }, null, 1.0);

    // Vignette fades out
    master.to(this.vignette, { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0.1);

    // EXPLODE tiles outward by wall direction
    planes.forEach((plane) => {
      const wall = plane.userData.wallType;
      plane.userData.isDetached = true;

      const wallIdx = parseInt(wall.split('_')[1] || 0);
      const angle = wallIdx * Math.PI / 3 + Math.PI / 2;
      const force = 6 + Math.random() * 8;
      
      const ex = Math.cos(angle) * force + (Math.random() - 0.5) * 4;
      const ey = Math.sin(angle) * force + (Math.random() - 0.5) * 4;

      master.to(plane.position, {
        x: plane.position.x + ex,
        y: plane.position.y + ey,
        z: camZ - 8 + Math.random() * 4,
        duration: 0.7, ease: 'power2.out'
      }, 0.02 + Math.random() * 0.1);

      master.to(plane.rotation, {
        x: plane.rotation.x + (Math.random() - 0.5) * Math.PI * 2,
        y: plane.rotation.y + (Math.random() - 0.5) * Math.PI * 2,
        z: (Math.random() - 0.5) * Math.PI,
        duration: 0.7, ease: 'power2.out'
      }, 0.02 + Math.random() * 0.1);
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 3 — VORTEX REGROUP (0.8s – 2.0s)
    // ═══════════════════════════════════════════════════════════════════

    // Camera pulls back to wide-angle board view
    master.to(camera.position, {
      x: 0, y: 0, z: this.gridZ + this.boardDistance,
      duration: 1.4, ease: 'power2.inOut'
    }, 0.8);

    master.to(camera, {
      fov: 42,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => camera.updateProjectionMatrix()
    }, 0.8);

    // Spiral mid-waypoints
    planes.forEach((plane, i) => {
      const delay = 0.9 + i * 0.015;
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
    // PHASE 4 — GRID LOCK (2.0s – 3.0s)
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
      
      rowPlanes.sort((a, b) => {
        const aCard = a.userData.isCard ? 1 : 0;
        const bCard = b.userData.isCard ? 1 : 0;
        if (aCard !== bCard) return bCard - aCard;
        return b.userData.initialPos.z - a.userData.initialPos.z;
      });

      const startX = this.getGridStartX();
      const lineGap = 2.2;
      const scale = this.baseTileScale;
      const spacing = this.baseTileSpacing;
      const itemsPerRow = this.getItemsPerRow();
      
      rowPlanes.forEach((plane, colIdx) => {
        const lineIdx = Math.floor(colIdx / itemsPerRow);
        const colOnLine = colIdx % itemsPerRow;
        const targetX = startX + colOnLine * spacing;
        const targetY = this.rowYPositions[tierIdx] - lineIdx * lineGap;
        const delay = 2.0 + tierIdx * 0.08 + colIdx * 0.03;

        plane.userData.gridPos = { x: targetX, y: targetY, z: this.gridZ };
        plane.userData.gridScale = scale;
        plane.userData.gridRow = tierIdx;

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
    // PHASE 5 — OVERLAY (2.9s – 3.3s)
    // ═══════════════════════════════════════════════════════════════════

    master.call(() => {
      if (onOverlayReady) onOverlayReady();
    }, null, 2.9);

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
    const scale = this.baseTileScale;
    const spacing = this.baseTileSpacing;
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
    const scale = this.baseTileScale;
    const spacing = this.baseTileSpacing;

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
    this.scrollY = 0;
    if (this.onLayoutChange) this.onLayoutChange();

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
      if (this.bgGroup && this.bgGroup.parent) {
        this.bgGroup.parent.remove(this.bgGroup);
        this.bgGroup = null;
      }
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

