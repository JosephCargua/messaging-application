import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="callback-container">
      <div class="callback-card">
        <div *ngIf="loading" class="loading-state">
          <div class="spinner"></div>
          <h3>Procesando autenticación...</h3>
          <p>Por favor espera mientras completamos tu inicio de sesión.</p>
        </div>
        
        <div *ngIf="error" class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Error en la autenticación</h3>
          <p>{{ error }}</p>
          <button class="btn btn-primary" (click)="redirectToLogin()">
            Volver al inicio de sesión
          </button>
        </div>
        
        <div *ngIf="success" class="success-state">
          <div class="success-icon">✅</div>
          <h3>¡Autenticación exitosa!</h3>
          <p>Redirigiendo al dashboard...</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    
    .callback-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      padding: 40px;
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    
    .loading-state, .error-state, .success-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .error-icon, .success-icon {
      font-size: 48px;
    }
    
    h3 {
      margin: 0;
      color: #333;
      font-size: 24px;
    }
    
    p {
      margin: 0;
      color: #666;
      font-size: 16px;
    }
    
    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      transition: background-color 0.3s;
    }
    
    .btn-primary {
      background-color: #667eea;
      color: white;
    }
    
    .btn-primary:hover {
      background-color: #5a6fd8;
    }
  `]
})
export class OAuthCallbackComponent implements OnInit {
  loading = true;
  error: string | null = null;
  success = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.handleCallback();
  }

  private handleCallback(): void {
    // Get URL parameters
    const token = this.route.snapshot.queryParams['token'];
    const refreshToken = this.route.snapshot.queryParams['refresh'];
    const provider = this.route.snapshot.queryParams['provider'];
    const error = this.route.snapshot.queryParams['error'];

    console.log('OAuth Callback - Received parameters:', {
      token: token ? 'present' : 'missing',
      refreshToken: refreshToken ? 'present' : 'missing',
      provider,
      error
    });

    if (error) {
      this.handleError(decodeURIComponent(error));
      return;
    }

    if (!token || !refreshToken) {
      this.handleError('Authentication tokens not received');
      return;
    }

    // Process tokens
    this.processTokens(token, refreshToken, provider);
  }

  private processTokens(token: string, refreshToken: string, provider?: string): void {
    try {
      // Save tokens
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', refreshToken);

      // Get user info
      const userPayload = this.decodeToken(token);
      
      // Update auth state
      this.authService.currentUserSubject.next(userPayload);

      this.loading = false;
      this.success = true;

      // Redirect after a brief delay
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000);

    } catch (error) {
      console.error('Error processing tokens:', error);
      this.handleError('Error processing authentication tokens');
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

  private handleError(errorMessage: string): void {
    this.loading = false;
    this.error = errorMessage;
    
    // Clear tokens if there's an error
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  redirectToLogin(): void {
    this.router.navigate(['/']);
  }
}
