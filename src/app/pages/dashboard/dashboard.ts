import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { FloatLabel } from 'primeng/floatlabel';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';
import { DataService } from '../../services/data.service';
import { Student, ExamTemplate } from '../../models';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, FormsModule, DatePipe, Card, Tag, Button, InputText, FloatLabel, Message, Dialog, TableModule, Select],
  styleUrl: './dashboard.css',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private data = inject(DataService);

  students = signal<Student[]>([]);
  loading = signal(true);
  error = signal('');
  actionMsg = signal('');

  showAdd = signal(false);
  addName = '';
  addEmail = '';
  addPassword = '';
  addError = '';
  adding = false;

  showReset = signal(false);
  resetTarget: Student | null = null;
  resetPassword = '';
  resetError = '';
  resetting = false;
  deleting = signal('');
  restoring = signal('');

  exams = signal<ExamTemplate[]>([]);
  selectedExamId = signal('');
  gradeLoading = signal(false);
  savingFor = signal('');
  gradingMsg = signal('');
  gradingErr = signal('');
  gradesByStudent = signal<Record<string, number>>({});
  gradeInputs = signal<Record<string, number>>({});

  examOptions = computed(() =>
    this.exams().map((e) => ({ label: `${e.title} — ${e.subject}`, value: e._id })),
  );

  selectedExam = computed(
    () => this.exams().find((e) => e._id === this.selectedExamId()) ?? null,
  );

  async ngOnInit() {
    await Promise.all([this.loadStudents(), this.loadExams()]);
  }

  async loadStudents() {
    this.loading.set(true);
    this.error.set('');
    this.actionMsg.set('');
    try {
      this.students.set(await this.data.listStudents());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load students');
    } finally {
      this.loading.set(false);
    }
  }

  async loadExams() {
    try {
      this.exams.set(await this.data.listExamTemplates());
    } catch {
      // grading panel simply stays hidden when exams cannot load
    }
  }

  openAdd() {
    this.addError = '';
    this.addName = '';
    this.addEmail = '';
    this.addPassword = '';
    this.showAdd.set(true);
  }

  async addStudent() {
    this.addError = '';
    this.adding = true;
    try {
      const name = this.addName;
      await this.data.registerStudent(name, this.addEmail, this.addPassword);
      this.showAdd.set(false);
      await this.loadStudents();
      this.actionMsg.set(`Student ${name} created`);
    } catch (e) {
      this.addError = e instanceof Error ? e.message : 'Failed to add student';
    } finally {
      this.adding = false;
    }
  }

  openReset(s: Student) {
    this.resetTarget = s;
    this.resetPassword = '';
    this.resetError = '';
    this.actionMsg.set('');
    this.showReset.set(true);
  }

  async resetPasswordForTarget() {
    const s = this.resetTarget;
    if (!s) return;
    this.resetError = '';
    this.resetting = true;
    try {
      await this.data.resetStudentPassword(s._id, this.resetPassword);
      this.actionMsg.set(`Password reset for ${s.name}`);
      this.showReset.set(false);
      this.resetTarget = null;
    } catch (e) {
      this.resetError = e instanceof Error ? e.message : 'Failed to reset password';
    } finally {
      this.resetting = false;
    }
  }

  async deleteStudent(s: Student) {
    const ok = confirm(
      `Deactivate ${s.name}? Their login will be disabled and they'll be hidden from students, but every grade, homework, payment and quiz record is kept so they can be restored later.`
    );
    if (!ok) return;
    this.actionMsg.set('');
    this.deleting.set(s._id);
    try {
      await this.data.deleteStudent(s._id);
      await this.loadStudents();
      this.actionMsg.set(`Student ${s.name} deactivated`);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to deactivate student');
    } finally {
      this.deleting.set('');
    }
  }

  async restoreStudent(s: Student) {
    this.actionMsg.set('');
    this.restoring.set(s._id);
    try {
      await this.data.restoreStudent(s._id);
      await this.loadStudents();
      this.actionMsg.set(`Student ${s.name} restored`);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to restore student');
    } finally {
      this.restoring.set('');
    }
  }

  async onExamChange(id: string) {
    this.gradingErr.set('');
    this.gradingMsg.set('');
    this.gradesByStudent.set({});
    this.gradeInputs.set({});
    if (!id) return;
    this.gradeLoading.set(true);
    try {
      const res = await this.data.listExamGrades(id);
      const map: Record<string, number> = {};
      for (const g of res.grades) map[g.student._id] = g.grade;
      this.gradesByStudent.set(map);
      this.gradeInputs.set({ ...map });
    } catch (e) {
      this.gradingErr.set(e instanceof Error ? e.message : 'Failed to load grades');
    } finally {
      this.gradeLoading.set(false);
    }
  }

  async saveGrade(s: Student) {
    const exam = this.selectedExam();
    if (!exam) return;
    this.savingFor.set(s._id);
    this.gradingErr.set('');
    this.gradingMsg.set('');
    try {
      const value = Number(this.gradeInputs()[s._id]);
      if (!Number.isFinite(value)) throw new Error('Enter a valid score');
      await this.data.upsertExamGrade(exam._id, s._id, value);
      this.gradesByStudent.set({ ...this.gradesByStudent(), [s._id]: value });
      this.gradingMsg.set(`Grade saved for ${s.name}`);
    } catch (e) {
      this.gradingErr.set(e instanceof Error ? e.message : 'Failed to save grade');
    } finally {
      this.savingFor.set('');
    }
  }

  inputValue(s: Student) {
    const v = this.gradeInputs()[s._id];
    return v === undefined ? '' : v;
  }

  onScoreInput(s: Student, value: number | string | null) {
    const current = this.gradeInputs();
    if (value === '' || value === null || value === undefined) {
      const { [s._id]: _drop, ...rest } = current;
      this.gradeInputs.set(rest);
      return;
    }
    this.gradeInputs.set({ ...current, [s._id]: Number(value) });
  }

  existingGrade(s: Student) {
    return this.gradesByStudent()[s._id] ?? null;
  }

  selectedMax() {
    return this.selectedExam()?.maxGrade ?? 0;
  }

  gradeSummary(s: Student) {
    const g = this.existingGrade(s);
    return g != null ? `${g} · ${this.percent(g, this.selectedMax())}%` : '';
  }

  gradeSeverityFor(s: Student): 'success' | 'warn' | 'danger' {
    const g = this.existingGrade(s);
    if (g == null) return 'danger';
    if (g >= this.selectedMax() * 0.85) return 'success';
    if (g >= this.selectedMax() * 0.7) return 'warn';
    return 'danger';
  }

  percent(grade: number, max: number) {
    return max > 0 ? Math.round((grade / max) * 100) : 0;
  }

  severity(active: boolean): 'success' | 'secondary' {
    return active ? 'success' : 'secondary';
  }
}