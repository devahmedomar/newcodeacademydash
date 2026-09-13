import { Injectable, signal, computed } from '@angular/core';
import { ApiService } from './api.service';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(this.readStoredUser());
  readonly isTeacher = computed(() => this.user()?.role === 'teacher');

  constructor(private api: ApiService) {}

  private readStoredUser(): User | null {
    const raw = localStorage.getItem('nca_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  get token(): string | null {
    return localStorage.getItem('nca_token');
  }

  async login(email: string, password: string): Promise<User> {
    const res = await this.api.post<{ token: string; user: User }>('/auth/login', {
      email,
      password,
    });
    localStorage.setItem('nca_token', res.token);
    localStorage.setItem('nca_user', JSON.stringify(res.user));
    this.user.set(res.user);
    return res.user;
  }

  logout() {
    localStorage.removeItem('nca_token');
    localStorage.removeItem('nca_user');
    this.user.set(null);
  }
}