import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DisplayChat } from '../../../core/models/auth.module';

export interface ForwardMessageDialogData {
  chats: DisplayChat[];
  currentContactId?: number;
}

@Component({
  selector: 'app-forward-message-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatCheckboxModule
  ],
  template: `
    <div class="forward-dialog">
      <div class="dialog-header">
        <h2 class="dialog-title">Reenviar a...</h2>
        <button class="close-btn" (click)="onCancel()" mat-icon-button>
          <mat-icon>close</mat-icon>
        </button>
      </div>
      
      <div class="dialog-content">
        <div class="search-container">
          <mat-icon class="search-icon">search</mat-icon>
          <input 
            type="text" 
            class="search-input" 
            placeholder="Buscar"
            [(ngModel)]="searchQuery"
            (input)="onSearchInput()">
        </div>

        <div class="contacts-list">
          <div *ngIf="frequentContacts.length > 0" class="contacts-section">
            <div class="section-title">Frecuentes</div>
            <div class="contact-item" 
                 *ngFor="let chat of frequentContacts"
                 (click)="toggleContact(chat.contactId)">
              <img [src]="chat.avatar" [alt]="chat.name" class="contact-avatar" (error)="onAvatarError($event, chat.name)">
              <div class="contact-info">
                <div class="contact-name">{{ chat.name }}</div>
                <div *ngIf="chat.isOnline" class="contact-status">En línea</div>
              </div>
              <mat-checkbox 
                [checked]="selectedContacts.has(chat.contactId)"
                (click)="$event.stopPropagation()"
                (change)="toggleContact(chat.contactId)">
              </mat-checkbox>
            </div>
          </div>

          <div *ngIf="recentContacts.length > 0" class="contacts-section">
            <div class="section-title">Recientes</div>
            <div class="contact-item" 
                 *ngFor="let chat of recentContacts"
                 (click)="toggleContact(chat.contactId)">
              <img [src]="chat.avatar" [alt]="chat.name" class="contact-avatar" (error)="onAvatarError($event, chat.name)">
              <div class="contact-info">
                <div class="contact-name">{{ chat.name }}</div>
                <div *ngIf="chat.isOnline" class="contact-status">En línea</div>
              </div>
              <mat-checkbox 
                [checked]="selectedContacts.has(chat.contactId)"
                (click)="$event.stopPropagation()"
                (change)="toggleContact(chat.contactId)">
              </mat-checkbox>
            </div>
          </div>

          <div *ngIf="filteredContacts.length === 0 && searchQuery" class="no-results">
            <mat-icon>search_off</mat-icon>
            <p>No se encontraron contactos</p>
          </div>
        </div>
      </div>

      <div class="dialog-actions">
        <button mat-button (click)="onCancel()">Cancelar</button>
        <button 
          mat-raised-button 
          color="primary" 
          (click)="onConfirm()"
          [disabled]="selectedContacts.size === 0">
          Reenviar ({{ selectedContacts.size }})
        </button>
      </div>
    </div>
  `,
  styles: [`
    .forward-dialog {
      width: 400px;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      background: white;
      border-radius: 8px;
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #e0e0e0;
      background: #f5f5f5;
    }

    .dialog-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #1a1a1a;
    }

    .close-btn {
      color: #757575;
    }

    .dialog-content {
      flex: 1;
      overflow-y: auto;
      padding: 0;
    }

    .search-container {
      position: relative;
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
      background: white;
    }

    .search-icon {
      position: absolute;
      left: 24px;
      top: 50%;
      transform: translateY(-50%);
      color: #757575;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .search-input {
      width: 100%;
      padding: 10px 16px 10px 48px;
      border: none;
      border-bottom: 2px solid #25d366;
      outline: none;
      font-size: 14px;
      background: transparent;
    }

    .search-input:focus {
      border-bottom-color: #128c7e;
    }

    .contacts-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .contacts-section {
      padding: 8px 0;
    }

    .section-title {
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      color: #757575;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .contact-item {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      cursor: pointer;
      transition: background 0.2s;
      gap: 12px;
    }

    .contact-item:hover {
      background: #f5f5f5;
    }

    .contact-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }

    .contact-info {
      flex: 1;
      min-width: 0;
    }

    .contact-name {
      font-size: 14px;
      font-weight: 500;
      color: #1a1a1a;
      margin-bottom: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .contact-status {
      font-size: 12px;
      color: #25d366;
    }

    .no-results {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: #757575;
    }

    .no-results mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      color: #bdbdbd;
    }

    .no-results p {
      margin: 0;
      font-size: 14px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #e0e0e0;
      background: #f5f5f5;
    }

    button[mat-raised-button][disabled] {
      opacity: 0.5;
    }
  `]
})
export class ForwardMessageDialogComponent implements OnInit {
  searchQuery = '';
  selectedContacts = new Set<number>();
  frequentContacts: DisplayChat[] = [];
  recentContacts: DisplayChat[] = [];
  filteredContacts: DisplayChat[] = [];
  allContacts: DisplayChat[] = [];

  constructor(
    public dialogRef: MatDialogRef<ForwardMessageDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ForwardMessageDialogData
  ) {}

  ngOnInit(): void {
    this.allContacts = this.data.chats.filter(chat => 
      chat.contactId !== this.data.currentContactId
    );

    this.frequentContacts = this.allContacts
      .filter(chat => chat.unreadCount && chat.unreadCount > 0)
      .slice(0, 5);

    this.recentContacts = this.allContacts
      .filter(chat => !this.frequentContacts.some(fc => fc.contactId === chat.contactId))
      .slice(0, 10);

    this.filteredContacts = [...this.frequentContacts, ...this.recentContacts];
  }

  onSearchInput(): void {
    const query = this.searchQuery.toLowerCase().trim();
    
    if (!query) {
      this.filteredContacts = [...this.frequentContacts, ...this.recentContacts];
      return;
    }

    this.filteredContacts = this.allContacts.filter(chat =>
      chat.name.toLowerCase().includes(query)
    );
  }

  toggleContact(contactId: number): void {
    if (this.selectedContacts.has(contactId)) {
      this.selectedContacts.delete(contactId);
    } else {
      this.selectedContacts.add(contactId);
    }
  }

  onCancel(): void {
    this.dialogRef.close([]);
  }

  onConfirm(): void {
    if (this.selectedContacts.size > 0) {
      this.dialogRef.close(Array.from(this.selectedContacts));
    }
  }

  onAvatarError(event: Event, name: string): void {
    const img = event.target as HTMLImageElement;
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random`;
  }
}

