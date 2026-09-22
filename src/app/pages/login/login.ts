import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FloatLabel } from 'primeng/floatlabel';
import { Message } from 'primeng/message';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, InputText, Password, Button, Card, FloatLabel, Message],
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
      if (user.role === 'teacher') this.router.navigate(['/home']);
      else this.error = 'Students should use the Student Portal.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Login failed';
    } finally {
      this.loading = false;
    }
  }
}