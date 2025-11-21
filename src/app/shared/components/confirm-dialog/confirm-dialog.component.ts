import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'block' | 'unblock' | 'delete' | 'default';
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="confirm-dialog">
      <h2 mat-dialog-title>{{ data.title }}</h2>
      <mat-dialog-content>
        <p>{{ data.message }}</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button (click)="onCancel()" [disabled]="isLoading">
          {{ data.cancelText || 'Cancelar' }}
        </button>
        <button 
          mat-raised-button 
          [color]="getButtonColor()" 
          (click)="onConfirm()"
          [disabled]="isLoading">
          <span *ngIf="isLoading">Procesando...</span>
          <span *ngIf="!isLoading">{{ data.confirmText || 'Confirmar' }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .confirm-dialog {
      min-width: 300px;
    }

    h2[mat-dialog-title] {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #1a1a1a;
      padding: 20px 24px 16px 24px;
    }

    mat-dialog-content {
      padding: 0 24px 16px 24px;
      color: #424242;
      font-size: 14px;
      line-height: 1.5;
    }

    mat-dialog-content p {
      margin: 0 0 12px 0;
    }

    .warning-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      border-radius: 4px;
      color: #e65100;
      font-size: 13px;
      margin-top: 12px;
    }

    .warning-message mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #ff9800;
    }

    mat-dialog-actions {
      padding: 8px 16px 16px 16px;
      gap: 8px;
    }

    button[mat-raised-button] {
      min-width: 100px;
    }
  `]
})
export class ConfirmDialogComponent {
  isLoading = false;

  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.isLoading = true;
    this.dialogRef.close(true);
  }

  getButtonColor(): string {
    switch (this.data.type) {
      case 'block':
        return 'warn';
      case 'unblock':
        return 'primary';
      case 'delete':
        return 'warn';
      default:
        return 'primary';
    }
  }
}

