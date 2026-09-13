import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { FloatLabel } from 'primeng/floatlabel';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { DataService } from '../../services/data.service';
import { Lesson } from '../../models';

@Component({
  selector: 'app-lessons',
  imports: [FormsModule, DatePipe, Card, Tag, Button, InputText, ToggleSwitch, FloatLabel, Message, Dialog, TableModule],
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
  addOrder = 1;
  addDescription = '';
  addPublished = true;
  adding = false;

  showEdit = signal(false);
  editingLesson: Lesson | null = null;
  saving = false;

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

  publishSeverity(published: boolean): 'success' | 'secondary' {
    return published ? 'success' : 'secondary';
  }
}