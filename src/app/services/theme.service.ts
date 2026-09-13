import { Injectable, signal } from '@angular/core';

const KEY = 'nca_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal<'dark' | 'light'>(this.stored() === 'dark' ? 'dark' : 'light');

  constructor() {
    this.applyClass();
  }

  private stored(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  private applyClass() {
    document.body.classList.toggle('dark-mode', this.isDark() === 'dark');
  }

  toggle() {
    this.isDark.set(this.isDark() === 'dark' ? 'light' : 'dark');
    try {
      localStorage.setItem(KEY, this.isDark());
    } catch {
      /* ignore */
    }
    this.applyClass();
  }
}