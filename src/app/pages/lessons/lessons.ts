import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { FloatLabel } from 'primeng/floatlabel';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { DataService } from '../../services/data.service';
import { Lesson, QuizQuestionFull } from '../../models';

interface QuizRow {
  question: string;
  options: string[];
  correct: number;
}

@Component({
  selector: 'app-lessons',
  imports: [FormsModule, DatePipe, Card, Button, InputText, ToggleSwitch, FloatLabel, Message, Dialog],
  styleUrl: './lessons.css',
  templateUrl: './lessons.html',
})
export class Lessons {
  private data = inject(DataService);

  lessons = signal<Lesson[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  search = signal('');
  selectedModule = signal('All');

  modules = computed(() => [...new Set(this.lessons().map((l) => l.module))].sort((a, b) => a.localeCompare(b)));
  allModules = computed(() => ['All', ...this.modules()]);
  publishedCount = computed(() => this.lessons().filter((l) => l.published).length);
  draftCount = computed(() => this.lessons().length - this.publishedCount());

  filteredLessons = computed(() => {
    const q = this.search().trim().toLowerCase();
    const m = this.selectedModule();
    return this.lessons().filter(
      (l) =>
        (m === 'All' || l.module === m) &&
        (!q || [l.title, l.module, l.youtubeVideoId, l.description ?? ''].join(' ').toLowerCase().includes(q)),
    );
  });

  grouped = computed(() => {
    const list = this.filteredLessons();
    return this.modules()
      .filter((m) => list.some((l) => l.module === m))
      .map((m) => {
        const lessons = list.filter((l) => l.module === m).sort((a, b) => a.order - b.order);
        return { module: m, lessons, published: lessons.filter((l) => l.published).length };
      });
  });

  showAdd = signal(false);
  addTitle = '';
  addVideo = '';
  addModule = '';
  addOrder = 1;
  addDescription = '';
  addPublished = true;
  adding = false;

  showEdit = signal(false);
  editingLesson: Lesson | null = null;
  saving = false;

  showQuiz = signal(false);
  quizLesson = signal<Lesson | null>(null);
  quizRows: QuizRow[] = [];
  quizLoading = signal(false);
  quizSaving = false;
  quizMsg = signal('');
  quizErr = signal('');

  quizHasExisting = signal(false);

  async ngOnInit() {
    await this.loadLessons();
  }

  async loadLessons() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.lessons.set(await this.data.listLessons());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load lessons');
    } finally {
      this.loading.set(false);
    }
  }

  openAdd() {
    this.addTitle = '';
    this.addVideo = '';
    this.addModule = '';
    this.addOrder = this.lessons().length + 1;
    this.addDescription = '';
    this.addPublished = true;
    this.success.set('');
    this.error.set('');
    this.showAdd.set(true);
  }

  openEdit(l: Lesson) {
    this.editingLesson = l;
    this.addTitle = l.title;
    this.addVideo = l.youtubeVideoId;
    this.addModule = l.module;
    this.addOrder = l.order;
    this.addDescription = l.description ?? '';
    this.addPublished = l.published;
    this.success.set('');
    this.error.set('');
    this.showEdit.set(true);
  }

  async saveLesson() {
    const l = this.editingLesson;
    if (!l) return;
    this.saving = true;
    try {
      await this.data.updateLesson(l._id, {
        title: this.addTitle,
        description: this.addDescription || undefined,
        youtubeVideoId: this.addVideo,
        module: this.addModule,
        order: Number(this.addOrder),
        published: this.addPublished,
      });
      this.showEdit.set(false);
      this.editingLesson = null;
      this.success.set('Lesson updated');
      await this.loadLessons();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to update lesson');
    } finally {
      this.saving = false;
    }
  }

  async addLesson() {
    this.adding = true;
    try {
      await this.data.createLesson({
        title: this.addTitle,
        description: this.addDescription || undefined,
        youtubeVideoId: this.addVideo,
        module: this.addModule,
        order: Number(this.addOrder),
        published: this.addPublished,
      });
      this.showAdd.set(false);
      this.success.set('Lesson added');
      await this.loadLessons();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to add lesson');
    } finally {
      this.adding = false;
    }
  }

  async togglePublish(l: Lesson) {
    try {
      await this.data.updateLesson(l._id, { published: !l.published });
      this.success.set(l.published ? 'Lesson published' : 'Lesson hidden from students');
      await this.loadLessons();
    } catch (e) {
      await this.loadLessons();
      this.error.set(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  async deleteLesson(l: Lesson) {
    if (!confirm(`Delete "${l.title}"?`)) return;
    try {
      await this.data.deleteLesson(l._id);
      this.success.set('Lesson deleted');
      await this.loadLessons();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed');
    }
  }

  countFor(m: string) {
    if (m === 'All') return this.lessons().length;
    return this.lessons().filter((l) => l.module === m).length;
  }

  private blankQuestion(): QuizRow {
    return { question: '', options: ['', '', '', ''], correct: 0 };
  }

  async openQuizEditor(l: Lesson) {
    this.quizLesson.set(l);
    this.quizMsg.set('');
    this.quizErr.set('');
    this.quizRows = [this.blankQuestion()];
    this.quizHasExisting.set(false);
    this.showQuiz.set(true);
    this.quizLoading.set(true);
    try {
      const quiz = await this.data.getLessonQuiz(l._id);
      this.quizRows = quiz.questions.map((q) => ({ question: q.question, options: [...q.options], correct: q.correctIndex }));
      this.quizHasExisting.set(true);
    } catch (e) {
      // no quiz yet — start with one blank question
      if ((e as { status?: number }).status !== 404) {
        this.quizErr.set(e instanceof Error ? e.message : 'Failed to load quiz');
      }
    } finally {
      this.quizLoading.set(false);
    }
  }

  addQuestion() {
    this.quizRows.push(this.blankQuestion());
  }

  removeQuestion(ri: number) {
    if (this.quizRows.length <= 1) return;
    this.quizRows.splice(ri, 1);
    this.quizRows = [...this.quizRows];
  }

  setOption(row: QuizRow, oi: number, value: string) {
    row.options[oi] = value;
  }

  addOption(row: QuizRow) {
    if (row.options.length >= 6) return;
    row.options.push('');
  }

  removeOption(row: QuizRow, oi: number) {
    if (row.options.length <= 2) return;
    row.options.splice(oi, 1);
    if (row.correct > row.options.length - 1) row.correct = row.options.length - 1;
  }

  canSaveQuiz() {
    const filled = this.quizRows.filter((q) => {
      const options = q.options.map((o) => o.trim()).filter(Boolean);
      return q.question.trim() && options.length >= 2 && q.correct >= 0 && q.correct < q.options.length;
    });
    return filled.length === this.quizRows.length && this.quizRows.length > 0;
  }

  async saveQuiz() {
    const l = this.quizLesson();
    if (!l) return;
    this.quizSaving = true;
    this.quizErr.set('');
    try {
      const questions = this.quizRows.map((q) => {
        const options = q.options.map((o) => o.trim()).filter(Boolean);
        const correct = Math.min(Math.max(q.correct, 0), options.length - 1);
        return { question: q.question.trim(), options, correctIndex: correct } as QuizQuestionFull;
      });
      await this.data.saveLessonQuiz(l._id, questions);
      this.showQuiz.set(false);
      this.success.set('Quiz saved');
      this.quizHasExisting.set(true);
      await this.loadLessons();
    } catch (e) {
      this.quizErr.set(e instanceof Error ? e.message : 'Failed to save quiz');
    } finally {
      this.quizSaving = false;
    }
  }

  async deleteQuiz() {
    const l = this.quizLesson();
    if (!l) return;
    if (!confirm(`Delete the quiz for "${l.title}"?`)) return;
    this.quizSaving = true;
    this.quizErr.set('');
    try {
      await this.data.deleteLessonQuiz(l._id);
      this.showQuiz.set(false);
      this.success.set('Quiz deleted');
      this.quizHasExisting.set(false);
      await this.loadLessons();
    } catch (e) {
      this.quizErr.set(e instanceof Error ? e.message : 'Failed to delete quiz');
    } finally {
      this.quizSaving = false;
    }
  }

  thumbUrl(id: string) {
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  watchUrl(id: string) {
    return `https://www.youtube.com/watch?v=${id}`;
  }

  onThumbError(e: Event) {
    (e.target as HTMLImageElement).style.display = 'none';
  }
}