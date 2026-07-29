import * as THREE from 'three';
import { createCardTexture, createMovieTexture } from '../utils/textureGenerator.js';
import { CARD_DATA } from '../data/cardData.js';
import { StorageManager } from '../data/StorageManager.js';

export class TunnelManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Tunnel Grid Parameters (Hexagon)
    this.tunnelHalfWidth = 4.0; // W/2
    // Apothem (distance from center to center of a side) for a regular hexagon is W * sqrt(3) / 2 = 4.0 * sqrt(3)
    this.tunnelApothem = 4.0 * Math.sqrt(3); 
    this.tileSize = 2.0; 
    this.planeGap = 2.0; 
    this.numRings = window.innerWidth < 768 ? 48 : 72; // Fewer rings on mobile for performance

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
    // 6 Longitudinal corner seam lines extending deep down Z
    const cornerDepth = this.numRings * this.planeGap;
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true });
    
    // Calculate 6 corners of the hexagon
    // Radius of a regular hexagon is equal to its side length W (which is 8.0)
    const R = 8.0; 
    const corners = [];
    for (let i = 0; i < 6; i++) {
      // Corners are at 30, 90, 150, 210, 270, 330 degrees
      // Wall 0 is at 90 degrees (Top). Corners are at 60 and 120 from center.
      // Wait, if walls are at angles 0, 60, 120... rotated by 90deg?
      // In our setup:
      // Wall 0 center is (0, H) which is angle 90 degrees.
      // Corner angles are 90 + 30 = 120, etc.
      const angle = (i * 60 + 30) * Math.PI / 180;
      // In our code below, Wall 0 is at (0, H) which means parentDummy.rotation.z = 0.
      // In that coordinate system, the corner is at x = R*cos(30) but wait.
      // Top wall is y = H, x spans from -4 to 4.
      // So the corners for the top wall are (-4, H) and (4, H).
      // Let's just create a dummy for the corner!
      const dummy = new THREE.Object3D();
      dummy.position.set(4.0, this.tunnelApothem, 0); // Right corner of the top wall
      
      const parentDummy = new THREE.Object3D();
      parentDummy.rotation.z = i * Math.PI / 3;
      parentDummy.add(dummy);
      parentDummy.updateMatrixWorld(true);
      
      const pos = new THREE.Vector3();
      dummy.getWorldPosition(pos);
      corners.push([pos.x, pos.y]);
    }

    corners.forEach(([cx, cy]) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, cy, 20),
        new THREE.Vector3(cx, cy, -250)
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

    // Base Cream Tile Material (#FAF6F0) - Opaque & shared across normal empty slots
    const baseCreamMat = new THREE.MeshBasicMaterial({
      color: 0xFAF6F0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    // Curated futuristic & architectural palettes for vibrant tile randomness
    const VIBRANT_PALETTE = [
      0xF43F5E, 0x0EA5E9, 0x8B5CF6, 0x10B981, 
      0xF59E0B, 0x3B82F6, 0xEC4899, 0x14B8A6, 
      0x6366F1, 0xD97706, 0x334155, 0x1E293B, 
      0xE2E8F0, 0xFED7AA, 0xA5F3FC, 0xDDD6FE
    ];

    // Pre-create shared material pool for all vibrant accent colors (avoids 140+ duplicates)
    const vibrantMatPool = VIBRANT_PALETTE.map(color => new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    }));

    // Grid offsets for 4 tiles per wall: [-3, -1, +1, +3]
    const offsets = [-3.0, -1.0, 1.0, 3.0];

    // Load saved movies grouped by tier (6 tiers now)
    const savedMovies = StorageManager.loadMovies();
    const movieQueues = {
      wall_0: savedMovies.filter(m => m.tier === 'Peak'),
      wall_1: savedMovies.filter(m => m.tier === 'S'),
      wall_2: savedMovies.filter(m => m.tier === 'A'),
      wall_3: savedMovies.filter(m => m.tier === 'B'),
      wall_4: savedMovies.filter(m => m.tier === 'C'),
      wall_5: savedMovies.filter(m => m.tier === 'Trash')
    };

    // Pre-create textures for the movies
    const movieTextures = new Map();
    savedMovies.forEach(m => {
      movieTextures.set(m.id, createMovieTexture(m));
    });

    // Dummy objects for calculating exact world positions on a hexagon
    const dummy = new THREE.Object3D();
    const parentDummy = new THREE.Object3D();
    parentDummy.add(dummy);

    // Step 1: Collect all available tile slot descriptors grouped by wall
    const wallTileSlots = {
      wall_0: [], wall_1: [], wall_2: [], wall_3: [], wall_4: [], wall_5: []
    };

    for (let ring = 0; ring < this.numRings; ring++) {
      const z = -ring * this.planeGap;
      for (let i = 0; i < 6; i++) {
        const wallKey = `wall_${i}`;
        parentDummy.rotation.z = i * Math.PI / 3;
        parentDummy.updateMatrixWorld(true);

        offsets.forEach(offset => {
          // Position relative to the center of this wall
          dummy.position.set(offset, this.tunnelApothem, z);
          dummy.rotation.set(Math.PI / 2, 0, 0); // Flat facing down towards center
          dummy.updateMatrixWorld(true);

          const worldPos = new THREE.Vector3();
          const worldQuat = new THREE.Quaternion();
          dummy.getWorldPosition(worldPos);
          dummy.getWorldQuaternion(worldQuat);

          wallTileSlots[wallKey].push({
            pos: [worldPos.x, worldPos.y, worldPos.z],
            rot: new THREE.Euler().setFromQuaternion(worldQuat),
            wall: wallKey,
            cardInfo: null
          });
        });
      }
    }

    // Step 2: Randomly distribute movies across available slots on their corresponding wall (Fisher-Yates shuffle)
    for (let i = 0; i < 6; i++) {
      const wallKey = `wall_${i}`;
      const slots = wallTileSlots[wallKey];
      const movies = movieQueues[wallKey];

      if (movies.length > 0) {
        const indices = Array.from({ length: slots.length }, (_, k) => k);
        for (let j = indices.length - 1; j > 0; j--) {
          const rand = Math.floor(Math.random() * (j + 1));
          [indices[j], indices[rand]] = [indices[rand], indices[j]];
        }

        movies.forEach((movie, idx) => {
          if (idx < indices.length) {
            const chosenSlotIndex = indices[idx];
            slots[chosenSlotIndex].cardInfo = movie;
          }
        });
      }
    }

    // Step 3: Construct all tile meshes in 3D space
    Object.values(wallTileSlots).forEach(slots => {
      slots.forEach(t => {
        // Assign shared material references instead of cloning
        let emptyMat;
        if (Math.random() < 0.19 && vibrantMatPool.length > 0) {
          const randIdx = Math.floor(Math.random() * vibrantMatPool.length);
          emptyMat = vibrantMatPool[randIdx];
        } else {
          emptyMat = baseCreamMat;
        }

        let mat;
        const cardInfo = t.cardInfo;

        if (cardInfo) {
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
          mat = emptyMat;
        }

        const mesh = new THREE.Mesh(squareGeo, mat);
        mesh.position.set(...t.pos);
        mesh.rotation.copy(t.rot);

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
          emptyMat: emptyMat,
          wallType: t.wall,
          isDetached: false
        };

        this.tunnelGroup.add(mesh);
        this.allPlanes.push(mesh);
        if (cardInfo) {
          this.cardMeshes.push(mesh);
        }
      });
    });
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

    // Ensure all remaining movie card meshes across the entire tunnel are brought to the ranking board
    this.cardMeshes.forEach(mesh => {
      const id = mesh.userData.cardInfo.id;
      if (!selectedMap.has(id)) {
        selectedMap.set(id, mesh);
      }
    });

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
      if (mesh.material && mesh.material.transparent) {
        mesh.material.opacity = 1;
      }
    });

    this.seamLines.forEach(line => {
      line.visible = true;
    });
  }

  clearTunnel() {
    // Remove all planes from whatever parent group they belong to
    this.allPlanes.forEach(mesh => {
      if (mesh.parent) mesh.parent.remove(mesh);
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
      if (line.parent) line.parent.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    });
    this.seamLines = [];
  }

  rebuildTunnel() {
    // Seamlessly reset camera back to coordinate origin behind the opaque white flash
    this.camera.position.set(0, 0, 0);

    this.clearTunnel();
    this.buildReferenceTunnel();
    this.buildCornerSeamLines();

    // Resume movement immediately from origin
    this.currentSpeed = this.baseSpeed;
    this.targetSpeed = this.baseSpeed;
    this.isWarping = false;
  }
}
