import {
  Component,
  effect,
  inject,
  signal,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { InputText } from 'primeng/inputtext';
import { DataService } from '../../services/data.service';
import { Student, Lesson, ExamTemplate } from '../../models';

interface FindGroup {
  label: string;
  items: FindItem[];
}

interface FindItem {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  run: () => void;
}

@Component({
  selector: 'app-quick-find',
  imports: [InputText],
  styleUrl: './quick-find.css',
  templateUrl: './quick-find.html',
})
export class QuickFind {
  private data = inject(DataService);
  private router = inject(Router);

  open = signal(false);
  query = signal('');
  loaded = false;
  students: Student[] = [];
  lessons: Lesson[] = [];
  exams: ExamTemplate[] = [];
  selectedIndex = signal(0);
  activeGroups = signal<FindGroup[]>([]);
  @ViewChild('box') searchBox: ElementRef<HTMLInputElement> | null = null;

  private globalKeyHandler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (this.open()) this.close();
      else this.show();
      return;
    }
  };

  constructor() {
    window.addEventListener('keydown', this.globalKeyHandler);
    effect(() => {
      const q = this.query().trim().toLowerCase();
      let groups: FindGroup[] = [];

      if (!q) {
        groups = [this.pagesGroup, this.actionsGroup];
      } else {
        const s = this.students.filter(
          (x) => x.name.toLowerCase().includes(q) || x.email.toLowerCase().includes(q),
        );
        if (s.length) {
          groups.push({
            label: 'Students',
            items: s.slice(0, 6).map((x) => ({
              id: 's-' + x._id,
              label: x.name,
              sub: x.email + (x.active ? '' : ' · inactive'),
              icon: 'pi pi-user',
              run: () => this.router.navigate(['/students', x._id]),
            })),
          });
        }
        const l = this.lessons.filter(
          (x) =>
            x.title.toLowerCase().includes(q) || x.module.toLowerCase().includes(q),
        );
        if (l.length) {
          groups.push({
            label: 'Lessons',
            items: l.slice(0, 6).map((x) => ({
              id: 'l-' + x._id,
              label: x.title,
              sub: `${x.module} · ${x.published ? 'published' : 'draft'}`,
              icon: 'pi pi-book',
              run: () => this.router.navigate(['/lessons'], { queryParams: { q: x.module } }),
            })),
          });
        }
        const e = this.exams.filter(
          (x) =>
            x.title.toLowerCase().includes(q) || x.subject.toLowerCase().includes(q),
        );
        if (e.length) {
          groups.push({
            label: 'Exams',
            items: e.slice(0, 6).map((x) => ({
              id: 'e-' + x._id,
              label: x.title,
              sub: `${x.subject} · / ${x.maxGrade} · ${x.gradedCount} graded`,
              icon: 'pi pi-clipboard',
              run: () => this.router.navigate(['/exams']),
            })),
          });
        }
        if (!s.length && !l.length && !e.length) {
          groups = [this.actionsGroup, this.pagesGroup];
        }
      }

      this.activeGroups.set(groups);
      this.selectedIndex.set(0);
    });
  }

  private get pagesGroup(): FindGroup {
    const pages = [
      { id: 'p-home', label: 'Home', icon: 'pi pi-home', path: '/home' },
      { id: 'p-students', label: 'Students', icon: 'pi pi-users', path: '/students' },
      { id: 'p-lessons', label: 'Lessons', icon: 'pi pi-book', path: '/lessons' },
      { id: 'p-exams', label: 'Exams', icon: 'pi pi-clipboard', path: '/exams' },
      { id: 'p-reports', label: 'Reports', icon: 'pi pi-file-excel', path: '/reports' },
    ];
    return {
      label: 'Pages',
      items: pages.map((p) => ({
        id: p.id,
        label: p.label,
        icon: p.icon,
        run: () => this.router.navigate([p.path]),
      })),
    };
  }

  private get actionsGroup(): FindGroup {
    const actions = [
      { id: 'a-add-student', label: 'Add a student', icon: 'pi pi-user-plus', path: '/students', qp: { new: '1' } },
      { id: 'a-grade', label: 'Grade an exam', icon: 'pi pi-pencil-square', path: '/students', qp: { grade: '1' } },
      { id: 'a-add-lesson', label: 'Add a lesson', icon: 'pi pi-plus', path: '/lessons', qp: { new: '1' } },
      { id: 'a-add-exam', label: 'New exam', icon: 'pi pi-plus', path: '/exams', qp: { new: '1' } },
    ];
    return {
      label: 'Quick actions',
      items: actions.map((a) => ({
        id: a.id,
        label: a.label,
        icon: a.icon,
        run: () => this.router.navigate([a.path], { queryParams: a.qp }),
      })),
    };
  }

  allItems(): FindItem[] {
    return this.activeGroups().flatMap((g) => g.items);
  }

  flatIndex(group: FindGroup, i: number) {
    return this.activeGroups().findIndex((g) => g === group) !== -1
      ? this.allItems().indexOf(group.items[i])
      : 0;
  }

  toggle() {
    if (this.open()) this.close();
    else this.show();
  }

  async show() {
    this.query.set('');
    if (!this.loaded) {
      this.loaded = true;
      const [students, lessons, exams] = await Promise.allSettled([
        this.data.listStudents(),
        this.data.listLessons(),
        this.data.listExamTemplates(),
      ]);
      if (students.status === 'fulfilled') this.students = students.value;
      if (lessons.status === 'fulfilled') this.lessons = lessons.value;
      if (exams.status === 'fulfilled') this.exams = exams.value;
    }
    this.open.set(true);
    window.setTimeout(() => this.searchBox?.nativeElement.focus(), 10);
  }

  close() {
    this.open.set(false);
    this.query.set('');
  }

  onKeydown(e: KeyboardEvent) {
    if (!this.open()) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.show();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const n = this.allItems().length;
      this.selectedIndex.set(n === 0 ? 0 : (this.selectedIndex() + 1) % n);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.allItems().length;
      this.selectedIndex.set(n === 0 ? 0 : (this.selectedIndex() - 1 + n) % n);
      return;
    }
    if (e.key === 'Enter') {
      const item = this.allItems()[this.selectedIndex()];
      if (item) {
        this.close();
        item.run();
      }
      return;
    }
  }

  onInputKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    this.onKeydown(e);
  }

  selectItem(i: number) {
    const item = this.allItems()[i];
    if (!item) return;
    this.close();
    item.run();
  }
}