import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Dashboard } from './pages/dashboard/dashboard';
import { StudentDetail } from './pages/student-detail/student-detail';
import { Lessons } from './pages/lessons/lessons';
import { Exams } from './pages/exams/exams';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'students', component: Dashboard, canActivate: [authGuard] },
  { path: 'students/:id', component: StudentDetail, canActivate: [authGuard] },
  { path: 'lessons', component: Lessons, canActivate: [authGuard] },
  { path: 'exams', component: Exams, canActivate: [authGuard] },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' },
];