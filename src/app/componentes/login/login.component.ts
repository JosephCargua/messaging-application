import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';

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
  isProcessingOAuth = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private authService: AuthService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    // Check if already authenticated
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Check for OAuth tokens in URL
    this.route.queryParams.subscribe(params => {
      const token = params['token'];
      const refreshToken = params['refresh'];
      const provider = params['provider'];

      if (token && refreshToken) {
        console.log('Tokens encontrados en URL, procesando...');
        this.isProcessingOAuth = true;
        this.processOAuthTokens(token, refreshToken, provider);
      }
    });
  }

  onSubmit(): void {
    if (this.loginForm.valid && !this.isLoading) {
      this.isLoading = true;
      const loginData: LoginRequest = this.loginForm.value;

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
          this.snackBar.open(error.error?.message || 'Error al iniciar sesión', 'Cerrar', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'top'
          });
          this.isLoading = false;
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  loginWithGoogle(): void {
    this.authService.loginWithGoogle();
  }

  loginWithGithub(): void {
    this.authService.loginWithGithub();
  }

  private markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach(key => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });
  }

  private processOAuthTokens(token: string, refreshToken: string, provider?: string): void {
    try {
      // Save tokens
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', refreshToken);

      // Get user info from token
      const userPayload = this.decodeToken(token);
      
      // Update auth state
      this.authService.currentUserSubject.next(userPayload);

      // Show success message
      this.snackBar.open(`¡Inicio de sesión con ${provider || 'OAuth'} exitoso!`, 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });

      // Redirect to dashboard
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 1000);

    } catch (error) {
      console.error('Error processing OAuth tokens:', error);
      this.isProcessingOAuth = false;
      this.snackBar.open('Error al procesar la autenticación', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
    }
  }

  private decodeToken(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error decoding token:', error);
      throw new Error('Invalid token');
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.loginForm.get(fieldName);
    if (control?.hasError('required')) return 'Este campo es requerido';
    if (control?.hasError('email')) return 'Ingresa un email válido';
    if (control?.hasError('minlength')) return 'La contraseña debe tener al menos 6 caracteres';
    return '';
  }
}
