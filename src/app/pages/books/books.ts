import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { ProgressBar } from 'primeng/progressbar';
import { Tag } from 'primeng/tag';
import { DataService } from '../../services/data.service';
import { ApiService } from '../../services/api.service';
import { Book, BookPage, BookStatus } from '../../models';

/** Mirrors PDF_MAX_MB on the server. */
const MAX_MB = 80;
const PREVIEW_PAGES = 5;

type Stage = 'idle' | 'uploading' | 'extracting' | 'transcribing' | 'done' | 'error';

@Component({
  selector: 'app-books',
  imports: [FormsModule, DatePipe, DecimalPipe, Card, Button, InputText, Message, Dialog, ProgressBar, Tag],
  styleUrl: './books.css',
  templateUrl: './books.html',
})
export class Books {
  private data = inject(DataService);
  private api = inject(ApiService);

  books = signal<Book[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  showAdd = signal(false);
  title = '';
  file: File | null = null;
  dragging = signal(false);
  stage = signal<Stage>('idle');
  stageLabel = signal('');
  /** 0..1 while uploading chunks. */
  uploadProgress = signal(0);
  /** 0..1 while Gemini vision transcribes scanned pages. */
  transcribeProgress = signal(0);
  unreadableCount = signal(0);

  aiConfigured = signal(true);
  needsTranscriptionNote = signal('');

  showPages = signal(false);
  viewing = signal<Book | null>(null);
  pages = signal<BookPage[]>([]);
  pagesLoading = signal(false);
  pageFrom = signal(1);

  readyCount = computed(() => this.books().filter((b) => b.status === 'ready').length);
  pendingCount = computed(() => this.books().filter((b) => b.status !== 'ready' && b.status !== 'failed').length);
  totalPages = computed(() => this.books().reduce((n, b) => n + b.pageCount, 0));
  ocrCount = computed(() => this.books().filter((b) => b.ocrUsed).length);

  busy = computed(() => this.stage() !== 'idle' && this.stage() !== 'error');

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.books.set(await this.data.listBooks());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load books');
    } finally {
      this.loading.set(false);
    }
  }

  openAdd() {
    this.title = '';
    this.file = null;
    this.stage.set('idle');
    this.stageLabel.set('');
    this.uploadProgress.set(0);
    this.transcribeProgress.set(0);
    this.unreadableCount.set(0);
    this.needsTranscriptionNote.set('');
    this.success.set('');
    this.error.set('');
    this.showAdd.set(true);
  }

  onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.setFile(f);
    input.value = '';
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.setFile(f);
  }

  private setFile(f: File) {
    this.error.set('');
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
      this.error.set('Please choose a PDF file');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      this.error.set(`File is larger than ${MAX_MB} MB`);
      return;
    }
    this.file = f;
    if (!this.title.trim()) this.title = f.name.replace(/\.pdf$/i, '');
  }

  statusSeverity(s: BookStatus): 'success' | 'warn' | 'danger' | 'info' {
    if (s === 'ready') return 'success';
    if (s === 'failed') return 'danger';
    if (s === 'needs_transcription') return 'warn';
    return 'info';
  }

  statusLabel(s: BookStatus): string {
    switch (s) {
      case 'ready':
        return 'Ready';
      case 'failed':
        return 'Failed';
      case 'needs_transcription':
        return 'Needs transcription';
      default:
        return 'Extracting';
    }
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  /**
   * Upload, extract, then drive vision transcription to completion.
   *
   * Transcription runs one server batch per call because a whole scanned book is
   * far more work than a single request is allowed to do.
   */
  async submit() {
    const file = this.file;
    if (!file || !this.title.trim()) {
      this.error.set('Choose a PDF and give the book a title');
      return;
    }

    this.error.set('');
    this.success.set('');

    try {
      this.stage.set('uploading');
      this.stageLabel.set('Uploading…');
      this.uploadProgress.set(0);

      const sessionId = await this.api.uploadBookChunks(file, (f) => {
        this.uploadProgress.set(f);
        this.stageLabel.set(`Uploading… ${Math.round(f * 100)}%`);
      });

      this.stage.set('extracting');
      this.stageLabel.set('Reading the text layer…');
      this.uploadProgress.set(1);

      const created = await this.data.createBook({
        sessionId,
        title: this.title.trim(),
        fileName: file.name,
        sizeBytes: file.size,
      });

      this.aiConfigured.set(created.aiConfigured);
      await this.load();

      if (!created.needsTranscription) {
        this.finish(created.book);
        return;
      }

      this.needsTranscriptionNote.set(
        created.aiConfigured
          ? 'No text layer was found, so the pages are being transcribed by AI. This takes a moment.'
          : created.blockedReason ?? 'This book has no text layer.',
      );

      if (!created.aiConfigured) {
        this.stage.set('error');
        this.stageLabel.set('');
        this.error.set(created.blockedReason ?? 'GEMINI_API_KEY is not configured on the server');
        return;
      }

      await this.runTranscriptionLoop(created.book, file);
    } catch (e) {
      this.stage.set('error');
      this.stageLabel.set('');
      this.error.set(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  private async runTranscriptionLoop(book: Book, file: File) {
    this.stage.set('transcribing');
    let current = book;
    let unreadable = 0;

    // Generous ceiling: this is a safety net, the server decides when it is done.
    for (let step = 0; step < 400; step++) {
      this.stageLabel.set(`Transcribing pages with AI… (step ${step + 1})`);
      const res = await this.data.transcribeBook(current._id, file);
      unreadable += res.unreadable.length;
      current = res.book;
      this.transcribeProgress.set(Math.min(0.99, current.transcribeCursor / Math.max(1, current.pageCount)));
      this.unreadableCount.set(unreadable);

      if (res.done) break;
    }

    this.transcribeProgress.set(1);
    await this.load();
    this.finish(current);
  }

  private finish(book: Book) {
    this.stage.set('done');
    this.stageLabel.set('');
    this.showAdd.set(false);
    this.success.set(
      book.ocrUsed
        ? `"${book.title}" is ready — ${book.pageCount} pages transcribed with AI`
        : `"${book.title}" is ready — ${book.pageCount} pages`,
    );
    this.file = null;
  }

  /** Retry transcription for a book that failed or was left incomplete. */
  async retryTranscription(book: Book) {
    if (!this.file) return;
    this.error.set('');
    this.success.set('');
    this.showAdd.set(false);
    this.transcribeProgress.set(0);
    this.stage.set('transcribing');
    try {
      await this.runTranscriptionLoop(book, this.file);
    } catch (e) {
      this.stage.set('error');
      this.error.set(e instanceof Error ? e.message : 'Transcription failed');
    }
  }

  /**
   * A book that needs transcription still needs the original PDF, because the
   * bytes were discarded after the text layer was read. Ask for the same file
   * again, then drive the batch loop against the existing book.
   */
  async onRetryPick(book: Book, e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;

    this.file = f;
    await this.retryTranscription(book);
  }

  async deleteBook(b: Book) {
    if (!confirm(`Delete "${b.title}" and its extracted text?`)) return;
    this.error.set('');
    this.success.set('');
    try {
      await this.data.deleteBook(b._id);
      this.success.set('Book deleted');
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to delete book');
    }
  }

  async openPages(book: Book) {
    this.viewing.set(book);
    this.pageFrom.set(1);
    this.pages.set([]);
    this.showPages.set(true);
    await this.loadPages();
  }

  async loadPages() {
    const book = this.viewing();
    if (!book) return;
    this.pagesLoading.set(true);
    try {
      const res = await this.data.getBookPages(book._id, this.pageFrom(), PREVIEW_PAGES);
      this.pages.set(res.pages);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load pages');
    } finally {
      this.pagesLoading.set(false);
    }
  }

  nextPageWindow() {
    const book = this.viewing();
    if (!book) return;
    const next = this.pageFrom() + PREVIEW_PAGES;
    if (next > book.pageCount) return;
    this.pageFrom.set(next);
    void this.loadPages();
  }

  prevPageWindow() {
    const prev = this.pageFrom() - PREVIEW_PAGES;
    if (prev < 1) return;
    this.pageFrom.set(prev);
    void this.loadPages();
  }

  pageWindowEnd(book: Book): number {
    return Math.min(book.pageCount, this.pageFrom() + PREVIEW_PAGES - 1);
  }

  /** Rough prompt-token estimate for the selected range. */
  rangeTokens(book: Book): number {
    return Math.round(book.charCount / 2.5);
  }

  trackById(_i: number, b: Book) {
    return b._id;
  }

  trackByPage(_i: number, p: BookPage) {
    return p.pageNumber;
  }
}
