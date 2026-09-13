export interface Student {
  _id: string;
  name: string;
  email: string;
  role: 'student';
  enrollmentDate: string;
  active: boolean;
}

export interface Exam {
  _id: string;
  studentId: string;
  subject: string;
  lessonRef?: string;
  title: string;
  grade: number;
  maxGrade: number;
  date: string;
}

export interface ExamTemplate {
  _id: string;
  title: string;
  subject: string;
  maxGrade: number;
  date: string;
  lessonRef?: string;
  gradedCount: number;
  averagePercent: number | null;
}

export interface ExamGradePayload {
  _id: string;
  grade: number;
  student: {
    _id: string;
    name: string;
    email: string;
  };
}

export interface ExamGradesResponse {
  exam: { _id: string; title: string; subject: string; maxGrade: number; date: string };
  grades: ExamGradePayload[];
}

export interface Homework {
  _id: string;
  studentId: string;
  title: string;
  points: number;
  maxPoints: number;
  submittedAt?: string;
  feedback?: string;
}

export interface Lesson {
  _id: string;
  title: string;
  description?: string;
  youtubeVideoId: string;
  order: number;
  module: string;
  published: boolean;
  uploadDate: string;
}

export type PaymentStatus = 'paid' | 'unpaid' | 'late';

export interface Payment {
  _id: string;
  studentId: string;
  month: string;
  amount: number;
  status: PaymentStatus;
  paidOn?: string;
  markedBy: string;
}

export interface StudentProfile {
  user: Student;
  exams: Exam[];
  homeworks: Homework[];
  payments: Payment[];
  lessons: Lesson[];
  currentMonth: string;
  currentPayment: Payment | null;
}