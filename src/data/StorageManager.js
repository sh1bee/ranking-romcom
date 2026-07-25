export class StorageManager {
  static STORAGE_KEY = 'rankedMovies';

  static loadMovies() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load movies from localStorage', e);
      return [];
    }
  }

  static saveMovie(movie) {
    const movies = this.loadMovies();
    // movie format: { id: string, tier: 'S', title: 'Avatar', review: 'Great!', image: 'data:image/jpeg;base64,...' }
    movies.push(movie);
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(movies));
      return true;
    } catch (e) {
      console.error('Failed to save movie, localStorage might be full.', e);
      alert('Lưu thất bại: Bộ nhớ trình duyệt đã đầy (LocalStorage Quota Exceeded).');
      return false;
    }
  }

  static getMoviesByTier(tier) {
    return this.loadMovies().filter(m => m.tier === tier);
  }

  static deleteMovie(id) {
    const movies = this.loadMovies();
    const updatedMovies = movies.filter(m => m.id !== id);
    if (movies.length !== updatedMovies.length) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedMovies));
      return true;
    }
    return false;
  }

  /**
   * Compresses an image File/Blob into a 512x512 Data URL (JPEG)
   */
  static compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Keep original aspect ratio but limit max dimension to 1024 for higher quality
        const MAX_DIMENSION = 1024;
        let targetWidth = img.width;
        let targetHeight = img.height;

        if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
          if (targetWidth > targetHeight) {
            targetHeight = Math.round(targetHeight * (MAX_DIMENSION / targetWidth));
            targetWidth = MAX_DIMENSION;
          } else {
            targetWidth = Math.round(targetWidth * (MAX_DIMENSION / targetHeight));
            targetHeight = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Convert to high quality JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        callback(compressedDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}
