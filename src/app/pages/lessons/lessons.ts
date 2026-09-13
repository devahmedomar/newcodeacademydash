import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DataService } from '../../services/data.service';
import { Lesson } from '../../models';

@Component({
  selector: 'app-lessons',
  imports: [FormsModule, DatePipe],
  styleUrl: './lessons.css',
  templateUrl: './lessons.html',
})
export class Lessons {
  private data = inject(DataService);

  lessons = signal<Lesson[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  showAdd = signal(false);
  addTitle = '';
  addVideo = '';
  addModule = '';
  addOrder = 0;
  addDescription = '';
  addPublished = true;
  adding = false;

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

  toggleAdd() {
    this.showAdd.set(!this.showAdd());
    this.addModule = '';
    this.addOrder = this.lessons().length + 1;
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
      this.addTitle = '';
      this.addVideo = '';
      this.addDescription = '';
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
      await this.loadLessons();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed');
    }
  }

  async deleteLesson(l: Lesson) {
    if (!confirm(`Delete "${l.title}"?`)) return;
    try {
      await this.data.deleteLesson(l._id);
      await this.loadLessons();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed');
    }
  }

  modules() {
    const m = new Set(this.lessons().map((l) => l.module));
    return [...m];
  }

  byModule(module: string) {
    return this.lessons()
      .filter((l) => l.module === module)
      .sort((a, b) => a.order - b.order);
  }
}