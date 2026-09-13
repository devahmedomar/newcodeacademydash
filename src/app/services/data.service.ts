import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Student, Exam, Homework, Lesson, Payment, PaymentStatus, StudentProfile } from '../models';

@Injectable({ providedIn: 'root' })
export class DataService {
  constructor(private api: ApiService) {}

  listStudents() {
    return this.api.get<Student[]>('/students');
  }

  registerStudent(name: string, email: string, password: string) {
    return this.api.post<{ user: Student }>('/auth/register', { name, email, password });
  }

  getProfile(id: string) {
    return this.api.get<StudentProfile>(`/api/students/${id}`);
  }

  createExam(body: Omit<Exam, '_id'>) {
    return this.api.post<Exam>('/api/exams', body);
  }

  listExams() {
    return this.api.get<Exam[]>('/api/exams');
  }

  createHomework(body: Omit<Homework, '_id'>) {
    return this.api.post<Homework>('/api/homework', body);
  }

  createPayment(body: { studentId: string; month: string; amount: number; status: PaymentStatus }) {
    return this.api.post<Payment>('/api/payments', body);
  }

  updatePayment(id: string, body: Partial<Payment>) {
    return this.api.put<Payment>(`/api/payments/${id}`, body);
  }

  listLessons() {
    return this.api.get<Lesson[]>('/api/lessons');
  }

  createLesson(body: Omit<Lesson, '_id' | 'uploadDate'>) {
    return this.api.post<Lesson>('/api/lessons', body);
  }

  deleteLesson(id: string) {
    return this.api.delete<void>(`/api/lessons/${id}`);
  }

  updateLesson(id: string, body: Partial<Lesson>) {
    return this.api.put<Lesson>(`/api/lessons/${id}`, body);
  }
}