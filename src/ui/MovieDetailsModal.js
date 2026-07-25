import gsap from 'gsap';

export class MovieDetailsModal {
  constructor(containerElement, onDelete) {
    this.container = containerElement;
    this.onDelete = onDelete;
    this.currentCardInfo = null;
    this.build();
    this.attachEvents();
  }

  build() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'movie-details-modal';
    
    this.wrapper.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content glass-panel">
        <button class="modal-close-btn" title="Đóng">&times;</button>
        <button class="modal-delete-btn" title="Xóa phim này">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
        <div class="modal-body">
          <div class="movie-image-container">
            <img class="movie-image" src="" alt="Movie Cover" />
            <div class="movie-tier-badge"></div>
          </div>
          <div class="movie-info">
            <h2 class="movie-title"></h2>
            <div class="movie-review-scroll">
              <p class="movie-review"></p>
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(this.wrapper);

    this.backdrop = this.wrapper.querySelector('.modal-backdrop');
    this.modalContent = this.wrapper.querySelector('.modal-content');
    this.closeBtn = this.wrapper.querySelector('.modal-close-btn');
    this.deleteBtn = this.wrapper.querySelector('.modal-delete-btn');
    
    this.imgEl = this.wrapper.querySelector('.movie-image');
    this.tierBadgeEl = this.wrapper.querySelector('.movie-tier-badge');
    this.titleEl = this.wrapper.querySelector('.movie-title');
    this.reviewEl = this.wrapper.querySelector('.movie-review');

    // Initially hidden
    this.wrapper.style.display = 'none';
    this.wrapper.style.opacity = '0';
  }

  attachEvents() {
    const close = () => this.close();
    this.closeBtn.addEventListener('click', close);
    this.backdrop.addEventListener('click', close);

    this.deleteBtn.addEventListener('click', () => {
      if (confirm('Bạn có chắc muốn xóa phim này khỏi bảng xếp hạng không?')) {
        if (this.onDelete && this.currentCardInfo) {
          this.onDelete(this.currentCardInfo);
        }
        this.close();
      }
    });
  }

  open(cardInfo) {
    if (!cardInfo) return;
    this.currentCardInfo = cardInfo;

    // Populate data
    this.titleEl.textContent = cardInfo.title || 'Untitled';
    this.reviewEl.textContent = cardInfo.review || 'No review provided.';
    this.imgEl.src = cardInfo.image || 'https://via.placeholder.com/300x450/444/999?text=No+Image';
    
    // Tier badge colors
    const tierColors = {
      'S': { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', text: '#fff' },
      'A': { bg: 'linear-gradient(135deg, #ef4444, #b91c1c)', text: '#fff' },
      'B': { bg: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', text: '#fff' },
      'C': { bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', text: '#fff' }
    };
    
    const colors = tierColors[cardInfo.tier] || tierColors['C'];
    this.tierBadgeEl.textContent = cardInfo.tier;
    this.tierBadgeEl.style.background = colors.bg;
    this.tierBadgeEl.style.color = colors.text;

    this.wrapper.style.display = 'flex';
    
    gsap.to(this.wrapper, {
      opacity: 1,
      duration: 0.3,
      ease: 'power2.out'
    });

    gsap.fromTo(this.modalContent, 
      { y: 50, scale: 0.95, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.2)' }
    );
  }

  close() {
    gsap.to(this.modalContent, {
      y: 30, scale: 0.95, opacity: 0, duration: 0.3, ease: 'power2.in'
    });

    gsap.to(this.wrapper, {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        this.wrapper.style.display = 'none';
      }
    });
  }
}
