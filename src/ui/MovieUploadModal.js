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
            <img id="modal-preview-img" style="display:none;" />
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
    this.previewImg = this.wrapper.querySelector('#modal-preview-img');
    this.titleInput = this.wrapper.querySelector('#modal-title-input');
    this.reviewInput = this.wrapper.querySelector('#modal-review-input');
    
    this.tierBadge = this.wrapper.querySelector('#modal-tier-badge');
    
    this.cancelBtn = this.wrapper.querySelector('.modal-cancel-btn');
    this.submitBtn = this.wrapper.querySelector('.modal-submit-btn');

    this.attachEvents();
  }

  attachEvents() {
    this.cancelBtn.addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', () => this.close());
    
    // File upload handling
    this.dropzone.addEventListener('click', () => this.fileInput.click());
    
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        StorageManager.compressImage(file, (compressedDataUrl) => {
          this.currentImageData = compressedDataUrl;
          this.previewImg.src = compressedDataUrl;
          this.previewImg.style.display = 'block';
          this.wrapper.querySelector('.upload-icon').style.display = 'none';
          this.wrapper.querySelector('.upload-text').style.display = 'none';
        });
      }
    });

    this.submitBtn.addEventListener('click', () => {
      const title = this.titleInput.value.trim();
      if (!title) {
        alert("Please enter a movie title.");
        return;
      }

      const movieData = {
        id: 'movie_' + Date.now(),
        tier: this.currentTier,
        title: title,
        review: this.reviewInput.value.trim(),
        image: this.currentImageData || null
      };

      this.onSubmit(movieData);
      this.close();
    });
  }

  open(tierKey) {
    this.currentTier = tierKey;
    this.tierBadge.textContent = tierKey;
    
    // Reset form
    this.titleInput.value = '';
    this.reviewInput.value = '';
    this.fileInput.value = '';
    this.currentImageData = null;
    this.previewImg.src = '';
    this.previewImg.style.display = 'none';
    this.wrapper.querySelector('.upload-icon').style.display = 'block';
    this.wrapper.querySelector('.upload-text').style.display = 'block';

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
