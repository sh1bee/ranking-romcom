import { ThreeSetup } from './three/ThreeSetup.js';
import { TunnelManager } from './three/TunnelManager.js';
import { TransitionController } from './three/TransitionController.js';
import { InteractionController } from './ui/InteractionController.js';
import { TierListUI } from './ui/TierListUI.js';
import { StorageManager } from './data/StorageManager.js';
import * as THREE from 'three';
import gsap from 'gsap';

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // 1. Three.js Setup
    this.threeSetup = new ThreeSetup(this.container);

    // 2. Infinite Tunnel Manager
    this.tunnelManager = new TunnelManager(
      this.threeSetup.scene,
      this.threeSetup.camera
    );

    // 3. Transition Controller (cinematic 5-phase)
    this.transitionController = new TransitionController(
      this.threeSetup,
      this.tunnelManager
    );

    // 4. Overlay UI (tier labels + header, floats over WebGL)
    this.tierListUI = new TierListUI(
      document.body,
      () => this.resetExperience(),
      this.transitionController
    );

    // 5. Press & Hold Interaction
    this.interactionController = new InteractionController(
      this.threeSetup,
      this.tunnelManager,
      () => this.triggerTransition(),
      this.transitionController,
      this.tierListUI
    );

    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  triggerTransition() {
    this.transitionController.startTransition(() => {
      // Phase 5: overlay labels slide in over the 3D tile board
      this.tierListUI.showBoard();
    });
  }

  resetExperience() {
    // Hide overlay first
    this.tierListUI.hideBoard();

    // Then reverse the 3D transition
    setTimeout(() => {
      this.transitionController.reverseTransition(() => {
        this.interactionController.resetUI();
      });
    }, 400);
  }

  animate() {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    
    // Phase 2 Optimization: Conditional render loop to eliminate idle lag on ranking board
    const isWarpingOrTunnel = !this.transitionController.isTransitioned || this.transitionController.isAnimating;
    const hasActiveTweens = gsap && gsap.globalTimeline && gsap.globalTimeline.isActive();

    if (isWarpingOrTunnel) {
      this.tunnelManager.update(delta);
    }

    if (isWarpingOrTunnel || hasActiveTweens) {
      this.threeSetup.render();
      this.idleFrames = 0;
    } else {
      // Allow a 30-frame buffer after animations settle before suspending rendering
      if ((this.idleFrames || 0) < 30) {
        this.idleFrames = (this.idleFrames || 0) + 1;
        this.threeSetup.render();
      } else if (this.threeSetup.needsRender) {
        this.threeSetup.needsRender = false;
        this.threeSetup.render();
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  await StorageManager.init();
  new App();
});
