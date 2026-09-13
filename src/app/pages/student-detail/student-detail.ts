import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { FloatLabel } from 'primeng/floatlabel';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { DataService } from '../../services/data.service';
import { StudentProfile, PaymentStatus } from '../../models';

interface StatusOption {
  label: string;
  value: PaymentStatus;
}

@Component({
  selector: 'app-student-detail',
  imports: [
    RouterLink, FormsModule, DatePipe, Card, Tag, Button, InputText, FloatLabel,
    Message, Select, Tabs, TabList, Tab, TabPanels, TabPanel, TableModule,
  ],
  styleUrl: './student-detail.css',
  templateUrl: './student-detail.html',
})
export class StudentDetail {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);

  profile = signal<StudentProfile | null>(null);
  loading = signal(true);
  error = signal('');

  // exam form
  examSubject = '';
  examTitle = '';
  examGrade = 0;
  examMaxGrade = 100;
  examDate = new Date().toISOString().slice(0, 10);

  // homework form
  hwTitle = '';
  hwPoints = 0;
  hwMaxPoints = 10;
  hwFeedback = '';

  // payment form
  payMonth = new Date().toISOString().slice(0, 7);
  payAmount = 0;
  payStatus: PaymentStatus = 'unpaid';

  paymentStatuses: StatusOption[] = [
    { label: 'Unpaid', value: 'unpaid' },
    { label: 'Paid', value: 'paid' },
    { label: 'Late', value: 'late' },
  ];

  adding = signal('');
  formError = signal('');
  formOk = signal('');

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      this.profile.set(await this.data.getProfile(id));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      this.loading.set(false);
    }
  }

  private async refresh() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.profile.set(await this.data.getProfile(id));
  }

  async addExam() {
    const p = this.profile()!;
    this.formError.set('');
    this.adding.set('exam');
    try {
      await this.data.createExam({
        studentId: p.user._id,
        subject: this.examSubject,
        title: this.examTitle,
        grade: Number(this.examGrade),
        maxGrade: Number(this.examMaxGrade),
        date: this.examDate,
      });
      this.examTitle = '';
      this.examGrade = 0;
      this.formOk.set('Exam added');
      await this.refresh();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Failed');
    } finally {
      this.adding.set('');
    }
  }

  async addHomework() {
    const p = this.profile()!;
    this.formError.set('');
    this.adding.set('homework');
    try {
      await this.data.createHomework({
        studentId: p.user._id,
        title: this.hwTitle,
        points: Number(this.hwPoints),
        maxPoints: Number(this.hwMaxPoints),
        feedback: this.hwFeedback || undefined,
      });
      this.hwTitle = '';
      this.hwPoints = 0;
      this.formOk.set('Homework added');
      await this.refresh();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Failed');
    } finally {
      this.adding.set('');
    }
  }

  async addPayment() {
    const p = this.profile()!;
    this.formError.set('');
    this.adding.set('payment');
    try {
      await this.data.createPayment({
        studentId: p.user._id,
        month: this.payMonth,
        amount: Number(this.payAmount),
        status: this.payStatus,
      });
      this.formOk.set('Payment record added');
      await this.refresh();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Failed');
    } finally {
      this.adding.set('');
    }
  }

  async setPaymentStatus(id: string, status: PaymentStatus) {
    try {
      await this.data.updatePayment(id, { status });
      await this.refresh();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Failed');
    }
  }

  percent(grade: number, max: number) {
    return max > 0 ? Math.round((grade / max) * 100) : 0;
  }

  gradeSeverity(p: number): 'success' | 'warn' | 'danger' {
    if (p >= 85) return 'success';
    if (p >= 70) return 'warn';
    return 'danger';
  }

  paymentSeverity(status: string): 'success' | 'warn' | 'danger' | 'secondary' {
    if (status === 'paid') return 'success';
    if (status === 'late') return 'danger';
    return 'warn';
  }

  examsAverage() {
    const exams = this.profile()?.exams ?? [];
    if (exams.length === 0) return null;
    const total = exams.reduce((acc, e) => acc + this.percent(e.grade, e.maxGrade), 0);
    return Math.round(total / exams.length);
  }

  hwAverage() {
    const hw = this.profile()?.homeworks ?? [];
    if (hw.length === 0) return null;
    const total = hw.reduce((acc, h) => acc + this.percent(h.points, h.maxPoints), 0);
    return Math.round(total / hw.length);
  }

  initials(name: string) {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}