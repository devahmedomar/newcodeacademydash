import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { AuthService } from './services/auth.service';
import { ThemeService } from './services/theme.service';
import { QuickFind } from './components/quick-find/quick-find';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Button, Tooltip, QuickFind],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  constructor(public auth: AuthService, public theme: ThemeService) {}

  logout() {
    this.auth.logout();
    window.location.href = '/login';
  }
}