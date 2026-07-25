import * as THREE from 'three';
import { createCardTexture, createMovieTexture } from '../utils/textureGenerator.js';
import { CARD_DATA } from '../data/cardData.js';
import { StorageManager } from '../data/StorageManager.js';

export class TunnelManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Tunnel 4x4 Grid Parameters
    this.tunnelHalfWidth = 4.0; // Total width = 8.0 (4 tiles of size 2.0)
    this.tileSize = 2.0; // Square 2x2 tile size
    this.planeGap = 2.0; // Z-axis ring spacing
    this.numRings = 32; // Depth rings count

    // Speed states
    this.baseSpeed = 0.18;
    this.warpSpeed = 2.0;
    this.currentSpeed = this.baseSpeed;
    this.targetSpeed = this.baseSpeed;
    this.isWarping = false;

    // Storage
    this.allPlanes = [];
    this.cardMeshes = [];
    this.seamLines = [];
    this.tunnelGroup = new THREE.Group();
    this.scene.add(this.tunnelGroup);

    // Build Tunnel Structure matching reference image
    this.buildReferenceTunnel();
    this.buildCornerSeamLines();
  }

  buildCornerSeamLines() {
    // 4 Longitudinal corner seam lines extending deep down Z
    const cornerDepth = this.numRings * this.planeGap;
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true });
    const corners = [
      [-this.tunnelHalfWidth, -this.tunnelHalfWidth],
      [-this.tunnelHalfWidth, this.tunnelHalfWidth],
      [this.tunnelHalfWidth, -this.tunnelHalfWidth],
      [this.tunnelHalfWidth, this.tunnelHalfWidth]
    ];

    corners.forEach(([cx, cy]) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, cy, 5),
        new THREE.Vector3(cx, cy, -cornerDepth)
      ]);
      const line = new THREE.Line(geo, lineMat);
      this.seamLines.push(line);
      this.tunnelGroup.add(line);
    });
  }

  buildReferenceTunnel() {
    const squareGeo = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
    const edgesGeo = new THREE.EdgesGeometry(squareGeo);
    const blackLineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    // Base Cream Tile Material (#FAF6F0)
    const baseCreamMat = new THREE.MeshBasicMaterial({
      color: 0xFAF6F0,
      side: THREE.DoubleSide,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    // Create textures for card dataset
    const cardTextures = CARD_DATA.map(card => createCardTexture(card));
    let cardDataIndex = 0;

    // Grid offsets for 4 tiles per wall: [-3, -1, +1, +3]
    const offsets = [-3.0, -1.0, 1.0, 3.0];
    const H = this.tunnelHalfWidth;

    // Load saved movies grouped by wall type (Tier)
    // S -> top, A -> left, B -> right, C -> bottom
    const savedMovies = StorageManager.loadMovies();
    const movieQueues = {
      top: savedMovies.filter(m => m.tier === 'S'),
      left: savedMovies.filter(m => m.tier === 'A'),
      right: savedMovies.filter(m => m.tier === 'B'),
      bottom: savedMovies.filter(m => m.tier === 'C')
    };

    // Pre-create textures for the movies
    const movieTextures = new Map();
    savedMovies.forEach(m => {
      movieTextures.set(m.id, createMovieTexture(m));
    });

    for (let ring = 0; ring < this.numRings; ring++) {
      const z = -ring * this.planeGap;

      const tiles = [];
      offsets.forEach(x => tiles.push({ pos: [x, H, z], rot: [Math.PI / 2, 0, 0], wall: 'top' }));
      offsets.forEach(x => tiles.push({ pos: [x, -H, z], rot: [-Math.PI / 2, 0, 0], wall: 'bottom' }));
      offsets.forEach(y => tiles.push({ pos: [-H, y, z], rot: [0, Math.PI / 2, 0], wall: 'left' }));
      offsets.forEach(y => tiles.push({ pos: [H, y, z], rot: [0, -Math.PI / 2, 0], wall: 'right' }));

      tiles.forEach((t, tIdx) => {
        let mat;
        let cardInfo = null;

        // Try to pop a saved movie for this wall type
        if (movieQueues[t.wall].length > 0) {
          cardInfo = movieQueues[t.wall].shift();
          const tex = movieTextures.get(cardInfo.id);
          mat = new THREE.MeshBasicMaterial({
            map: tex,
            side: THREE.DoubleSide,
            transparent: true,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
          });
        } else {
          mat = baseCreamMat.clone();
        }

        const mesh = new THREE.Mesh(squareGeo, mat);
        mesh.position.set(...t.pos);
        mesh.rotation.set(...t.rot);

        // Crisp black wireframe edge
        const lineEdges = new THREE.LineSegments(edgesGeo, blackLineMat);
        mesh.add(lineEdges);

        mesh.userData = {
          isCard: !!cardInfo,
          initialIsCard: !!cardInfo,
          cardInfo: cardInfo,
          initialPos: mesh.position.clone(),
          initialRot: mesh.rotation.clone(),
          initialMat: mat,
          wallType: t.wall,
          isDetached: false
        };

        this.tunnelGroup.add(mesh);
        this.allPlanes.push(mesh);
        if (cardInfo) {
          this.cardMeshes.push(mesh);
        }
      });
    }
  }

  setWarpState(isWarping) {
    this.isWarping = isWarping;
    this.targetSpeed = isWarping ? this.warpSpeed : this.baseSpeed;
  }

  update(delta) {
    // Lerp camera speed smoothly
    this.currentSpeed += (this.targetSpeed - this.currentSpeed) * 0.1;
    this.camera.position.z -= this.currentSpeed;

    // Object Pooling: Recycle plane rows passing behind camera
    const recycleThreshold = this.camera.position.z + 4;
    const totalTunnelDepth = this.numRings * this.planeGap;

    this.allPlanes.forEach(plane => {
      if (!plane.userData.isDetached && plane.position.z > recycleThreshold) {
        plane.position.z -= totalTunnelDepth;
      }
    });
  }

  getVisibleCardsForTransition() {
    const camZ = this.camera.position.z;

    const aheadCardMeshes = this.cardMeshes
      .filter(m => m.position.z < camZ - 3)
      .sort((a, b) => b.position.z - a.position.z);

    const selectedMap = new Map();
    aheadCardMeshes.forEach(mesh => {
      const id = mesh.userData.cardInfo.id;
      if (!selectedMap.has(id)) {
        selectedMap.set(id, mesh);
      }
    });

    if (selectedMap.size < CARD_DATA.length) {
      CARD_DATA.forEach(card => {
        if (!selectedMap.has(card.id)) {
          const match = this.cardMeshes.find(m => m.userData.cardInfo.id === card.id);
          if (match) selectedMap.set(card.id, match);
        }
      });
    }

    return Array.from(selectedMap.values());
  }

  resetTunnel() {
    this.camera.position.set(0, 0, 0);
    this.currentSpeed = this.baseSpeed;
    this.targetSpeed = this.baseSpeed;
    this.isWarping = false;

    this.allPlanes.forEach(mesh => {
      mesh.position.copy(mesh.userData.initialPos);
      mesh.rotation.copy(mesh.userData.initialRot);
      mesh.scale.set(1, 1, 1);
      mesh.userData.isDetached = false;
      mesh.visible = true;

      // Restore original material (undo any empty→card swaps)
      if (mesh.userData.initialMat) {
        mesh.material = mesh.userData.initialMat;
        mesh.userData.isCard = mesh.userData.initialIsCard;
      }
      mesh.material.opacity = 1;
    });
  }

  clearTunnel() {
    // Remove all planes
    this.allPlanes.forEach(mesh => {
      this.tunnelGroup.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      // Dispose edges
      mesh.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    this.allPlanes = [];
    this.cardMeshes = [];

    // Remove seam lines
    this.seamLines.forEach(line => {
      this.tunnelGroup.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    });
    this.seamLines = [];
  }

  rebuildTunnel() {
    const currentCamZ = this.camera.position.z;

    this.clearTunnel();
    this.buildReferenceTunnel();
    this.buildCornerSeamLines();

    // Do NOT reset the camera position. Let it continue from where it is.
    // Wrap the newly created planes (which are at 0, -2, -4) to loop correctly around currentCamZ
    const recycleThreshold = currentCamZ + 4;
    const totalTunnelDepth = this.numRings * this.planeGap;

    this.allPlanes.forEach(plane => {
      while (plane.position.z > recycleThreshold) {
        plane.position.z -= totalTunnelDepth;
      }
    });

    // Shift seam lines so they infinitely extend from the camera's perspective
    this.seamLines.forEach(line => {
      line.position.z = currentCamZ;
    });

    // Resume movement immediately
    this.currentSpeed = this.baseSpeed;
    this.targetSpeed = this.baseSpeed;
    this.isWarping = false;
  }
}
