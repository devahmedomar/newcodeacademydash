import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import {
  Student,
  Exam,
  ExamTemplate,
  ExamGradesResponse,
  PaymentWithStudent,
  HomeworkWithStudent,
  Homework,
  Lesson,
  Payment,
  PaymentStatus,
  StudentProfile,
  QuizFull,
  QuizQuestionFull,
  Book,
  BookPagesResponse,
  AssignmentRoster,
  BlueprintResponse,
  CreateBookResponse,
  ExamDifficulty,
  ExamForm,
  ExamResultsResponse,
  ExamSet,
  GenerateFormResponse,
  GradeOverride,
  OverrideGradeResponse,
  PublishResponse,
  QuestionEdit,
  TranscribeStepResponse,
  VerifyIssue,
  VerifyResponse,
} from '../models';

@Injectable({ providedIn: 'root' })
export class DataService {
  constructor(private api: ApiService) {}

  listStudents() {
    return this.api.get<Student[]>('/students');
  }

  registerStudent(name: string, email: string, password: string) {
    return this.api.post<{ user: Student }>('/auth/register', { name, email, password });
  }

  resetStudentPassword(id: string, password: string) {
    return this.api.put<{ message: string }>(`/api/students/${id}/password`, { password });
  }

  deleteStudent(id: string) {
    return this.api.delete<{ message: string }>(`/api/students/${id}`);
  }

  restoreStudent(id: string) {
    return this.api.put<{ message: string }>(`/api/students/${id}/restore`, {});
  }

  getProfile(id: string) {
    return this.api.get<StudentProfile>(`/api/students/${id}`);
  }

  listExamTemplates() {
    return this.api.get<ExamTemplate[]>('/api/exams');
  }

  createExamTemplate(body: { title: string; subject: string; maxGrade: number; date?: string }) {
    return this.api.post<ExamTemplate>('/api/exams', body);
  }

  updateExamTemplate(id: string, body: { title: string; subject: string; maxGrade: number; date?: string }) {
    return this.api.put<ExamTemplate>(`/api/exams/${id}`, body);
  }

  deleteExamTemplate(id: string) {
    return this.api.delete<void>(`/api/exams/${id}`);
  }

  listExamGrades(examId: string) {
    return this.api.get<ExamGradesResponse>(`/api/exams/${examId}/grades`);
  }

  upsertExamGrade(examId: string, studentId: string, grade: number) {
    return this.api.put<Exam>(`/api/exams/${examId}/grades`, { studentId, grade });
  }

  createHomework(body: Omit<Homework, '_id'>) {
    return this.api.post<Homework>('/api/homework', body);
  }

  listHomework() {
    return this.api.get<HomeworkWithStudent[]>('/api/homework');
  }

  createPayment(body: { studentId: string; month: string; amount: number; status: PaymentStatus }) {
    return this.api.post<Payment>('/api/payments', body);
  }

  updatePayment(id: string, body: Partial<Payment>) {
    return this.api.put<Payment>(`/api/payments/${id}`, body);
  }

  listPayments() {
    return this.api.get<PaymentWithStudent[]>('/api/payments');
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

  getLessonQuiz(lessonId: string) {
    return this.api.get<QuizFull>(`/api/lessons/${lessonId}/quiz`);
  }

  saveLessonQuiz(lessonId: string, questions: QuizQuestionFull[]) {
    return this.api.put<QuizFull>(`/api/lessons/${lessonId}/quiz`, { questions });
  }

  deleteLessonQuiz(lessonId: string) {
    return this.api.delete<void>(`/api/lessons/${lessonId}/quiz`);
  }

  /* Books ------------------------------------------------------------------ */

  listBooks() {
    return this.api.get<Book[]>('/api/books');
  }

  getBook(id: string) {
    return this.api.get<Book>(`/api/books/${id}`);
  }

  getBookPages(id: string, from: number, limit = 5) {
    return this.api.get<BookPagesResponse>(`/api/books/${id}/pages?from=${from}&limit=${limit}`);
  }

  createBook(body: { sessionId: string; title: string; fileName: string; sizeBytes: number }) {
    return this.api.post<CreateBookResponse>('/api/books', body);
  }

  transcribeBook(id: string, file: File, batchSize?: number) {
    const form = new FormData();
    form.append('file', file, file.name);
    if (batchSize) form.append('batchSize', String(batchSize));
    return this.api.postForm<TranscribeStepResponse>(`/api/books/${id}/transcribe`, form);
  }

  deleteBook(id: string) {
    return this.api.delete<void>(`/api/books/${id}`);
  }

  /* AI exam sets ------------------------------------------------------------- */

  listExamSets() {
    return this.api.get<ExamSet[]>('/api/exam-sets');
  }

  getExamSet(id: string) {
    return this.api.get<ExamSet>(`/api/exam-sets/${id}`);
  }

  createExamSet(body: {
    bookId: string;
    title: string;
    weekLabel?: string;
    lessonRef?: string;
    pageFrom: number;
    pageTo: number;
    difficulty: ExamDifficulty;
    mcqCount: number;
    shortCount: number;
    formCount: number;
    verifyOnGenerate: boolean;
    timeLimitMinutes?: number;
    passPercent: number;
  }) {
    return this.api.post<ExamSet>('/api/exam-sets', body);
  }

  /**
   * The server treats this as a patch: only the fields sent are changed, and the
   * page range is refused outright once a blueprint exists. `formCount` and
   * `maxAttempts` are omitted on purpose — the caller is not changing the shape of
   * an exam that already has papers.
   */
  updateExamSet(
    id: string,
    body: Partial<Pick<ExamSet, 'title' | 'weekLabel' | 'lessonRef' | 'difficulty' | 'passPercent' | 'timeLimitMinutes'>>,
  ) {
    return this.api.put<ExamSet>(`/api/exam-sets/${id}`, body);
  }

  deleteExamSet(id: string) {
    return this.api.delete<void>(`/api/exam-sets/${id}`);
  }

  /** Gemini call 1: read the page range and map its topics. */
  createBlueprint(setId: string) {
    return this.api.post<BlueprintResponse>(`/api/exam-sets/${setId}/blueprint`, {});
  }

  /** Gemini call N: build one form. Calling it again replaces that form. */
  generateForm(setId: string, label: string) {
    return this.api.post<GenerateFormResponse>(`/api/exam-sets/${setId}/forms/${label}`, {});
  }

  verifyExamForm(formId: string) {
    return this.api.post<VerifyResponse>(`/api/exam-forms/${formId}/verify`, {});
  }

  editExamQuestion(formId: string, questionId: string, body: QuestionEdit) {
    return this.api.put<{ form: ExamForm }>(`/api/exam-forms/${formId}/questions/${questionId}`, body);
  }

  regenerateExamQuestion(formId: string, questionId: string, issue: VerifyIssue, note: string) {
    return this.api.post<{ form: ExamForm }>(
      `/api/exam-forms/${formId}/questions/${questionId}/regenerate`,
      { issue, note },
    );
  }

  deleteExamQuestion(formId: string, questionId: string) {
    return this.api.delete<{ form: ExamForm }>(`/api/exam-forms/${formId}/questions/${questionId}`);
  }

  /**
   * Stamp a form as read.
   *
   * This is the gate on publishing: the server refuses to hand a paper to a
   * student until a teacher has said they have been through it.
   */
  markFormReviewed(formId: string, reviewed = true) {
    return this.api.post<{ form: ExamForm }>(`/api/exam-forms/${formId}/review`, { reviewed });
  }

  /** Deal a paper to every student and open the set. Safe to call twice. */
  publishExamSet(setId: string, body: { openUntil?: string | null } = {}) {
    return this.api.post<PublishResponse>(`/api/exam-sets/${setId}/publish`, body);
  }

  /** Withdraw a set from the students, or close it once they have sat it. */
  setExamStatus(setId: string, status: 'draft' | 'closed') {
    return this.api.patch<ExamSet>(`/api/exam-sets/${setId}/status`, { status });
  }

  listAssignments(setId: string) {
    return this.api.get<AssignmentRoster>(`/api/exam-sets/${setId}/assignments`);
  }

  overrideAssignment(setId: string, studentId: string, formLabel: string) {
    return this.api.patch<{
      studentId: string;
      formId: string;
      formLabel: string;
      source: 'auto' | 'teacher';
      assignedAt: string;
    }>(`/api/exam-sets/${setId}/assignments/${studentId}`, { formLabel });
  }

  /**
   * The class at a glance, plus every written answer the model was unsure about.
   *
   * One call rather than two: the per-paper averages are only meaningful next to
   * the rows, and the queue is only actionable next to the marks it will change.
   */
  listSetResults(setId: string) {
    return this.api.get<ExamResultsResponse>(`/api/exam-sets/${setId}/results`);
  }

  /**
   * Set a written answer's mark by hand. `teacherScore: null` clears the override.
   *
   * The server re-totals the whole attempt from its own rule, so the response
   * carries the new totals rather than only the edited answer — which is what lets
   * the screen update the row it came from without guessing.
   */
  overrideAttemptGrade(attemptId: string, body: GradeOverride) {
    return this.api.put<OverrideGradeResponse>(`/api/exam-attempts/${attemptId}/grade`, body);
  }
}