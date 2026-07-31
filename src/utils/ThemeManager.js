export class ThemeManager {
  static THEME_KEY = 'tier_app_theme';

  static init() {
    const savedTheme = localStorage.getItem(this.THEME_KEY) || 'light';
    this.setTheme(savedTheme);
  }

  static getTheme() {
    return document.body.dataset.theme || 'light';
  }

  static setTheme(theme) {
    if (theme === 'dark') {
      document.body.dataset.theme = 'dark';
    } else {
      delete document.body.dataset.theme;
    }
    localStorage.setItem(this.THEME_KEY, theme);
    
    // Dispatch event so 3D components can react
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  static toggle() {
    const current = this.getTheme();
    this.setTheme(current === 'light' ? 'dark' : 'light');
  }
}
