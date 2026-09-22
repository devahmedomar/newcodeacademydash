import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { FloatLabel } from 'primeng/floatlabel';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { DataService } from '../../services/data.service';
import { ExamTemplate } from '../../models';

@Component({
  selector: 'app-exams',
  imports: [FormsModule, DatePipe, Card, Button, InputText, FloatLabel, Message, Dialog, TableModule, Tag],
  styleUrl: './exams.css',
  templateUrl: './exams.html',
})
export class Exams {
  private data = inject(DataService);
  private route = inject(ActivatedRoute);

  exams = signal<ExamTemplate[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  totalGraded = computed(() => this.exams().reduce((a, e) => a + e.gradedCount, 0));
  overallAvg = computed(() => {
    const graded = this.exams().filter((e) => e.gradedCount > 0 && e.averagePercent != null);
    const total = graded.reduce((a, e) => a + (e.averagePercent ?? 0) * e.gradedCount, 0);
    const count = graded.reduce((a, e) => a + e.gradedCount, 0);
    return count > 0 ? Math.round(total / count) : null;
  });
  subjects = computed(() => [...new Set(this.exams().map((e) => e.subject))].length);

  showAdd = signal(false);
  showEdit = signal(false);
  editing: ExamTemplate | null = null;
  addTitle = '';
  addSubject = '';
  addMaxGrade = 100;
  addDate = new Date().toISOString().slice(0, 10);
  adding = false;
  saving = false;

  async ngOnInit() {
    await this.loadExams();
    if (this.route.snapshot.queryParamMap.get('new') === '1') this.openAdd();
  }

  async loadExams() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.exams.set(await this.data.listExamTemplates());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load exams');
    } finally {
      this.loading.set(false);
    }
  }

  openAdd() {
    this.addTitle = '';
    this.addSubject = '';
    this.addMaxGrade = 100;
    this.addDate = new Date().toISOString().slice(0, 10);
    this.success.set('');
    this.error.set('');
    this.showAdd.set(true);
  }

  openEdit(e: ExamTemplate) {
    this.editing = e;
    this.addTitle = e.title;
    this.addSubject = e.subject;
    this.addMaxGrade = e.maxGrade;
    this.addDate = new Date(e.date).toISOString().slice(0, 10);
    this.success.set('');
    this.error.set('');
    this.showEdit.set(true);
  }

  async addExam() {
    this.adding = true;
    try {
      await this.data.createExamTemplate({
        title: this.addTitle.trim(),
        subject: this.addSubject.trim(),
        maxGrade: Number(this.addMaxGrade),
        date: this.addDate,
      });
      this.showAdd.set(false);
      this.success.set('Exam created');
      await this.loadExams();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to create exam');
    } finally {
      this.adding = false;
    }
  }

  async saveExam() {
    const e = this.editing;
    if (!e) return;
    this.saving = true;
    try {
      await this.data.updateExamTemplate(e._id, {
        title: this.addTitle.trim(),
        subject: this.addSubject.trim(),
        maxGrade: Number(this.addMaxGrade),
        date: this.addDate,
      });
      this.showEdit.set(false);
      this.editing = null;
      this.success.set('Exam updated');
      await this.loadExams();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to update exam');
    } finally {
      this.saving = false;
    }
  }

  async deleteExam(e: ExamTemplate) {
    if (!confirm(`Delete "${e.title}" and all its grades?`)) return;
    try {
      await this.data.deleteExamTemplate(e._id);
      this.success.set('Exam deleted');
      await this.loadExams();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to delete exam');
    }
  }

  gradeSeverity(p: number): 'success' | 'warn' | 'danger' {
    if (p >= 85) return 'success';
    if (p >= 70) return 'warn';
    return 'danger';
  }
}