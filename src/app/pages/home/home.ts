import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { DataService } from '../../services/data.service';
import { Student, Lesson, ExamTemplate, PaymentWithStudent, PaymentStatus } from '../../models';

@Component({
  selector: 'app-home',
  imports: [DatePipe, Card, Tag, Message],
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  private data = inject(DataService);
  private router = inject(Router);

  loading = signal(true);
  error = signal('');

  students = signal<Student[]>([]);
  lessons = signal<Lesson[]>([]);
  exams = signal<ExamTemplate[]>([]);
  payments = signal<PaymentWithStudent[]>([]);

  activeStudents = computed(() => this.students().filter((s) => s.active).length);
  publishedLessons = computed(() => this.lessons().filter((l) => l.published).length);
  currentMonth = new Date().toISOString().slice(0, 7);
  now = new Date();

  unpaidPayments = computed(() =>
    this.payments().filter((p) => (p.status === 'unpaid' || p.status === 'late') && p.month === this.currentMonth),
  );

  pendingGradeExams = computed(() => {
    const active = this.activeStudents();
    return this.exams().filter((e) => e.gradedCount < active).map((e) => ({ e, remaining: active - e.gradedCount }));
  });

  recentLessonModules = computed(() => {
    const set = new Map<string, Lesson[]>();
    for (const l of this.lessons()) {
      const arr = set.get(l.module) ?? [];
      arr.push(l);
      set.set(l.module, arr);
    }
    return [...set.entries()]
      .map(([module, items]) => ({ module, count: items.length, latest: items[0].uploadDate }))
      .sort((a, b) => (a.latest < b.latest ? 1 : -1))
      .slice(0, 4);
  });

  async ngOnInit() {
    const [students, lessons, exams, payments] = await Promise.allSettled([
      this.data.listStudents(),
      this.data.listLessons(),
      this.data.listExamTemplates(),
      this.data.listPayments(),
    ]);
    if (students.status === 'fulfilled') this.students.set(students.value);
    if (lessons.status === 'fulfilled') this.lessons.set(lessons.value);
    if (exams.status === 'fulfilled') this.exams.set(exams.value);
    if (payments.status === 'fulfilled') this.payments.set(payments.value);
    const failed = [students, lessons, exams, payments].some((r) => r.status === 'rejected');
    if (failed) this.error.set('Some data could not be loaded — showing what is available.');
    this.loading.set(false);
  }

  go(path: string, query: Record<string, string> = {}) {
    this.router.navigate([path], { queryParams: query });
  }

  paymentTag(status: PaymentStatus): 'success' | 'warn' | 'danger' {
    if (status === 'paid') return 'success';
    if (status === 'late') return 'danger';
    return 'warn';
  }

  percent(graded: number, active: number) {
    return active > 0 ? Math.round((graded / active) * 100) : 0;
  }
}