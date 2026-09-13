import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { FloatLabel } from 'primeng/floatlabel';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { DataService } from '../../services/data.service';
import { Student } from '../../models';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, FormsModule, DatePipe, Card, Tag, Button, InputText, FloatLabel, Message, Dialog, TableModule],
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

  openAdd() {
    this.addError = '';
    this.addName = '';
    this.addEmail = '';
    this.addPassword = '';
    this.showAdd.set(true);
  }

  async addStudent() {
    this.addError = '';
    this.adding = true;
    try {
      await this.data.registerStudent(this.addName, this.addEmail, this.addPassword);
      this.showAdd.set(false);
      await this.loadStudents();
    } catch (e) {
      this.addError = e instanceof Error ? e.message : 'Failed to add student';
    } finally {
      this.adding = false;
    }
  }

  severity(active: boolean): 'success' | 'secondary' {
    return active ? 'success' : 'secondary';
  }
}