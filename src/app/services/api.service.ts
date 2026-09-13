import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl.replace(/\/+$/, '');

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = localStorage.getItem('nca_token');
    const res = await fetch(this.base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && 'message' in data
          ? String((data as { message: string }).message)
          : `Request failed (${res.status})`;
      if (res.status === 401) {
        localStorage.removeItem('nca_token');
        localStorage.removeItem('nca_user');
      }
      throw new ApiError(res.status, msg);
    }

    return data as T;
  }

  get<T>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body: unknown) {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>('PUT', path, body);
  }
  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }
}