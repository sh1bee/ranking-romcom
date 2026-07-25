import { ThreeSetup } from './three/ThreeSetup.js';
import { TunnelManager } from './three/TunnelManager.js';
import { TransitionController } from './three/TransitionController.js';
import { InteractionController } from './ui/InteractionController.js';
import { TierListUI } from './ui/TierListUI.js';
import * as THREE from 'three';

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
    this.tunnelManager.update(delta);
    this.threeSetup.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
