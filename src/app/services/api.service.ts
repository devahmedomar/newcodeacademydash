import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export class ApiError extends Error {
  /**
   * The parsed response body, so a caller that needs more than the one-line
   * message can read it — publishing, for instance, gets its whole readiness
   * checklist back in a 409 body and the dialog shows that list rather than a
   * locally re-derived guess that could drift from the server's rules.
   */
  constructor(
    public status: number,
    message: string,
    public body: unknown = null,
  ) {
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

    return this.unwrap<T>(res);
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
  patch<T>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  /**
   * POST a multipart/form-data body. Deliberately does not set Content-Type, so
   * the browser adds the multipart boundary itself.
   */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const token = localStorage.getItem('nca_token');
    const res = await fetch(this.base + path, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    return this.unwrap<T>(res);
  }

  /**
   * Slice a book PDF and upload it piece by piece, returning the session id.
   *
   * Vercel rejects any request body over 4.5 MB, so a PDF is posted in 3 MB
   * chunks. `onProgress` reports the share of chunks the server has acknowledged,
   * which is what drives the upload progress bar. The caller then finalises with a
   * normal JSON POST to `/api/books` carrying the returned `sessionId`.
   */
  async uploadBookChunks(file: File, onProgress?: (fraction: number) => void): Promise<string> {
    const chunkSize = 3 * 1024 * 1024;
    const total = Math.max(1, Math.ceil(file.size / chunkSize));
    const { sessionId } = await this.post<{ sessionId: string }>('/api/books/transcribe-session', {});

    for (let i = 0; i < total; i++) {
      const form = new FormData();
      form.append('sessionId', sessionId);
      form.append('index', String(i + 1));
      form.append('total', String(total));
      form.append('chunk', file.slice(i * chunkSize, (i + 1) * chunkSize), 'chunk');
      await this.postForm('/api/books/chunk', form);
      onProgress?.((i + 1) / total);
    }

    return sessionId;
  }

  private async unwrap<T>(res: Response): Promise<T> {
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
      throw new ApiError(res.status, msg, data);
    }

    return data as T;
  }
}