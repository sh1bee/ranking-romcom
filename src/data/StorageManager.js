import { DEFAULT_ROMCOMS } from './defaultRomcoms.js';

export class StorageManager {
  static STORAGE_KEY = 'rankedMovies';
  static DB_NAME = 'RankingRomcomDB';
  static STORE_NAME = 'movies';
  static DB_VERSION = 1;
  static _cache = [];
  static _db = null;

  /**
   * Initializes IndexedDB and loads existing data into memory cache.
   * Migrates existing legacy movies from LocalStorage if needed.
   */
  static async init() {
    // 1. First, load existing items from LocalStorage as initial fallback / source of truth for migration
    let localData = [];
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) localData = JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse localStorage during init:', e);
    }
    this._cache = localData || [];

    // 2. Open IndexedDB (which handles massive files & images up to Gigabytes)
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('IndexedDB not supported in this browser, relying solely on localStorage.');
      return;
    }

    try {
      this._db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.STORE_NAME)) {
            db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          }
        };
      });

      // 3. Load items from IndexedDB
      const dbMovies = await this._getAllFromDB();
      
      // 4. Smart Merge & Migrate between LocalStorage, IndexedDB, and updated DEFAULT_ROMCOMS dataset
      const map = new Map();
      dbMovies.forEach(m => map.set(m.id, m));
      localData.forEach(m => map.set(m.id, m)); // ensure recent or local items are preserved

      // Auto-merge any newly added movies from code updates (DEFAULT_ROMCOMS) into browser storage
      DEFAULT_ROMCOMS.forEach(m => {
        if (!map.has(m.id)) {
          map.set(m.id, m);
        }
      });
      
      this._cache = Array.from(map.values());
      
      // Ensure IndexedDB and LocalStorage are up to date with merged results
      await this._saveAllToDB(this._cache);
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
      } catch (e) {
        console.warn('LocalStorage quota exceeded during sync, saved in IndexedDB.');
      }
    } catch (err) {
      console.error('Failed to initialize IndexedDB, fallback to localStorage:', err);
    }

    // 6. Utility: Cho phép người dùng trích xuất nguyên trạng dữ liệu trên localhost thành file defaultRomcoms.js
    if (typeof window !== 'undefined') {
      window.exportDefaultRomcoms = () => {
        const dataStr = "export const DEFAULT_ROMCOMS = " + JSON.stringify(StorageManager._cache, null, 2) + ";\n";
        
        // Tự động tạo và tải xuống file defaultRomcoms.js
        const blob = new Blob([dataStr], { type: 'text/javascript;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'defaultRomcoms.js';
        a.click();
        URL.revokeObjectURL(url);

        // Đồng thời chép thẳng vào Clipboard cho nhanh
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(dataStr).catch(() => {});
        }

        alert("🎉 ĐÃ XUẤT THÀNH CÔNG!\n\nFile 'defaultRomcoms.js' chứa nguyên trọn 100% dữ liệu và hình ảnh trên localhost của bạn vừa được tải xuống máy.\n\n👉 Bạn hãy lấy file tải xuống đó thay thế vào 'src/data/defaultRomcoms.js' trong code rồi git push lên Vercel nhé!");
      };

      // Tự động gán tổ hợp phím Cmd+Shift+E (hoặc Ctrl+Shift+E) để xuất nhanh
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
          e.preventDefault();
          window.exportDefaultRomcoms();
        }
      });

      // Utility: Cho phép tải lại chính xác dữ liệu gốc trong defaultRomcoms.js (xác minh bản mới trên web live)
      window.resetToDefault = async () => {
        if (!confirm("⚡ Bạn có muốn tải lại chính xác bộ dữ liệu mặc định (defaultRomcoms.js) mới nhất không?")) return;
        StorageManager._cache = [...DEFAULT_ROMCOMS];
        if (StorageManager._db) {
          try {
            const transaction = StorageManager._db.transaction(StorageManager.STORE_NAME, 'readwrite');
            const store = transaction.objectStore(StorageManager.STORE_NAME);
            store.clear();
            StorageManager._cache.forEach(m => store.put(m));
          } catch (e) {}
        }
        try {
          localStorage.setItem(StorageManager.STORAGE_KEY, JSON.stringify(StorageManager._cache));
        } catch (e) {}
        location.reload();
      };

      // Tổ hợp phím Option+Shift+R (hoặc Alt+Shift+R) để Khôi phục & Cập nhật danh sách gốc
      window.addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'r') {
          e.preventDefault();
          window.resetToDefault();
        }
      });
    }
  }

  static _getAllFromDB() {
    if (!this._db) return Promise.resolve([]);
    return new Promise((resolve) => {
      try {
        const transaction = this._db.transaction(this.STORE_NAME, 'readonly');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  static async _saveAllToDB(movies) {
    if (!this._db) return;
    return new Promise((resolve) => {
      try {
        const transaction = this._db.transaction(this.STORE_NAME, 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);
        store.clear();
        movies.forEach(m => store.put(m));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  static loadMovies() {
    // Returns immediately from high-speed synchronous memory cache
    return [...this._cache];
  }

  static saveMovie(movie) {
    // 1. Immediately update synchronous memory cache
    this._cache.push(movie);

    // 2. Persist to unlimited IndexedDB asynchronously in the background!
    this._saveAllToDB(this._cache).catch(err => console.error(err));

    // 3. Try best-effort saving to localStorage as a fallback, but silently ignore Quota Exceeded exceptions
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
    } catch (e) {
      console.warn('LocalStorage quota exceeded (expected for large image galleries). Safely stored in IndexedDB instead!');
    }

    return true;
  }

  static getMoviesByTier(tier) {
    return this.loadMovies().filter(m => m.tier === tier);
  }

  static deleteMovie(id) {
    const origLen = this._cache.length;
    this._cache = this._cache.filter(m => m.id !== id);
    
    if (this._cache.length !== origLen) {
      // Update IndexedDB
      this._saveAllToDB(this._cache).catch(err => console.error(err));
      // Update localStorage fallback
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
      } catch (e) {
        console.warn('LocalStorage quota exceeded during delete fallback, ignoring.');
      }
      return true;
    }
    return false;
  }

  static updateMovie(updatedMovie) {
    const index = this._cache.findIndex(m => m.id === updatedMovie.id);
    if (index !== -1) {
      this._cache[index] = { ...this._cache[index], ...updatedMovie };
    } else {
      this._cache.push(updatedMovie);
    }
    this._saveAllToDB(this._cache).catch(err => console.error(err));
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
    } catch (e) {
      console.warn('LocalStorage quota exceeded during update fallback, ignoring.');
    }
    return true;
  }

  /**
   * Compresses an image File/Blob into a lightweight, high-quality Data URL (JPEG)
   */
  static compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Tối ưu kích thước: 640x640 là mức lý tưởng (sắc nét chất lượng cao trên tile 3D và tiết kiệm dung lượng)
        const MAX_DIMENSION = 640;
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
        
        // Mức nén 0.78 giúp giảm tới 80% dung lượng ảnh JPEG mà mắt thường không thấy giảm chất lượng
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.78);
        callback(compressedDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}
