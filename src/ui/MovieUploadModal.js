import gsap from 'gsap';
import { StorageManager } from '../data/StorageManager.js';

export class MovieUploadModal {
  constructor(container, onSubmit) {
    this.container = container;
    this.onSubmit = onSubmit;
    this.initUI();
  }

  initUI() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'movie-modal-wrapper';
    this.wrapper.style.display = 'none';
    this.wrapper.style.opacity = '0';
    
    this.wrapper.innerHTML = `
      <div class="movie-modal-backdrop"></div>
      <div class="movie-modal-content">
        <h2 class="modal-title">ADD MOVIE TO <span id="modal-tier-badge"></span> TIER</h2>
        
        <div class="modal-body">
          <div class="modal-image-upload" id="modal-image-dropzone">
            <span class="upload-icon">📸</span>
            <span class="upload-text">Upload Cover Image</span>
            <input type="file" id="modal-file-input" accept="image/*" />
          </div>

          <div class="cropper-container" id="cropper-container" style="display:none;">
            <div class="cropper-viewport" id="cropper-viewport">
              <img id="cropper-img" draggable="false" />
            </div>
            <div class="cropper-controls">
              <label style="font-size:10px; color:#aaa; margin-bottom: 4px;">ZOOM</label>
              <input type="range" id="cropper-zoom" min="1" max="3" step="0.05" value="1" />
              <button type="button" class="modal-btn" id="cropper-reselect" style="font-size:12px; padding:6px 12px; margin-top:8px;">🔄 Change Image</button>
            </div>
          </div>
          
          <div class="modal-form">
            <div class="form-group">
              <label>MOVIE TITLE</label>
              <input type="text" id="modal-title-input" placeholder="e.g. Inception" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>YOUR REVIEW / RATING</label>
              <input type="text" id="modal-review-input" placeholder="e.g. Mind-bending masterpiece. 10/10" autocomplete="off" />
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="modal-btn modal-cancel-btn">CANCEL</button>
          <button class="modal-btn modal-submit-btn">ADD TO RANKING</button>
        </div>
      </div>
    `;

    this.container.appendChild(this.wrapper);
    
    this.backdrop = this.wrapper.querySelector('.movie-modal-backdrop');
    this.content = this.wrapper.querySelector('.movie-modal-content');
    
    this.fileInput = this.wrapper.querySelector('#modal-file-input');
    this.dropzone = this.wrapper.querySelector('#modal-image-dropzone');
    
    // Cropper elements
    this.cropperContainer = this.wrapper.querySelector('#cropper-container');
    this.cropperViewport = this.wrapper.querySelector('#cropper-viewport');
    this.cropperImg = this.wrapper.querySelector('#cropper-img');
    this.cropperZoom = this.wrapper.querySelector('#cropper-zoom');
    this.cropperReselect = this.wrapper.querySelector('#cropper-reselect');

    this.titleInput = this.wrapper.querySelector('#modal-title-input');
    this.reviewInput = this.wrapper.querySelector('#modal-review-input');
    
    this.tierBadge = this.wrapper.querySelector('#modal-tier-badge');
    
    // Cropper State
    this.cropState = {
      baseWidth: 0,
      baseHeight: 0,
      vpSize: 200, // viewport px
      currentX: 0,
      currentY: 0,
      zoom: 1,
      isDragging: false,
      startX: 0,
      startY: 0,
      initialX: 0,
      initialY: 0
    };
    
    this.cancelBtn = this.wrapper.querySelector('.modal-cancel-btn');
    this.submitBtn = this.wrapper.querySelector('.modal-submit-btn');

    this.attachEvents();
  }

  attachEvents() {
    // Ngăn chặn trôi sự kiện bấm nhầm (click throughput / event leakage) xuống scene 3D phía sau
    ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(evt => {
      this.content.addEventListener(evt, (e) => {
        e.stopPropagation();
        // Cực kỳ quan trọng: khi người dùng buông nút chuột ngay bên trong hộp thoại Modal,
        // do đã stopPropagation nên window sẽ không nghe thấy event mouseup/touchend.
        // Ta buộc phải gọi thẳng endDrag() tại đây để nhả ảnh ra, chấm dứt thao tác kéo!
        if (evt === 'mouseup' || evt === 'touchend') {
          this.endDrag();
        }
      });
    });

    if (this.cropperImg) {
      this.cropperImg.setAttribute('draggable', 'false');
      this.cropperImg.addEventListener('dragstart', (e) => e.preventDefault());
    }

    this.cancelBtn.addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', () => this.close());
    
    // File upload handling
    this.dropzone.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fileInput.click();
    });
    
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        StorageManager.compressImage(file, (compressedDataUrl) => {
          this.currentImageData = compressedDataUrl;
          this.dropzone.style.display = 'none';
          this.cropperContainer.style.display = 'flex';
          
          this.cropperImg.onload = () => {
            this.initCropper(this.cropperImg);
          };
          this.cropperImg.src = compressedDataUrl;
        });
      }
    });

    this.cropperReselect.addEventListener('click', () => {
      this.fileInput.value = '';
      this.fileInput.click();
    });

    this.cropperZoom.addEventListener('input', (e) => {
      this.cropState.zoom = parseFloat(e.target.value);
      this.updateCropper();
    });

    // Panning logic
    this.cropperViewport.addEventListener('mousedown', (e) => this.startDrag(e.clientX, e.clientY));
    this.cropperViewport.addEventListener('touchstart', (e) => this.startDrag(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
    
    window.addEventListener('mousemove', (e) => this.onDrag(e.clientX, e.clientY));
    window.addEventListener('touchmove', (e) => {
      if (this.cropState.isDragging) e.preventDefault(); // prevent scroll
      this.onDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, {passive: false});
    
    window.addEventListener('mouseup', () => this.endDrag());
    window.addEventListener('touchend', () => this.endDrag());
    this.wrapper.addEventListener('mouseup', () => this.endDrag());
    this.wrapper.addEventListener('touchend', () => this.endDrag());

    this.submitBtn.addEventListener('click', () => {
      const title = this.titleInput.value.trim();
      if (!title) {
        alert("Please enter a movie title.");
        return;
      }

      // Calculate normalized crop to save
      let normX = 0;
      let normY = 0;
      if (this.currentImageData) {
        const scaledW = this.cropState.baseWidth * this.cropState.zoom;
        const scaledH = this.cropState.baseHeight * this.cropState.zoom;
        const maxX = Math.max(0, (scaledW - this.cropState.vpSize) / 2);
        const maxY = Math.max(0, (scaledH - this.cropState.vpSize) / 2);
        
        normX = maxX > 0 ? this.cropState.currentX / maxX : 0;
        normY = maxY > 0 ? this.cropState.currentY / maxY : 0;
      }

      const movieData = {
        id: 'movie_' + Date.now(),
        tier: this.currentTier,
        title: title,
        review: this.reviewInput.value.trim(),
        image: this.currentImageData || null,
        crop: {
          x: normX,
          y: normY,
          zoom: this.cropState.zoom
        }
      };

      this.onSubmit(movieData);
      this.close();
    });
  }

  // ─── CROPPER LOGIC ───────────────────────────────────────────────

  initCropper(imgElement) {
    const imgAspect = imgElement.naturalWidth / imgElement.naturalHeight;
    // Base width/height ensures the image completely covers the 200x200 viewport at zoom=1
    if (imgAspect > 1) {
      this.cropState.baseHeight = this.cropState.vpSize;
      this.cropState.baseWidth = this.cropState.vpSize * imgAspect;
    } else {
      this.cropState.baseWidth = this.cropState.vpSize;
      this.cropState.baseHeight = this.cropState.vpSize / imgAspect;
    }
    
    this.cropState.currentX = 0;
    this.cropState.currentY = 0;
    this.cropState.zoom = 1;
    this.cropperZoom.value = 1;
    
    this.updateCropper();
  }

  updateCropper() {
    const state = this.cropState;
    const scaledW = state.baseWidth * state.zoom;
    const scaledH = state.baseHeight * state.zoom;
    
    // Max offset so the image doesn't reveal the viewport background
    const maxX = Math.max(0, (scaledW - state.vpSize) / 2);
    const maxY = Math.max(0, (scaledH - state.vpSize) / 2);
    
    state.currentX = Math.max(-maxX, Math.min(maxX, state.currentX));
    state.currentY = Math.max(-maxY, Math.min(maxY, state.currentY));
    
    this.cropperImg.style.width = `${scaledW}px`;
    this.cropperImg.style.height = `${scaledH}px`;
    this.cropperImg.style.left = `${(state.vpSize - scaledW) / 2 + state.currentX}px`;
    this.cropperImg.style.top = `${(state.vpSize - scaledH) / 2 + state.currentY}px`;
  }

  startDrag(clientX, clientY) {
    if (this.cropperContainer.style.display === 'none') return;
    this.cropState.isDragging = true;
    this.cropState.startX = clientX;
    this.cropState.startY = clientY;
    this.cropState.initialX = this.cropState.currentX;
    this.cropState.initialY = this.cropState.currentY;
  }

  onDrag(clientX, clientY) {
    if (!this.cropState.isDragging) return;
    const dx = clientX - this.cropState.startX;
    const dy = clientY - this.cropState.startY;
    
    this.cropState.currentX = this.cropState.initialX + dx;
    this.cropState.currentY = this.cropState.initialY + dy;
    
    this.updateCropper();
  }

  endDrag() {
    this.cropState.isDragging = false;
  }

  open(tierKey) {
    this.currentTier = tierKey;
    this.tierBadge.textContent = tierKey;
    
    // Reset form
    this.titleInput.value = '';
    this.reviewInput.value = '';
    this.fileInput.value = '';
    this.currentImageData = null;
    
    this.dropzone.style.display = 'flex';
    this.cropperContainer.style.display = 'none';
    this.cropperImg.src = '';
    
    // Reset crop state
    this.cropState.currentX = 0;
    this.cropState.currentY = 0;
    this.cropState.zoom = 1;
    this.cropperZoom.value = 1;

    this.wrapper.style.display = 'flex';
    
    gsap.fromTo(this.wrapper, 
      { opacity: 0 }, 
      { opacity: 1, duration: 0.3 }
    );
    gsap.fromTo(this.content,
      { scale: 0.9, y: 20 },
      { scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.5)' }
    );
  }

  close() {
    gsap.to(this.wrapper, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        this.wrapper.style.display = 'none';
      }
    });
    gsap.to(this.content, {
      scale: 0.9, y: 10,
      duration: 0.3
    });
  }
}
