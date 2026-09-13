import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DataService } from '../../services/data.service';
import { StudentProfile, PaymentStatus } from '../../models';

@Component({
  selector: 'app-student-detail',
  imports: [RouterLink, FormsModule, DatePipe],
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
    }
  }

  async addHomework() {
    const p = this.profile()!;
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
    }
  }

  async addPayment() {
    const p = this.profile()!;
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

  badgeClass(status: string) {
    return `badge badge-${status}`;
  }
}