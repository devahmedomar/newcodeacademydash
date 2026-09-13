import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { DataService } from '../../services/data.service';
import { Student } from '../../models';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, FormsModule, DatePipe],
  styleUrl: './dashboard.css',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private data = inject(DataService);

  students = signal<Student[]>([]);
  loading = signal(true);
  error = signal('');

  showAdd = signal(false);
  addName = '';
  addEmail = '';
  addPassword = '';
  addError = '';
  adding = false;
  added = signal('');

  async ngOnInit() {
    await this.loadStudents();
  }

  async loadStudents() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.students.set(await this.data.listStudents());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load students');
    } finally {
      this.loading.set(false);
    }
  }

  toggleAdd() {
    this.showAdd.set(!this.showAdd());
    this.added.set('');
  }

  async addStudent() {
    this.addError = '';
    this.adding = true;
    try {
      await this.data.registerStudent(this.addName, this.addEmail, this.addPassword);
      this.showAdd.set(false);
      this.addName = '';
      this.addEmail = '';
      this.addPassword = '';
      await this.loadStudents();
    } catch (e) {
      this.addError = e instanceof Error ? e.message : 'Failed to add student';
    } finally {
      this.adding = false;
    }
  }
}