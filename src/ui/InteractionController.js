import gsap from 'gsap';
import * as THREE from 'three';

export class InteractionController {
  constructor(threeSetup, tunnelManager, onTriggerTransition, transitionController, tierListUI) {
    this.threeSetup = threeSetup;
    this.tunnelManager = tunnelManager;
    this.onTriggerTransition = onTriggerTransition;
    this.transitionController = transitionController;
    this.tierListUI = tierListUI;

    this.isHolding = false;
    this.hasTriggered = false;
    this.fovTween = null;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.initUI();
    this.attachEvents();
  }

  initUI() {
    this.container = document.createElement('div');
    this.container.className = 'interaction-overlay';
    this.container.innerHTML = `
      <div class="warp-hint-toast">
        <span class="hint-dot"></span>
        <span class="hint-text">PRESS & HOLD ANYWHERE TO WARP</span>
      </div>
    `;

    document.body.appendChild(this.container);
  }

  attachEvents() {
    const handleStart = (e) => {
      // Ignore if clicking UI elements (overlay buttons, tier badges, etc.)
      if (e.target.closest('.reset-btn, .overlay-add-btn, .overlay-tier-badge, .overlay-header, .movie-details-modal')) return;
      
      // If we are on the ranking board (hasTriggered is true), check for clicks on tiles
      if (this.hasTriggered) {
        this.handleBoardClick(e);
        return;
      }
      
      this.startWarp();
    };

    const handleEnd = (e) => {
      if (this.hasTriggered) return;
      if (this.isHolding) {
        this.triggerTransition();
      }
    };

    const handleMove = (e) => {
      if (!this.hasTriggered) return;
      this.handleBoardHover(e);
    };

    // Attach to window so holding anywhere on viewport triggers warp
    window.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    window.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd, { passive: true });
  }

  handleBoardHover(event) {
    let clientX, clientY;
    if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    if (clientX === undefined || clientY === undefined) return;

    // Do not hover if the modal is open
    if (document.querySelector('.movie-details-modal') && document.querySelector('.movie-details-modal').style.display !== 'none') {
      document.body.style.cursor = 'default';
      return;
    }

    const rect = this.threeSetup.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.threeSetup.camera);

    if (!this.transitionController || !this.transitionController.transitionPlanes) return;
    
    const intersects = this.raycaster.intersectObjects(this.transitionController.transitionPlanes);

    let hoveringCard = false;
    if (intersects.length > 0) {
      const hit = intersects.find(hit => hit.object.userData && hit.object.userData.isCard);
      if (hit) {
        hoveringCard = true;
      }
    }

    document.body.style.cursor = hoveringCard ? 'pointer' : 'default';
  }

  handleBoardClick(event) {
    // Determine coordinates (support both mouse and touch)
    let clientX, clientY;
    if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    if (clientX === undefined || clientY === undefined) return;

    const rect = this.threeSetup.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.threeSetup.camera);

    // Only intersect the planes that are in the transition board
    if (!this.transitionController || !this.transitionController.transitionPlanes) return;
    
    const intersects = this.raycaster.intersectObjects(this.transitionController.transitionPlanes);

    if (intersects.length > 0) {
      const hit = intersects.find(hit => hit.object.userData && hit.object.userData.isCard);
      
      if (hit && hit.object.userData.cardInfo) {
        const clickedMesh = hit.object;
        // Pop the mesh slightly for a click effect
        gsap.fromTo(clickedMesh.scale, 
          { x: clickedMesh.scale.x * 0.9, y: clickedMesh.scale.y * 0.9 },
          { x: clickedMesh.scale.x, y: clickedMesh.scale.y, duration: 0.3, ease: 'back.out(2)' }
        );

        if (this.tierListUI) {
          this.tierListUI.openMovieDetails(clickedMesh.userData.cardInfo);
        }
      }
    }
  }

  startWarp() {
    this.isHolding = true;
    this.tunnelManager.setWarpState(true);

    // Expand FOV with GSAP from 75 to 90
    if (this.fovTween) this.fovTween.kill();
    this.fovTween = gsap.to(this.threeSetup.camera, {
      fov: 90,
      duration: 1.2,
      ease: 'power2.in',
      onUpdate: () => this.threeSetup.camera.updateProjectionMatrix()
    });

    // Pulsate toast
    gsap.to('.warp-hint-toast', {
      scale: 1.08,
      borderColor: '#000000',
      duration: 0.3
    });
  }

  triggerTransition() {
    if (this.hasTriggered) return;
    this.hasTriggered = true;
    this.isHolding = false;

    // Kill FOV tween so TransitionController can take over
    if (this.fovTween) this.fovTween.kill();

    // Fade out hint toast
    gsap.to(this.container, {
      opacity: 0,
      y: 20,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: () => {
        this.container.style.pointerEvents = 'none';
        if (this.onTriggerTransition) this.onTriggerTransition();
      }
    });
  }

  resetUI() {
    this.hasTriggered = false;
    this.isHolding = false;
    this.container.style.pointerEvents = 'auto';
    gsap.to(this.container, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease: 'power2.out'
    });
  }
}
