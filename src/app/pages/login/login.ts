import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(private auth: AuthService, private router: Router) {}

  async submit() {
    this.error = '';
    this.loading = true;
    try {
      const user = await this.auth.login(this.email, this.password);
      if (user.role === 'teacher') this.router.navigate(['/students']);
      else this.error = 'Please use the student portal to log in.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Login failed';
    } finally {
      this.loading = false;
    }
  }
}