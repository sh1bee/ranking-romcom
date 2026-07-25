import * as THREE from 'three';

/**
 * Creates high-res textures: either a vibrant interior photo card or solid color accent
 * @param {Object} card 
 * @returns {THREE.CanvasTexture}
 */
export function createCardTexture(card) {
  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Decide if this card is a solid color tile or an interior photo tile
  const isPhotoTile = card.id && (card.id.endsWith('1') || card.id.endsWith('3') || card.isPhoto);

  if (isPhotoTile) {
    renderInteriorPhotoCanvas(ctx, width, height, card);
  } else {
    renderSolidColorCanvas(ctx, width, height, card);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export function createMovieTexture(movie) {
  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  renderMovieCardCanvas(ctx, width, height, movie, () => {
    texture.needsUpdate = true;
  });

  return texture;
}

function renderSolidColorCanvas(ctx, width, height, card) {
  // Fill solid vibrant color
  const color = card.solidColor || card.gradient[0] || '#9B51E0';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  // Subtle inner border shadow
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, width - 12, height - 12);
}

function renderInteriorPhotoCanvas(ctx, width, height, card) {
  // Base room background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#EAE5D9');
  bgGrad.addColorStop(1, '#D8D0C0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Room Wall & Floor line
  const horizon = height * 0.65;
  ctx.fillStyle = '#C8BEA8';
  ctx.fillRect(0, horizon, width, height - horizon);

  ctx.strokeStyle = '#8C8270';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(width, horizon);
  ctx.stroke();

  // Window or Balcony view
  const winW = 180;
  const winH = 220;
  const winX = (width - winW) / 2;
  const winY = 60;

  // Sky outside window
  const skyGrad = ctx.createLinearGradient(0, winY, 0, winY + winH);
  skyGrad.addColorStop(0, '#60A5FA');
  skyGrad.addColorStop(1, '#93C5FD');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // Sun / Cloud
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(winX + 130, winY + 60, 30, 0, Math.PI * 2);
  ctx.fill();

  // Window frame
  ctx.strokeStyle = '#27272A';
  ctx.lineWidth = 10;
  ctx.strokeRect(winX, winY, winW, winH);
  ctx.beginPath();
  ctx.moveTo(winX + winW / 2, winY);
  ctx.lineTo(winX + winW / 2, winY + winH);
  ctx.stroke();

  // Furniture / Accent Couch or Plant
  const accentColor = card.gradient[0] || '#2563EB';
  ctx.fillStyle = accentColor;
  // Modern Sofa
  ctx.beginPath();
  ctx.roundRect(80, horizon - 50, 220, 80, [16, 16, 4, 4]);
  ctx.fill();

  // Sofa cushions
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(90, horizon - 40, 95, 60);
  ctx.fillRect(195, horizon - 40, 95, 60);

  // Plant Pot
  ctx.fillStyle = '#059669'; // Green leaves
  ctx.beginPath();
  ctx.arc(380, horizon - 70, 35, 0, Math.PI * 2);
  ctx.arc(400, horizon - 90, 25, 0, Math.PI * 2);
  ctx.arc(360, horizon - 90, 25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#D97706'; // Clay pot
  ctx.beginPath();
  ctx.moveTo(365, horizon - 40);
  ctx.lineTo(395, horizon - 40);
  ctx.lineTo(390, horizon);
  ctx.lineTo(370, horizon);
  ctx.closePath();
  ctx.fill();

  // Fine photo frame border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, width - 8, height - 8);
}

function renderMovieCardCanvas(ctx, width, height, movie, onUpdate) {
  const drawText = () => {
    // Gradient shadow at the bottom for text readability
    const grad = ctx.createLinearGradient(0, height * 0.4, 0, height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.85)');
    grad.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, height * 0.4, width, height * 0.6);

    // Helper function to cleanly truncate text with ellipsis (...) based on actual pixel width
    const truncateToFit = (text, maxW) => {
      if (!text) return '';
      if (ctx.measureText(text).width <= maxW) return text;
      let str = text;
      while (str.length > 0 && ctx.measureText(str + '...').width > maxW) {
        str = str.slice(0, -1);
      }
      return str.trimEnd() + '...';
    };

    // Set text shadows for maximum crispness & readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    const maxTextWidth = width - 56; // 28px padding on left and right

    // Draw Title (Fixed bold size, never squished horizontally)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    
    const rawTitle = movie.title || 'Unknown Title';
    const fittedTitle = truncateToFit(rawTitle, maxTextWidth);
    ctx.fillText(fittedTitle, 28, height - 76);

    // Draw Review/Rating (Significantly increased font size from 24px -> 34px bold)
    ctx.fillStyle = '#F43F5E'; // Vibrant pink/red accent for rating to stand out
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    
    const rawReview = movie.review || '';
    const fittedReview = truncateToFit(rawReview, maxTextWidth);
    if (fittedReview) {
      ctx.fillText(fittedReview, 28, height - 26);
    }

    // Reset shadows before border
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Fine border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, width - 6, height - 6);
  };

  if (movie.image) {
    const img = new Image();
    img.onload = () => {
      // Cover mode + Cropper offsets
      let zoom = 1, normX = 0, normY = 0;
      if (movie.crop) {
        zoom = movie.crop.zoom || 1;
        normX = movie.crop.x || 0;
        normY = movie.crop.y || 0;
      }

      const baseScale = Math.max(width / img.width, height / img.height);
      const w = img.width * baseScale * zoom;
      const h = img.height * baseScale * zoom;
      
      const maxX = Math.max(0, (w - width) / 2);
      const maxY = Math.max(0, (h - height) / 2);
      
      const x = (width - w) / 2 + (normX * maxX);
      const y = (height - h) / 2 + (normY * maxY);
      
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, x, y, w, h);
      
      drawText();
      if (onUpdate) onUpdate();
    };
    img.src = movie.image;
  } else {
    // Fallback solid color if no image
    ctx.fillStyle = '#18181B';
    ctx.fillRect(0, 0, width, height);
    drawText();
    if (onUpdate) onUpdate();
  }
}
