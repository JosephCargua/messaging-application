import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// Si tienes AuthService, descomenta esta línea
// import { AuthService } from '../services/auth.service';

interface LoginRequest {
  email: string;
  password: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MatSnackBarModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  isLoading = false;

  // Si tienes AuthService, inyecta aquí
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private snackBar: MatSnackBar,
    // private authService: AuthService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    // Si tienes authService, descomenta esto
    /*
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
    */
  }

  onSubmit(): void {
    if (this.loginForm.valid && !this.isLoading) {
      this.isLoading = true;
      const loginData: LoginRequest = this.loginForm.value;

      // Si tienes AuthService
      /*
      this.authService.login(loginData).subscribe({
        next: (response) => {
          this.snackBar.open('Login exitoso', 'Cerrar', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'top'
          });
          this.router.navigate(['/dashboard']);
        },
        error: (error) => {
          this.snackBar.open(error.message || 'Error al iniciar sesión', 'Cerrar', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'top'
          });
          this.isLoading = false;
        }
      });
      */

      // Para probar sin AuthService:
      this.snackBar.open('Login simulado exitoso', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      this.isLoading = false;
    } else {
      this.markFormGroupTouched();
    }
  }

  loginWithGoogle(): void {
    this.snackBar.open('Login con Google - Próximamente', 'Cerrar', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  loginWithGithub(): void {
    this.snackBar.open('Login con Github - Próximamente', 'Cerrar', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  private markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach(key => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.loginForm.get(fieldName);
    if (control?.hasError('required')) return 'Este campo es requerido';
    if (control?.hasError('email')) return 'Ingresa un email válido';
    if (control?.hasError('minlength')) return 'La contraseña debe tener al menos 6 caracteres';
    return '';
  }
}
