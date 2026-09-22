import { Component, inject, signal } from '@angular/core';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import * as XLSX from 'xlsx';
import { DataService } from '../../services/data.service';
import {
  Student,
  Lesson,
  ExamTemplate,
  PaymentWithStudent,
  HomeworkWithStudent,
  StudentProfile,
} from '../../models';

interface SheetSpec {
  name: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

interface ReportMeta {
  id: string;
  title: string;
  desc: string;
  icon: string;
  tone: 'primary' | 'green' | 'amber' | 'blue' | 'purple' | 'cyan' | 'red';
  group: 'Finance' | 'Students' | 'Teaching';
}

@Component({
  selector: 'app-reports',
  imports: [Card, Button, Message],
  styleUrl: './reports.css',
  templateUrl: './reports.html',
})
export class Reports {
  private data = inject(DataService);

  loading = signal(true);
  error = signal('');
  busy = signal('');
  done = signal('');
  counts: Record<string, number> = {};

  reports: ReportMeta[] = [
    { id: 'student-roster', title: 'Student roster', desc: 'All student accounts — names, emails, enrollment date and account status.', icon: 'pi-users', tone: 'blue', group: 'Students' },
    { id: 'student-performance', title: 'Student performance', desc: 'Per-student scores across exams, homework and quizzes, plus points and payment standing.', icon: 'pi-chart-bar', tone: 'purple', group: 'Students' },
    { id: 'revenue', title: 'Revenue & payments', desc: 'Every payment record with a monthly revenue summary — paid, unpaid and late amounts.', icon: 'pi-wallet', tone: 'green', group: 'Finance' },
    { id: 'exam-results', title: 'Exam results', desc: 'All exam grades, each exam on its own sheet, with a summary of averages and completion.', icon: 'pi-clipboard', tone: 'amber', group: 'Teaching' },
    { id: 'homework', title: 'Homework', desc: 'Every homework submission with points earned versus maximum.', icon: 'pi-bookmark', tone: 'cyan', group: 'Teaching' },
    { id: 'quiz-performance', title: 'Quiz performance', desc: 'Every quiz attempt per student — score, total, percentage and date taken.', icon: 'pi-list-check', tone: 'primary', group: 'Teaching' },
    { id: 'lesson-catalog', title: 'Lesson catalog', desc: 'All lessons by module — publish status, order and video links.', icon: 'pi-video', tone: 'red', group: 'Teaching' },
  ];

  async ngOnInit() {
    const [students, lessons, exams, payments] = await Promise.allSettled([
      this.data.listStudents(),
      this.data.listLessons(),
      this.data.listExamTemplates(),
      this.data.listPayments(),
    ]);
    if (students.status === 'fulfilled') this.counts['student-roster'] = students.value.length;
    if (students.status === 'fulfilled') this.counts['student-performance'] = students.value.length;
    if (exams.status === 'fulfilled') this.counts['exam-results'] = exams.value.length;
    if (lessons.status === 'fulfilled') this.counts['lesson-catalog'] = lessons.value.length;
    if (payments.status === 'fulfilled') this.counts['revenue'] = payments.value.length;
    this.loading.set(false);
  }

  async run(report: ReportMeta) {
    if (this.busy()) return;
    this.busy.set(report.id);
    this.error.set('');
    this.done.set('');
    try {
      let sheets: SheetSpec[] = [];
      switch (report.id) {
        case 'student-roster': sheets = await this.studentRoster(); break;
        case 'student-performance': sheets = await this.studentPerformance(); break;
        case 'revenue': sheets = await this.revenue(); break;
        case 'exam-results': sheets = await this.examResults(); break;
        case 'homework': sheets = await this.homework(); break;
        case 'quiz-performance': sheets = await this.quizPerformance(); break;
        case 'lesson-catalog': sheets = await this.lessonCatalog(); break;
      }
      this.download(sheets, report.title);
      this.done.set(`“${report.title}” downloaded.`);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      this.busy.set('');
    }
  }

  private async studentRoster(): Promise<SheetSpec[]> {
    const students = await this.data.listStudents();
    return [
      {
        name: 'Students',
        headers: ['Name', 'Email', 'Enrolled', 'Status'],
        rows: students.map((s) => [s.name, s.email, this.fmtDate(s.enrollmentDate), s.active ? 'Active' : 'Inactive']),
      },
    ];
  }

  private async revenue(): Promise<SheetSpec[]> {
    const payments = await this.data.listPayments();
    const payRows = payments.map((p) => [
      this.studentName(p.studentId),
      p.month,
      p.amount,
      p.status.toUpperCase(),
      p.paidOn ? this.fmtDate(p.paidOn) : null,
    ]);

    const byMonth = new Map<string, { total: number; paid: number; unpaid: number; late: number }>();
    for (const p of payments) {
      const m = byMonth.get(p.month) ?? { total: 0, paid: 0, unpaid: 0, late: 0 };
      m.total += p.amount;
      if (p.status === 'paid') m.paid += p.amount;
      if (p.status === 'unpaid') m.unpaid += p.amount;
      if (p.status === 'late') m.late += p.amount;
      byMonth.set(p.month, m);
    }
    const monthRows = [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, m]) => [month, m.total, m.paid, m.unpaid, m.late]);

    const outstanding = payments.filter((p) => p.status !== 'paid').reduce((a, p) => a + p.amount, 0);
    const totalPaid = payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0);

    return [
      { name: 'Summary', headers: ['Metric', 'Value (EGP)'], rows: [
        ['Total expected', payments.reduce((a, p) => a + p.amount, 0)],
        ['Total collected', totalPaid],
        ['Outstanding (unpaid + late)', outstanding],
        ['Collection rate (%)', payments.length ? Math.round((totalPaid / payments.reduce((a, p) => a + p.amount, 0)) * 100) : 0],
      ] },
      { name: 'Payments', headers: ['Student', 'Month', 'Amount (EGP)', 'Status', 'Paid on'], rows: payRows },
      { name: 'Revenue by month', headers: ['Month', 'Expected (EGP)', 'Paid (EGP)', 'Unpaid (EGP)', 'Late (EGP)'], rows: monthRows },
    ];
  }

  private async examResults(): Promise<SheetSpec[]> {
    const exams = await this.data.listExamTemplates();
    const summary = exams.map((e) => [e.title, e.subject, e.maxGrade, e.gradedCount, e.averagePercent ?? null]);
    const sheets: SheetSpec[] = [
      { name: 'Summary', headers: ['Exam', 'Subject', 'Max grade', 'Grades recorded', 'Average (%)'], rows: summary },
    ];
    const used = new Map<string, number>();
    for (const e of exams) {
      let name = this.sanitizeSheetName(e.title) || 'Exam';
      if (used.has(name)) {
        const n = (used.get(name) ?? 0) + 1;
        used.set(name, n);
        name = `${name.slice(0, 27)} ${n}`;
      }
      used.set(name, 1);
      let rows: (string | number)[][] = [];
      try {
        const res = await this.data.listExamGrades(e._id);
        rows = res.grades.map((g) => [
          `${g.student.name} (${g.student.email})`,
          g.grade,
          e.maxGrade,
          this.percent(g.grade, e.maxGrade),
        ]);
      } catch {
        rows = [['Grades could not be loaded', '', '', '']];
      }
      sheets.push({ name, headers: ['Student', 'Grade', 'Max grade', 'Percent (%)'], rows });
    }
    return sheets;
  }

  private async homework(): Promise<SheetSpec[]> {
    const items = await this.data.listHomework();
    return [
      {
        name: 'Homework',
        headers: ['Student', 'Title', 'Points earned', 'Max points', 'Percent (%)', 'Submitted'],
        rows: items.map((h) => [
          this.studentName(h.studentId),
          h.title,
          h.points,
          h.maxPoints,
          this.percent(h.points, h.maxPoints),
          h.submittedAt ? this.fmtDate(h.submittedAt) : 'Not submitted',
        ]),
      },
    ];
  }

  private async quizPerformance(): Promise<SheetSpec[]> {
    const profiles = await this.loadProfiles();
    const rows: (string | number)[][] = [];
    for (const p of profiles) {
      for (const a of p.profile.quizAttempts) {
        rows.push([p.name, a.lessonTitle, a.module, a.score, a.total, a.percent, this.fmtDate(a.createdAt)]);
      }
    }
    return [{ name: 'Quiz attempts', headers: ['Student', 'Lesson', 'Module', 'Score', 'Total', 'Percent (%)', 'Taken'], rows }];
  }

  private async lessonCatalog(): Promise<SheetSpec[]> {
    const lessons = await this.data.listLessons();
    return [
      {
        name: 'Lessons',
        headers: ['Title', 'Module', 'Order', 'Published', 'Video ID', 'Has quiz', 'Uploaded'],
        rows: lessons
          .slice()
          .sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : a.order - b.order))
          .map((l: Lesson) => [
            l.title,
            l.module,
            l.order,
            l.published ? 'Yes' : 'No',
            l.youtubeVideoId,
            l.hasQuiz ? 'Yes' : 'No',
            l.uploadDate ? this.fmtDate(l.uploadDate) : null,
          ]),
      },
    ];
  }

  private async studentPerformance(): Promise<SheetSpec[]> {
    const list = await this.loadProfiles();
    const summary = list.map((p) => {
      const pts = p.profile.points;
      const unpaid = p.profile.payments.filter((x) => x.status !== 'paid').length;
      return [
        p.name,
        p.profile.user.email,
        this.fmtDate(p.profile.user.enrollmentDate),
        pts.total.earned,
        pts.total.possible,
        pts.total.percent,
        this.pBucketPct(pts.exams),
        this.pBucketPct(pts.homeworks),
        this.pBucketPct(pts.quizzes),
        unpaid,
      ];
    });
    const attempts: (string | number)[][] = [];
    for (const p of list) {
      for (const a of p.profile.quizAttempts) {
        attempts.push([p.name, a.lessonTitle, a.score, a.total, a.percent, this.fmtDate(a.createdAt)]);
      }
    }
    const sheets: SheetSpec[] = [
      {
        name: 'Summary',
        headers: ['Student', 'Email', 'Enrolled', 'Points earned', 'Points possible', 'Points (%)', 'Exams (%)', 'Homework (%)', 'Quizzes (%)', 'Unpaid months'],
        rows: summary,
      },
      { name: 'Quiz attempts', headers: ['Student', 'Lesson', 'Score', 'Total', 'Percent (%)', 'Taken'], rows: attempts },
    ];
    if (summary.length) {
      const avg = (fn: (r: (string | number)[]) => number) => {
        const vals = summary.map(fn).filter((v) => v != null);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      };
      sheets.push({
        name: 'Averages',
        headers: ['Metric', 'Value'],
        rows: [
          ['Students', summary.length],
          ['Average total points (%)', avg((r) => (r[5] as number) ?? 0)],
          ['Average exam score (%)', avg((r) => (r[6] as number) ?? 0)],
          ['Average homework score (%)', avg((r) => (r[7] as number) ?? 0)],
          ['Average quiz score (%)', avg((r) => (r[8] as number) ?? 0)],
          ['Students with unpaid months', summary.filter((r) => (r[9] as number) > 0).length],
        ],
      });
    }
    return sheets;
  }

  private async loadProfiles(): Promise<{ name: string; profile: StudentProfile }[]> {
    const students = await this.data.listStudents();
    const out: { name: string; profile: StudentProfile }[] = [];
    for (const s of students) {
      try {
        const profile = await this.data.getProfile(s._id);
        out.push({ name: s.name, profile });
      } catch {
        // skip students whose profile cannot load
      }
    }
    return out;
  }

  private download(sheets: SheetSpec[], title: string) {
    const wb = XLSX.utils.book_new();
    for (const s of sheets) {
      const ws =
        s.rows.length > 0
          ? XLSX.utils.aoa_to_sheet([s.headers, ...s.rows])
          : XLSX.utils.aoa_to_sheet([s.headers]);
      const width = s.headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }));
      ws['!cols'] = width;
      XLSX.utils.book_append_sheet(wb, ws, this.sanitizeSheetName(s.name));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${this.slug(title)}_${stamp}.xlsx`);
  }

  private pBucketPct(bucket: { earned: number; possible: number }) {
    return bucket.possible > 0 ? Math.round((bucket.earned / bucket.possible) * 100) : 0;
  }

  private studentName(id: { _id: string; name?: string; email?: string } | string) {
    if (typeof id === 'string') return id;
    return id.name ?? id._id;
  }

  private sanitizeSheetName(name: string) {
    return name.replace(/[[\]*?:/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
  }

  private percent(a: number, b: number) {
    return b > 0 ? Math.round((a / b) * 100) : 0;
  }

  private fmtDate(v: string): string {
    try {
      return new Date(v).toLocaleDateString();
    } catch {
      return String(v ?? '');
    }
  }

  private slug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  countFor(id: string) {
    const n = this.counts[id];
    return n === undefined ? null : n;
  }
}