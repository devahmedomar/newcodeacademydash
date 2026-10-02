import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Dashboard } from './pages/dashboard/dashboard';
import { StudentDetail } from './pages/student-detail/student-detail';
import { Lessons } from './pages/lessons/lessons';
import { Books } from './pages/books/books';
import { Exams } from './pages/exams/exams';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'students', component: Dashboard, canActivate: [authGuard] },
  { path: 'students/:id', component: StudentDetail, canActivate: [authGuard] },
  { path: 'lessons', component: Lessons, canActivate: [authGuard] },
  { path: 'books', component: Books, canActivate: [authGuard] },
  // Manual exams stay where they are; AI-generated ones are a separate screen
  // because generating them is a supervised, step-by-step process. Lazy-loaded so
  // the dialog-heavy review screen does not weigh down the rest of the dashboard.
  { path: 'exams', component: Exams, canActivate: [authGuard] },
  {
    path: 'exam-sets',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/exam-sets/exam-sets').then((m) => m.ExamSets),
  },
  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/reports/reports').then((m) => m.Reports),
  },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' },
];