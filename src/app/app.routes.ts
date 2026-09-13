import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { StudentDetail } from './pages/student-detail/student-detail';
import { Lessons } from './pages/lessons/lessons';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'students', component: Dashboard, canActivate: [authGuard] },
  { path: 'students/:id', component: StudentDetail, canActivate: [authGuard] },
  { path: 'lessons', component: Lessons, canActivate: [authGuard] },
  { path: '', redirectTo: 'students', pathMatch: 'full' },
  { path: '**', redirectTo: 'students' },
];