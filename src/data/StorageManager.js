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
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Draw image covering the 512x512 canvas (cover behavior)
        const scale = Math.max(512 / img.width, 512 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (512 - w) / 2;
        const y = (512 - h) / 2;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 512, 512);
        ctx.drawImage(img, x, y, w, h);
        
        // Convert to high-compression JPEG to save localStorage space (0.7 quality)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        callback(compressedDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}
