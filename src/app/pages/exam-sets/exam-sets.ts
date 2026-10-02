import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { ProgressBar } from 'primeng/progressbar';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { DataService } from '../../services/data.service';
import {
  AssignmentRow,
  AssignmentRoster,
  Book,
  CoverageReport,
  ExamDifficulty,
  ExamForm,
  ExamQuestion,
  ExamResultsResponse,
  ExamSet,
  GenerateFormDiagnostics,
  PendingAnswer,
  PublishBlocker,
  ResultRow,
  VerifyIssue,
  VerifyStatus,
} from '../../models';

/**
 * AI exam sets: pick a page range, let Gemini build N distinct papers from it, then
 * review every question before it can reach a student.
 *
 * Generation is driven one request per step rather than as a single background job,
 * so this page is the pipeline: it calls the blueprint endpoint, then one endpoint
 * per form, and shows which step is running. That is also why the progress shown
 * here is a checklist and not a spinner over an opaque wait.
 *
 * The review side reuses the quiz-editor interaction from the Lessons page: options
 * are edited in place and saved per question, because a generated paper is only
 * trustworthy once a human has looked at it.
 */

/** One question being edited. Kept local so an in-progress edit is never half-saved. */
interface Draft {
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  modelAnswer: string;
  /** One rubric point per line, which is how a teacher thinks about a mark scheme. */
  rubric: string;
  explanation: string;
  topic: string;
  sourcePages: string;
  maxPoints: number;
  dirty: boolean;
  saving: boolean;
  error: string;
}

const DIFFICULTIES: { label: string; value: ExamDifficulty }[] = [
  { label: 'Easy', value: 'easy' },
  { label: 'Medium', value: 'medium' },
  { label: 'Hard', value: 'hard' },
];

/**
 * A written answer being marked by hand.
 *
 * Keyed by `attemptId:questionId` rather than by question id, because two students
 * holding the same paper are two different answers to the same question and can be
 * open at the same time.
 */
interface MarkDraft {
  score: number | null;
  feedback: string;
  saving: boolean;
  error: string;
}

/** Mirrors the server's guard: a question cannot be worth more than this. */
const MAX_POINTS = 5;

/** The server clamps an exam set to 2..4 forms; the dialog uses the same bounds. */
const MIN_FORMS = 2;
const MAX_FORMS = 4;

type Step = '' | 'blueprint' | 'form' | 'verify' | 'question';

@Component({
  selector: 'app-exam-sets',
  imports: [
    FormsModule,
    DecimalPipe,
    DatePipe,
    Card,
    Button,
    InputText,
    InputNumber,
    Select,
    ToggleSwitch,
    Message,
    Dialog,
    ProgressBar,
    ProgressSpinner,
    Tag,
    Tooltip,
  ],
  styleUrl: './exam-sets.css',
  templateUrl: './exam-sets.html',
})
export class ExamSets {
  private data = inject(DataService);

  difficulties = DIFFICULTIES;
  maxPoints = MAX_POINTS;
  minForms = MIN_FORMS;
  maxForms = MAX_FORMS;

  sets = signal<ExamSet[]>([]);
  books = signal<Book[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  /* Create dialog ------------------------------------------------------------ */
  showCreate = signal(false);
  creating = signal(false);
  /**
   * The book picker writes into `draft`, which is a plain object because the form
   * is bound with `ngModel`. Its id is mirrored into a signal so the derived
   * `selectedBook` recomputes — a `computed` over `draft.bookId` would read the
   * field once and then keep serving the first book the teacher ever picked.
   */
  createBookId = signal('');
  draft = {
    bookId: '',
    title: '',
    weekLabel: '',
    lessonRef: '',
    pageFrom: 1,
    pageTo: 10,
    difficulty: 'medium' as ExamDifficulty,
    mcqCount: 8,
    shortCount: 2,
    formCount: 3,
    verifyOnGenerate: true,
    timeLimitMinutes: 60,
    passPercent: 50,
  };
  createError = signal('');

  /* Detail dialog ------------------------------------------------------------ */
  showDetail = signal(false);
  detail = signal<ExamSet | null>(null);
  detailLoading = signal(false);
  detailError = signal('');
  activeLabel = signal('A');
  /** Which generation step is running, so the checklist can show it. */
  step = signal<Step>('');
  stepLabel = signal('');
  diagnostics = signal<GenerateFormDiagnostics | null>(null);
  /** Textarea edits, keyed by question id. */
  drafts = signal<Record<string, Draft>>({});

  readyBooks = computed(() => this.books().filter((b) => b.status === 'ready'));
  selectedBook = computed(() => this.books().find((b) => b._id === this.createBookId()) ?? null);

  formsBuilt = computed(() => this.sets().reduce((n, s) => n + (s.formsBuilt ?? 0), 0));
  flaggedTotal = computed(() => this.sets().reduce((n, s) => n + (s.flagged ?? 0), 0));

  forms = computed<ExamForm[]>(() => this.detail()?.forms ?? []);
  activeForm = computed<ExamForm | null>(() => this.forms().find((f) => f.formLabel === this.activeLabel()) ?? null);
  formByLabel = computed(() => new Map(this.forms().map((f) => [f.formLabel, f])));

  blueprintDone = computed(() => Boolean(this.detail()?.hasBlueprint));
  busy = computed(() => this.step() !== '');

  /* Publishing --------------------------------------------------------------- */

  /** Checklist from the server: what is still standing between the set and the class. */
  blockers = signal<PublishBlocker[]>([]);
  showPublish = signal(false);
  publishing = signal(false);
  /** The date the set stops being offered, editable in the publish dialog. */
  publishOpenUntil = signal('');
  publishError = signal('');

  roster = signal<AssignmentRoster | null>(null);
  rosterLoading = signal(false);
  /** The student whose paper is being moved, so only that row shows a spinner. */
  movingStudentId = signal('');

  /* Results ------------------------------------------------------------------ */

  results = signal<ExamResultsResponse | null>(null);
  resultsLoading = signal(false);
  resultsError = signal('');
  /** Marks in progress, keyed `attemptId:questionId`. */
  marks = signal<Record<string, MarkDraft>>({});

  /** Sittings handed in — the only ones a percentage means anything for. */
  readonly satRows = computed(() => this.results()?.rows.filter((r) => r.status !== 'not_started') ?? []);

  /** The papers with nobody in them yet, which are a generation problem, not a marking one. */
  readonly satForms = computed(() => this.results()?.forms.filter((f) => f.sat > 0) ?? []);

  /** How many students are in, out, still going, or waiting on a human. */
  readonly resultsSummary = computed(() => {
    const rows = this.results()?.rows ?? [];
    const pending = this.results()?.pending ?? [];
    return {
      students: rows.length,
      submitted: rows.filter((r) => r.status === 'graded' || r.status === 'submitted' || r.status === 'grading_failed').length,
      stillGoing: rows.filter((r) => r.status === 'draft').length,
      notStarted: rows.filter((r) => r.status === 'not_started').length,
      pending: pending.length,
    };
  });

  /** Every form generated and long enough. */
  formsComplete = computed(() => {
    const set = this.detail();
    if (!set) return false;
    const wanted = set.mcqCount + set.shortCount;
    return set.formLabels.every((label) => {
      const form = this.formByLabel().get(label);
      return !!form && form.questions.length >= wanted;
    });
  });

  /** Every form generated, long enough, and read by a human. */
  formsReviewed = computed(() => {
    const set = this.detail();
    if (!set) return false;
    return this.formsComplete() && set.formLabels.every((label) => !!this.formByLabel().get(label)?.reviewedAt);
  });

  reviewedCount = computed(() => this.forms().filter((f) => !!f.reviewedAt).length);
  isPublished = computed(() => this.detail()?.status === 'published');
  /** A published set is frozen: questions, generation and deletion are all refused. */
  frozen = computed(() => this.isPublished());

  /** The publish checklist, computed locally so the teacher sees it before clicking. */
  localBlockers = computed<PublishBlocker[]>(() => {
    const set = this.detail();
    if (!set) return [];
    const out: PublishBlocker[] = [];
    if (!set.hasBlueprint) out.push({ label: 'blueprint', reason: 'Run the blueprint step first' });
    const wanted = set.mcqCount + set.shortCount;
    for (const label of set.formLabels) {
      const form = this.formByLabel().get(label);
      if (!form) {
        out.push({ label, reason: `Form ${label} has not been generated` });
        continue;
      }
      if (form.status === 'generating') {
        out.push({ label, reason: `Form ${label} is still being generated` });
        continue;
      }
      if (form.questions.length < wanted) {
        out.push({ label, reason: `Form ${label} has ${form.questions.length} of ${wanted} questions` });
        continue;
      }
      if (!form.reviewedAt) out.push({ label, reason: `Form ${label} has not been marked as reviewed` });
    }
    return out;
  });

  /** The checklist the server sent back, if it disagreed with the local one. */
  blockersToShow = computed(() => (this.blockers().length > 0 ? this.blockers() : this.localBlockers()));
  canPublish = computed(() => this.blockersToShow().length === 0 && !this.frozen());

  /** Question currently being rewritten, so only its spinner shows. */
  activeQuestionId = signal('');

  flaggedIn(form: ExamForm): number {
    return form.questions.filter((q) => q.verify.status === 'flagged').length;
  }

  mcqQuestions = computed(() => (this.activeForm()?.questions ?? []).filter((q) => q.type === 'mcq'));
  shortQuestions = computed(() => (this.activeForm()?.questions ?? []).filter((q) => q.type === 'short'));

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      // Both lists are needed: the set list to show, the books to pick a range from.
      const [sets, books] = await Promise.all([this.data.listExamSets(), this.data.listBooks()]);
      this.sets.set(sets);
      this.books.set(books);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load exam sets');
    } finally {
      this.loading.set(false);
    }
  }

  /* Create ------------------------------------------------------------------- */

  openCreate() {
    const book = this.readyBooks()[0];
    this.createBookId.set(book?._id ?? '');
    this.draft = {
      bookId: book?._id ?? '',
      title: '',
      weekLabel: '',
      lessonRef: '',
      pageFrom: 1,
      pageTo: book ? Math.min(10, book.pageCount) : 10,
      difficulty: 'medium',
      mcqCount: 8,
      shortCount: 2,
      formCount: 3,
      verifyOnGenerate: true,
      timeLimitMinutes: 60,
      passPercent: 50,
    };
    this.createError.set('');
    this.showCreate.set(true);
  }

  onBookChange(id: string) {
    this.draft.bookId = id;
    this.createBookId.set(id);
    const book = this.selectedBook();
    if (!book) return;
    this.draft.pageFrom = 1;
    this.draft.pageTo = Math.min(Math.max(1, this.draft.pageTo), book.pageCount);
  }

  /** Rough prompt-size estimate, so an absurd range is visible before it is sent. */
  rangeTokens(): number {
    const book = this.selectedBook();
    if (!book) return 0;
    const share = (this.draft.pageTo - this.draft.pageFrom + 1) / Math.max(1, book.pageCount);
    return Math.round(book.charCount * share * 0.4);
  }

  rangeIsValid(): boolean {
    const book = this.selectedBook();
    if (!book) return false;
    return this.draft.pageFrom >= 1 && this.draft.pageTo >= this.draft.pageFrom && this.draft.pageTo <= book.pageCount;
  }

  async submitCreate() {
    this.createError.set('');
    if (!this.draft.title.trim()) {
      this.createError.set('Give the exam set a title');
      return;
    }
    if (!this.createBookId()) {
      this.createError.set('Pick a book');
      return;
    }
    if (!this.rangeIsValid()) {
      this.createError.set('The page range has to fit inside the book');
      return;
    }
    if (this.draft.mcqCount + this.draft.shortCount < 1) {
      this.createError.set('An exam needs at least one question');
      return;
    }
    // The server refuses a single form, so say it here rather than after a 400.
    if (this.draft.formCount < MIN_FORMS || this.draft.formCount > MAX_FORMS) {
      this.createError.set(`An exam set needs ${MIN_FORMS} to ${MAX_FORMS} forms`);
      return;
    }

    this.creating.set(true);
    try {
      const created = await this.data.createExamSet({ ...this.draft, title: this.draft.title.trim() });
      this.showCreate.set(false);
      this.success.set(`"${created.title}" created — now run the blueprint step`);
      await this.load();
      await this.openDetail(created._id);
    } catch (e) {
      this.createError.set(e instanceof Error ? e.message : 'Could not create the exam set');
    } finally {
      this.creating.set(false);
    }
  }

  /* Detail ------------------------------------------------------------------- */

  async openDetail(id: string) {
    this.showDetail.set(true);
    this.detailError.set('');
    this.diagnostics.set(null);
    this.drafts.set({});
    // Results belong to one set. Carrying them across would show one exam's marks
    // under another's name, and a mark written from that screen would land on the
    // wrong paper.
    this.results.set(null);
    this.resultsError.set('');
    this.marks.set({});
    await this.reloadDetail(id);
  }

  async reloadDetail(id?: string) {
    const setId = id ?? this.detail()?._id;
    if (!setId) return;
    this.detailLoading.set(true);
    try {
      const detail = await this.data.getExamSet(setId);
      this.detail.set(detail);
      // Keep whatever tab the teacher was on, as long as it still exists.
      if (!detail.forms?.some((f) => f.formLabel === this.activeLabel())) {
        this.activeLabel.set(detail.forms?.[0]?.formLabel ?? detail.formLabels[0] ?? 'A');
      }
      this.pruneDrafts();
      // Once a set has been out of the door there can be attempts against it, so
      // the results panel starts with the marks already loaded. A draft has none.
      if (detail.status !== 'draft' && !this.results()) await this.loadResults();
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'Failed to load the exam set');
    } finally {
      this.detailLoading.set(false);
    }
  }

  /** Drop edit-in-progress rows for questions that no longer exist. */
  private pruneDrafts() {
    const live = new Set(this.forms().flatMap((f) => f.questions.map((q) => q._id)));
    const kept: Record<string, Draft> = {};
    for (const [id, draft] of Object.entries(this.drafts())) {
      if (live.has(id) && draft.dirty) kept[id] = draft;
    }
    this.drafts.set(kept);
  }

  /* Generation --------------------------------------------------------------- */

  async runBlueprint() {
    const set = this.detail();
    if (!set) return;
    this.detailError.set('');
    this.step.set('blueprint');
    this.stepLabel.set('Reading the pages and mapping the topics…');
    try {
      const res = await this.data.createBlueprint(set._id);
      this.success.set(
        `Blueprint ready: ${res.topics} topics from ${res.pagesUsed} pages (~${res.estimatedTokens} tokens)`,
      );
      await this.reloadDetail();
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'The blueprint step failed');
    } finally {
      this.step.set('');
      this.stepLabel.set('');
    }
  }

  async runForm(label: string) {
    const set = this.detail();
    if (!set) return;
    this.detailError.set('');
    this.step.set('form');
    this.stepLabel.set(`Generating form ${label}…`);
    try {
      const res = await this.data.generateForm(set._id, label);
      this.diagnostics.set(res.diagnostics);
      this.activeLabel.set(label);
      const d = res.diagnostics;
      const notes = [
        d.rejected.length ? `${d.rejected.length} rejected` : '',
        d.duplicates ? `${d.duplicates} duplicates` : '',
        d.trimmed ? `${d.trimmed} trimmed` : '',
        d.repaired ? `${d.repaired} repaired` : '',
        d.flagged ? `${d.flagged} flagged` : '',
      ].filter(Boolean);
      this.success.set(
        `Form ${label} is ready${notes.length ? ` — ${notes.join(', ')}` : ''}`,
      );
      await this.reloadDetail();
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : `Form ${label} could not be generated`);
      // A failed generation may still have left a short form behind, so reload to
      // show what is actually there rather than a stale view.
      await this.reloadDetail();
    } finally {
      this.step.set('');
      this.stepLabel.set('');
    }
  }

  /** Build whatever is still missing, one request at a time. */
  async runAllForms() {
    const set = this.detail();
    if (!set) return;
    for (const label of this.missingLabels()) {
      await this.runForm(label);
      if (this.detailError()) break;
    }
  }

  /** Form labels with nothing generated yet, in blueprint order. */
  missingLabels(): string[] {
    const set = this.detail();
    if (!set) return [];
    return set.formLabels.filter((l) => !this.formByLabel().get(l));
  }

  readonly missingFormCount = computed(() => this.missingLabels().length);

  async runVerify() {
    const form = this.activeForm();
    if (!form) return;
    this.detailError.set('');
    this.step.set('verify');
    this.stepLabel.set('Checking every question against the source pages…');
    try {
      const res = await this.data.verifyExamForm(form._id);
      this.success.set(
        `Form ${form.formLabel} checked: ${res.result.repaired} repaired, ${res.result.flagged} still flagged`,
      );
      await this.reloadDetail();
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      this.step.set('');
      this.stepLabel.set('');
    }
  }

  /* Review ------------------------------------------------------------------- */

  /** Start editing, or return an in-progress edit to its saved text. */
  toggleEdit(question: ExamQuestion) {
    const current = this.drafts()[question._id];
    const next = { ...this.drafts() };
    if (current) {
      delete next[question._id];
    } else {
      next[question._id] = {
        prompt: question.prompt,
        options: question.options.map((o) => ({ ...o })),
        correctOptionId: question.correctOptionId ?? '',
        modelAnswer: question.modelAnswer ?? '',
        rubric: question.rubric.join('\n'),
        explanation: question.explanation,
        topic: question.topic,
        sourcePages: question.sourcePages.join(', '),
        maxPoints: question.maxPoints,
        dirty: false,
        saving: false,
        error: '',
      };
    }
    this.drafts.set(next);
  }

  editFor(question: ExamQuestion): Draft | null {
    return this.drafts()[question._id] ?? null;
  }

  updateDraft(question: ExamQuestion, patch: Partial<Draft>) {
    const current = this.drafts()[question._id];
    if (!current) return;
    this.drafts.set({ ...this.drafts(), [question._id]: { ...current, ...patch, dirty: true, error: '' } });
  }

  setOptionText(question: ExamQuestion, index: number, text: string) {
    const current = this.drafts()[question._id];
    if (!current) return;
    const options = current.options.map((o, i) => (i === index ? { ...o, text } : o));
    this.updateDraft(question, { options });
  }

  markCorrect(question: ExamQuestion, optionId: string) {
    this.updateDraft(question, { correctOptionId: optionId });
  }

  /**
   * Move an option without rebuilding the list.
   *
   * The id travels with the option, so moving it does not have to be sent to the
   * server to keep the answer key attached — reordering is a local edit that only
   * matters once the question is saved.
   */
  moveOption(question: ExamQuestion, index: number, direction: -1 | 1) {
    const current = this.drafts()[question._id];
    if (!current) return;
    const to = index + direction;
    if (to < 0 || to >= current.options.length) return;
    const options = [...current.options];
    [options[index], options[to]] = [options[to], options[index]];
    this.updateDraft(question, { options });
  }

  parsePages(text: string): number[] {
    return text
      .split(/[,\s،]+/)
      .map((t) => Number(t.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  }

  /**
   * Save one question.
   *
   * The option ids travel with the edit, so the server can keep the answer key on
   * the right option even if the teacher reorders the list — the id identifies the
   * option, not its position.
   */
  async saveQuestion(question: ExamQuestion) {
    const form = this.activeForm();
    const draft = this.drafts()[question._id];
    if (!form || !draft) return;

    const isMcq = question.type === 'mcq';
    const text = draft.prompt.trim();
    if (!text) {
      this.markDraftError(question._id, 'The question text cannot be empty');
      return;
    }
    if (isMcq) {
      if (draft.options.length < 2) {
        this.markDraftError(question._id, 'A multiple-choice question needs at least two options');
        return;
      }
      if (draft.options.some((o) => !o.text.trim())) {
        this.markDraftError(question._id, 'Every option needs text');
        return;
      }
      if (!draft.correctOptionId) {
        this.markDraftError(question._id, 'Mark which option is the correct answer');
        return;
      }
    } else if (!draft.rubric.trim()) {
      this.markDraftError(question._id, 'A short answer needs at least one rubric point');
      return;
    }
    if (draft.maxPoints < 1 || draft.maxPoints > MAX_POINTS) {
      this.markDraftError(question._id, `A question is worth 1 to ${MAX_POINTS} points`);
      return;
    }

    this.patchDraft(question._id, { saving: true, error: '' });
    try {
      // Only send the fields that belong to this question type. The server treats
      // the body as a patch, so leaving a field out keeps whatever was there —
      // sending an empty options list for a short answer would be read as a real
      // edit and rejected.
      const common = {
        prompt: text,
        explanation: draft.explanation.trim(),
        topic: draft.topic.trim(),
        sourcePages: this.parsePages(draft.sourcePages),
        maxPoints: draft.maxPoints,
      };
      const res = isMcq
        ? await this.data.editExamQuestion(form._id, question._id, {
            ...common,
            options: draft.options.map((o) => ({ id: o.id, text: o.text.trim() })),
            correctOptionId: draft.correctOptionId,
          })
        : await this.data.editExamQuestion(form._id, question._id, {
            ...common,
            modelAnswer: draft.modelAnswer.trim(),
            rubric: draft.rubric
              .split('\n')
              .map((r) => r.replace(/^[-•*]\s*/, '').trim())
              .filter(Boolean),
          });

      const next = { ...this.drafts() };
      delete next[question._id];
      this.drafts.set(next);
      this.applyForm(res.form);
      this.success.set('Question saved');
    } catch (e) {
      this.markDraftError(question._id, e instanceof Error ? e.message : 'Could not save the question');
      this.patchDraft(question._id, { saving: false });
    }
  }

  private markDraftError(id: string, message: string) {
    this.patchDraft(id, { error: message });
  }

  private patchDraft(id: string, patch: Partial<Draft>) {
    const current = this.drafts()[id];
    if (!current) return;
    this.drafts.set({ ...this.drafts(), [id]: { ...current, ...patch } });
  }

  /**
   * Replace one question with a freshly written one.
   *
   * The issue and the note travel with the request, so a replacement is told what
   * was wrong with the question it is replacing rather than having to infer it.
   */
  async regenerate(question: ExamQuestion) {
    const form = this.activeForm();
    if (!form) return;
    const issue: VerifyIssue = question.verify.issue === 'none' ? 'ambiguous' : question.verify.issue;
    this.step.set('question');
    this.stepLabel.set('Writing a replacement question…');
    this.activeQuestionId.set(question._id);
    try {
      const res = await this.data.regenerateExamQuestion(form._id, question._id, issue, question.verify.note ?? '');
      const next = { ...this.drafts() };
      delete next[question._id];
      this.drafts.set(next);
      this.applyForm(res.form);
      this.success.set('Question replaced');
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'Could not replace the question');
    } finally {
      this.activeQuestionId.set('');
      this.step.set('');
      this.stepLabel.set('');
    }
  }

  async removeQuestion(question: ExamQuestion) {
    const form = this.activeForm();
    if (!form) return;
    if (!confirm('Delete this question from the form?')) return;
    try {
      const res = await this.data.deleteExamQuestion(form._id, question._id);
      const next = { ...this.drafts() };
      delete next[question._id];
      this.drafts.set(next);
      this.applyForm(res.form);
      this.success.set('Question deleted');
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'Could not delete the question');
    }
  }

  /** Replace the one form in place, so a reload does not lose the other tabs. */
  private applyForm(form: ExamForm) {
    const set = this.detail();
    if (!set) return;
    this.detail.set({
      ...set,
      forms: (set.forms ?? []).map((f) => (f._id === form._id ? form : f)),
    });
  }

  /* Set-level actions -------------------------------------------------------- */

  /**
   * Stamp a form as read, or take the stamp back.
   *
   * Publishing requires the stamp, so this button is what decides whether a paper
   * is allowed out of the door — the verify pass only says the machine was happy.
   */
  async toggleReview(form: ExamForm) {
    const reviewed = !form.reviewedAt;
    this.detailError.set('');
    this.success.set('');
    try {
      const res = await this.data.markFormReviewed(form._id, reviewed);
      this.applyForm(res.form);
      this.success.set(
        reviewed
          ? `Form ${form.formLabel} marked as reviewed`
          : `Review mark removed from form ${form.formLabel}`,
      );
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'Could not update the review mark');
    }
  }

  openPublish() {
    this.blockers.set([]);
    this.publishError.set('');
    this.publishOpenUntil.set(this.detail()?.openUntil ? this.asInputDate(this.detail()!.openUntil!) : '');
    this.showPublish.set(true);
    void this.loadRoster();
  }

  /** Publish, then refresh both the set and the roster it just dealt. */
  async publish() {
    const set = this.detail();
    if (!set) return;
    this.publishing.set(true);
    this.publishError.set('');
    this.detailError.set('');
    try {
      const res = await this.data.publishExamSet(set._id, {
        openUntil: this.publishOpenUntil() ? new Date(this.publishOpenUntil()).toISOString() : null,
      });
      this.detail.set(res.set);
      this.blockers.set([]);
      this.showPublish.set(false);
      const a = res.assignments;
      this.success.set(
        `Published: ${a.written} student${a.written === 1 ? '' : 's'} dealt across ${this.forms().length} form${this.forms().length === 1 ? '' : 's'}` +
          (a.kept > 0 ? ` (${a.kept} already assigned and left alone)` : '') +
          (a.skippedInactive > 0 ? ` — skipped ${a.skippedInactive} deactivated account${a.skippedInactive === 1 ? '' : 's'}` : ''),
      );
      await Promise.all([this.reloadDetail(), this.loadRoster(), this.load()]);
    } catch (e) {
      // A 409 carries the full checklist, which is the whole point of the dialog.
      this.detailError.set(e instanceof Error ? e.message : 'Could not publish');
      this.publishError.set(e instanceof Error ? e.message : 'Could not publish');
      this.blockers.set(this.blockersFromError(e));
      await this.loadRoster();
    } finally {
      this.publishing.set(false);
    }
  }

  /** Pull the checklist out of a 409 body without depending on the error class. */
  private blockersFromError(e: unknown): PublishBlocker[] {
    const body = (e as { body?: { blockers?: PublishBlocker[] } })?.body;
    return Array.isArray(body?.blockers) ? body!.blockers! : [];
  }

  /** Withdraw the set from the students, or close it once they have sat it. */
  async changeStatus(status: 'draft' | 'closed') {
    const set = this.detail();
    if (!set) return;
    if (status === 'closed' && !confirm(`Close "${set.title}"? Students will no longer see it.`)) return;
    this.detailError.set('');
    this.success.set('');
    try {
      const updated = await this.data.setExamStatus(set._id, status);
      this.detail.set({ ...this.detail()!, ...updated });
      this.success.set(status === 'closed' ? 'Exam closed' : 'Exam returned to draft');
      await Promise.all([this.reloadDetail(), this.load(), this.loadRoster()]);
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'Could not change the status');
    }
  }

  async loadRoster() {
    const set = this.detail();
    if (!set) return;
    this.rosterLoading.set(true);
    try {
      this.roster.set(await this.data.listAssignments(set._id));
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'Could not load the paper roster');
    } finally {
      this.rosterLoading.set(false);
    }
  }

  /** Move one student to another paper. Re-publishing will not undo it. */
  async moveStudent(row: AssignmentRow, formLabel: string) {
    const set = this.detail();
    if (!set || row.formLabel === formLabel) return;
    this.movingStudentId.set(row.studentId);
    this.detailError.set('');
    try {
      const res = await this.data.overrideAssignment(set._id, row.studentId, formLabel);
      this.roster.update((r) =>
        r
          ? {
              ...r,
              rows: r.rows.map((x) =>
                x.studentId === row.studentId
                  ? { ...x, formId: res.formId, formLabel: res.formLabel, source: res.source, assignedAt: res.assignedAt }
                  : x,
              ),
            }
          : r,
      );
      this.success.set(`${row.name} moved to form ${formLabel}`);
      await this.loadRoster();
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : 'Could not move the student');
    } finally {
      this.movingStudentId.set('');
    }
  }

  /** `datetime-local` wants `yyyy-MM-ddTHH:mm` in local time, not an ISO string. */
  private asInputDate(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async removeSet(set: ExamSet) {
    if (!confirm(`Delete "${set.title}" and every form in it?`)) return;
    this.error.set('');
    this.success.set('');
    try {
      await this.data.deleteExamSet(set._id);
      this.success.set('Exam set deleted');
      this.showDetail.set(false);
      this.detail.set(null);
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not delete the exam set');
    }
  }

  /* Results ------------------------------------------------------------------ */

  /**
   * The class at a glance, plus the queue of answers waiting on a human.
   *
   * Loaded on demand rather than with the set, because it is the one panel that is
   * genuinely about students rather than about the paper: for a draft set it is
   * always empty, and for a busy one it is large enough to be worth not paying for
   * on every open.
   */
  async loadResults() {
    const set = this.detail();
    if (!set) return;
    this.resultsLoading.set(true);
    this.resultsError.set('');
    try {
      const res = await this.data.listSetResults(set._id);
      this.results.set(res);
      // Anything being edited for a set we have just left must not survive the
      // switch, or the next mark would be applied to the wrong attempt.
      this.marks.set({});
    } catch (e) {
      this.resultsError.set(e instanceof Error ? e.message : 'Could not load the results');
    } finally {
      this.resultsLoading.set(false);
    }
  }

  /** One row per answer: a student's answer is not the same as another's. */
  markKey(item: PendingAnswer): string {
    return `${item.attemptId}:${item.questionId}`;
  }

  markFor(item: PendingAnswer): MarkDraft | null {
    return this.marks()[this.markKey(item)] ?? null;
  }

  /** Open the editor for one answer, seeded from what the model already said. */
  openMark(item: PendingAnswer) {
    this.marks.set({
      ...this.marks(),
      [this.markKey(item)]: {
        score: item.aiScore ?? 0,
        feedback: item.aiFeedback ?? '',
        saving: false,
        error: '',
      },
    });
  }

  cancelMark(item: PendingAnswer) {
    const next = { ...this.marks() };
    delete next[this.markKey(item)];
    this.marks.set(next);
  }

  patchMark(item: PendingAnswer, patch: Partial<MarkDraft>) {
    const current = this.markFor(item);
    if (!current) return;
    this.marks.set({ ...this.marks(), [this.markKey(item)]: { ...current, ...patch, error: '' } });
  }

  /**
   * Write the mark, or take it back.
   *
   * Both go to the same route — `null` clears the override and hands the answer
   * back to the model's mark — and both end in a re-read of the results rather than
   * a local patch. Queue membership and `needsReview` are server-side rules
   * (an answer leaves the queue only once it is marked), and re-deriving them here
   * would be a second implementation of a rule that has to agree exactly.
   */
  private async sendMark(item: PendingAnswer, teacherScore: number | null, feedback: string) {
    this.patchMark(item, { saving: true });
    this.resultsError.set('');
    try {
      await this.data.overrideAttemptGrade(item.attemptId, {
        questionId: item.questionId,
        teacherScore,
        teacherFeedback: feedback,
      });
      this.cancelMark(item);
      await this.loadResults();
    } catch (e) {
      this.patchMark(item, { saving: false, error: e instanceof Error ? e.message : 'Could not save the mark' });
    }
  }

  async saveMark(item: PendingAnswer) {
    const draft = this.markFor(item);
    if (!draft) return;
    const score = Number(draft.score);
    if (!Number.isFinite(score)) {
      this.patchMark(item, { error: 'The mark must be a number' });
      return;
    }
    // Clamped client-side for a clear message; the server clamps either way, which
    // is what stops a slip of the keyboard handing out more than the paper is worth.
    if (score < 0 || score > item.maxPoints) {
      this.patchMark(item, { error: `This question is worth 0 to ${item.maxPoints}` });
      return;
    }
    this.success.set(`Marked ${item.studentName}'s answer ${score} of ${item.maxPoints}`);
    await this.sendMark(item, score, draft.feedback);
  }

  /** Hand the answer back to the model's own mark. */
  async clearMark(item: PendingAnswer) {
    this.success.set(`${item.studentName}'s answer returned to the model's mark`);
    await this.sendMark(item, null, '');
  }

  /* Display helpers ---------------------------------------------------------- */

  statusSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' {
    if (s === 'ready' || s === 'ok' || s === 'repaired') return 'success';
    if (s === 'flagged') return 'danger';
    if (s === 'pending' || s === 'draft') return 'warn';
    return 'info';
  }

  verifyLabel(s: VerifyStatus): string {
    switch (s) {
      case 'ok':
        return 'Checked';
      case 'repaired':
        return 'Repaired';
      case 'flagged':
        return 'Needs attention';
      default:
        return 'Not checked';
    }
  }

  verifyIcon(s: VerifyStatus): string {
    switch (s) {
      case 'ok':
        return 'pi pi-check-circle';
      case 'repaired':
        return 'pi pi-wrench';
      case 'flagged':
        return 'pi pi-exclamation-triangle';
      default:
        return 'pi pi-clock';
    }
  }

  issueLabel(issue: VerifyIssue): string {
    switch (issue) {
      case 'ambiguous':
        return 'could be read more than one way';
      case 'multiple_correct':
        return 'more than one option is correct';
      case 'not_in_source':
        return 'the answer is not in the source pages';
      case 'bad_distractor':
        return 'a wrong option is defensible';
      default:
        return '';
    }
  }

  coverageText(c: CoverageReport): string {
    if (c.missing.length === 0) return 'Covers every topic in the blueprint';
    return `Missing: ${c.missing.join('، ')}`;
  }

  setProgress(set: ExamSet): number {
    const labels = set.formLabels.length;
    const built = set.formsBuilt ?? set.forms?.length ?? 0;
    return labels ? Math.min(1, built / labels) : 0;
  }

  /* Results helpers ---------------------------------------------------------- */

  attemptStatusLabel(status: ResultRow['status']): string {
    switch (status) {
      case 'graded':
        return 'Graded';
      case 'submitted':
        return 'Submitted';
      case 'grading_failed':
        return 'Grading failed';
      case 'draft':
        return 'Still writing';
      default:
        return 'Not started';
    }
  }

  attemptStatusSeverity(status: ResultRow['status']): 'success' | 'warn' | 'danger' | 'info' {
    switch (status) {
      case 'graded':
        return 'success';
      case 'draft':
        return 'info';
      case 'grading_failed':
        return 'danger';
      default:
        return 'warn';
    }
  }

  /** The model's own confidence, which is what puts an answer in the queue. */
  confidenceLabel(confidence: PendingAnswer['aiConfidence']): string {
    switch (confidence) {
      case 'high':
        return 'confident';
      case 'medium':
        return 'unsure';
      default:
        return 'not graded';
    }
  }

  confidenceSeverity(confidence: PendingAnswer['aiConfidence']): 'success' | 'warn' | 'danger' {
    if (confidence === 'high') return 'success';
    if (confidence === 'medium') return 'warn';
    return 'danger';
  }

  /**
   * A mark against the pass line.
   *
   * A paper still being written has no mark at all, and showing it 0% would read
   * as a fail rather than as "not in yet" — so an ungraded row is deliberately not
   * coloured by the pass mark.
   */
  markSeverity(row: ResultRow): 'success' | 'danger' | 'info' {
    if (row.status !== 'graded') return 'info';
    return row.percent >= (this.results()?.passPercent ?? 0) ? 'success' : 'danger';
  }
}
