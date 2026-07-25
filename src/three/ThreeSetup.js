import * as THREE from 'three';

export class ThreeSetup {
  constructor(containerElement) {
    this.container = containerElement;
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // Warm off-white background matching reference image (#F2ECE4)
    const bgColor = new THREE.Color('#F2ECE4');

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(bgColor, 0.006);

    // Camera (default FOV = 75)
    this.defaultFov = 75;
    this.camera = new THREE.PerspectiveCamera(
      this.defaultFov,
      this.width / this.height,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    this.initLights();

    // Resize Handler
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  initLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 20, 10);
    this.scene.add(dirLight);
  }

  onResize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
