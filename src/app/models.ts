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

export interface HomeworkWithStudent extends Omit<Homework, 'studentId'> {
  studentId: { _id: string; name: string; email: string };
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
  hasQuiz?: boolean;
}

export interface QuizQuestionFull {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizFull {
  _id: string;
  lessonId: string;
  questions: QuizQuestionFull[];
}

export interface QuizAttemptSummary {
  _id: string;
  quizId: string;
  lessonId: string;
  lessonTitle: string;
  module: string;
  score: number;
  total: number;
  percent: number;
  createdAt: string;
}

export interface PointsBucket {
  earned: number;
  possible: number;
}

export interface PointsSummary {
  total: PointsBucket & { percent: number };
  quizzes: PointsBucket;
  homeworks: PointsBucket;
  exams: PointsBucket;
}

export type PaymentStatus = 'paid' | 'unpaid' | 'late';

export interface PaymentWithStudent extends Omit<Payment, 'studentId' | 'markedBy'> {
  studentId: { _id: string; name: string; email: string };
  markedBy: string;
}

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
  quizAttempts: QuizAttemptSummary[];
  quizBestAttempts: QuizAttemptSummary[];
  points: PointsSummary;
  currentMonth: string;
  currentPayment: Payment | null;
}

export type BookStatus = 'extracting' | 'needs_transcription' | 'ready' | 'failed';

export interface Book {
  _id: string;
  title: string;
  originalFileName: string;
  pageCount: number;
  language: string;
  status: BookStatus;
  ocrUsed: boolean;
  charCount: number;
  sizeBytes: number;
  failureReason?: string;
  extractedAt?: string;
  transcribeCursor: number;
  createdAt: string;
  updatedAt: string;
  /** Present only on the detail endpoint. */
  pagesWithText?: number;
  pagesStored?: number;
}

export interface BookPage {
  pageNumber: number;
  text: string;
  charCount: number;
  transcribed: boolean;
}

export interface BookPagesResponse {
  bookId: string;
  from: number;
  to: number;
  pageCount: number;
  pages: BookPage[];
}

export interface CreateBookResponse {
  book: Book;
  pageCount: number;
  charCount: number;
  textCoverage: number;
  needsTranscription: boolean;
  aiConfigured: boolean;
  blockedReason?: string;
}

export interface TranscribeStepResponse {
  done: boolean;
  processed: number;
  unreadable: number[];
  book: Book;
}

/* AI exam sets ---------------------------------------------------------------- */

export type ExamDifficulty = 'easy' | 'medium' | 'hard';
export type ExamSetStatus = 'draft' | 'published' | 'closed';
export type ExamQuestionType = 'mcq' | 'short';
export type VerifyIssue = 'none' | 'ambiguous' | 'multiple_correct' | 'not_in_source' | 'bad_distractor';
export type VerifyStatus = 'pending' | 'ok' | 'repaired' | 'flagged';

export interface BlueprintTopic {
  topic: string;
  weight: number;
  keywords: string[];
}

export interface ExamBlueprint {
  topics: BlueprintTopic[];
  summary: string;
  createdAt: string;
}

export interface ExamOption {
  id: string;
  text: string;
}

export interface ExamQuestionVerify {
  status: VerifyStatus;
  issue: VerifyIssue;
  note: string;
  checkedAt?: string;
}

/**
 * One question as the review screen sees it.
 *
 * `correctOptionId` and `modelAnswer` are the answer key. They are present because
 * this is a teacher-only endpoint: the teacher has to see which option is right in
 * order to judge the question. They are stripped server-side for students.
 */
export interface ExamQuestion {
  _id: string;
  type: ExamQuestionType;
  prompt: string;
  options: ExamOption[];
  correctOptionId?: string;
  modelAnswer?: string;
  rubric: string[];
  maxPoints: number;
  explanation: string;
  topic: string;
  sourcePages: number[];
  editedByTeacher: boolean;
  verify: ExamQuestionVerify;
}

export interface CoverageReport {
  covered: string[];
  missing: string[];
  offMap: string[];
}

export interface ExamForm {
  _id: string;
  examSetId: string;
  formLabel: string;
  questions: ExamQuestion[];
  maxGrade: number;
  status: 'generating' | 'draft' | 'ready';
  verifiedAt?: string | null;
  /** When a teacher confirmed they had read this form. Publishing requires it. */
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  coverage: CoverageReport;
}

export interface ExamSet {
  _id: string;
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
  formLabels: string[];
  verifyOnGenerate: boolean;
  timeLimitMinutes?: number;
  passPercent: number;
  maxAttempts: number;
  status: ExamSetStatus;
  openUntil?: string;
  publishedAt?: string | null;
  blueprint?: ExamBlueprint;
  hasBlueprint: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on the detail endpoint. */
  forms?: ExamForm[];
  /** Present on the list endpoint. */
  formsBuilt?: number;
  maxGrade?: number;
  questions?: number;
  flagged?: number;
  book?: {
    _id: string;
    title: string;
    pageCount: number;
    charCount: number;
    ocrUsed: boolean;
    status: BookStatus;
  } | null;
}

export interface BlueprintResponse {
  blueprint: ExamBlueprint;
  topics: number;
  summary: string;
  pagesUsed: number;
  estimatedTokens: number;
}

export interface VerifyFinding {
  index: number;
  valid: boolean;
  issue: VerifyIssue;
  note: string;
}

export interface VerifyResponse {
  form: ExamForm;
  result: { findings: VerifyFinding[]; repaired: number; flagged: number };
  coverage: CoverageReport;
}

/** What the diagnostics block of a generation response reports. */
export interface GenerateFormDiagnostics {
  rejected: { index: number; reason: string }[];
  duplicates: number;
  trimmed: number;
  repaired?: number;
  flagged?: number;
}

export interface GenerateFormResponse {
  form: ExamForm;
  diagnostics: GenerateFormDiagnostics;
  coverage: CoverageReport;
}

/**
 * A question as it arrives from the review dialog for editing.
 *
 * Every field is optional because the server treats an edit as a patch: a field
 * that is absent is left alone. Sending an empty `options` list for a short
 * answer would otherwise be read as "this question has no options" and rejected.
 */
export interface QuestionEdit {
  prompt?: string;
  options?: ExamOption[];
  correctOptionId?: string;
  modelAnswer?: string;
  rubric?: string[];
  explanation?: string;
  topic?: string;
  sourcePages?: number[];
}

/** One thing standing between a set and its students. */
export interface PublishBlocker {
  label: string;
  reason: string;
}

export interface PublishResponse {
  set: ExamSet;
  assignments: {
    students: number;
    written: number;
    kept: number;
    skippedInactive: number;
    perForm: Record<string, number>;
  };
}

/** One student in the paper roster, dealt or not. */
export interface AssignmentRow {
  studentId: string;
  name: string;
  active: boolean;
  formId: string | null;
  formLabel: string | null;
  source: 'auto' | 'teacher' | null;
  assignedAt: string | null;
}

export interface AssignmentRoster {
  status: ExamSetStatus;
  formLabels: string[];
  forms: { formLabel: string; maxGrade: number; students: number }[];
  rows: AssignmentRow[];
}

/* Results --------------------------------------------------------------------- */

/** How far through its own life an attempt is. `draft` is a paper still open. */
export type AttemptStatus = 'draft' | 'submitted' | 'graded' | 'grading_failed';

/**
 * One student's mark on a set.
 *
 * One row per student rather than one per student × form: each student holds
 * exactly one paper, so a full matrix would be mostly empty cells. `percent` is
 * the newest sitting — what the student is looking at — while `bestPercent` is the
 * best of all of them, which is what counts towards their points.
 */
export interface ResultRow {
  studentId: string;
  name: string;
  email: string;
  active: boolean;
  formLabel: string | null;
  status: AttemptStatus | 'not_started';
  attemptId: string | null;
  percent: number;
  totalScore: number;
  maxGrade: number;
  needsReview: boolean;
  submittedAt: string | null;
  sittings: number;
  bestPercent: number;
}

/** Per-paper stats, so a form that came out unfairly hard is visible. */
export interface FormStat {
  formId: string;
  formLabel: string;
  maxGrade: number;
  sat: number;
  averagePercent: number;
}

/**
 * A written answer waiting for a human.
 *
 * The whole mark scheme travels with it — the student's text, the model's score and
 * note, the model answer and the rubric — because a teacher judging an answer needs
 * all four in front of them, and a class of thirty is not going to have thirty
 * attempts opened to find the four answers the model was unsure about.
 */
export interface PendingAnswer {
  attemptId: string;
  examSetId: string;
  studentId: string;
  studentName: string;
  formLabel: string;
  questionId: string;
  prompt: string;
  textAnswer: string;
  aiScore: number | null;
  aiMax: number;
  aiFeedback: string;
  aiConfidence: 'low' | 'medium' | 'high' | null;
  modelAnswer: string;
  rubric: string[];
  maxPoints: number;
  submittedAt: string | null;
}

export interface ExamResultsResponse {
  status: ExamSetStatus;
  passPercent: number;
  maxAttempts: number;
  forms: FormStat[];
  rows: ResultRow[];
  pending: PendingAnswer[];
}

/**
 * A hand-set mark.
 *
 * `teacherScore: null` clears the override and hands the answer back to the model's
 * own mark, which is why the field is nullable rather than a plain number.
 */
export interface GradeOverride {
  questionId: string;
  teacherScore: number | null;
  teacherFeedback?: string;
}

export interface OverrideGradeResponse {
  changed: boolean;
  passed: boolean;
  attempt: AttemptResult;
}

/** The post-submit shape of an attempt, as both roles' screens see it. */
export interface AttemptResult {
  _id: string;
  examSetId: string;
  formId: string;
  status: AttemptStatus;
  mcqScore: number;
  shortScore: number;
  totalScore: number;
  maxGrade: number;
  percent: number;
  needsReview: boolean;
  timeLimitMinutes: number | null;
  submittedAt: string | null;
  gradedAt: string | null;
  createdAt: string | null;
  questions: AttemptResultQuestion[];
}

export interface AttemptResultQuestion {
  id: string;
  type: ExamQuestionType;
  prompt: string;
  options: ExamOption[];
  maxPoints: number;
  correctOptionId: string | null;
  explanation: string;
  modelAnswer: string | null;
  rubric: string[];
  chosenOptionId: string | null;
  isCorrect: boolean;
  textAnswer: string;
  /** The model's mark, unless a teacher has since set one. */
  aiScore: number | null;
  aiMax: number;
  aiFeedback: string;
  aiConfidence: 'low' | 'medium' | 'high' | null;
  overriddenByTeacher: boolean;
}

/** What the student portal is allowed to see about an assigned set. */
export interface StudentExamCard {
  _id: string;
  title: string;
  weekLabel?: string;
  lessonRef?: string;
  difficulty: ExamDifficulty;
  mcqCount: number;
  shortCount: number;
  formCount: number;
  timeLimitMinutes?: number;
  passPercent: number;
  maxAttempts: number;
  openUntil: string | null;
  publishedAt: string | null;
  /** The paper this student was dealt, so they can see the letters differ. */
  formLabel: string;
  questionCount: number;
  maxGrade: number;
}
