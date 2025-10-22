import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { 
  LoginRequest, 
  RegisterRequest, 
  AuthResponse, 
  UserPayload, 
  RefreshTokenRequest,
  RefreshTokenResponse,
  User 
} from '../models/auth.module';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public currentUserSubject = new BehaviorSubject<UserPayload | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private readonly API_URL = environment.apiUrl;
  private readonly AUTH_ENDPOINTS = environment.apiEndpoints.auth;

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
  }

  // Email/password login
  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}${this.AUTH_ENDPOINTS.login}`, credentials)
      .pipe(
        tap(response => this.handleAuthSuccess(response)),
        catchError(this.handleError)
      );
  }

  // User registration
  register(userData: RegisterRequest): Observable<any> {
    return this.http.post(`${this.API_URL}${this.AUTH_ENDPOINTS.register}`, userData)
      .pipe(catchError(this.handleError));
  }

  // Google OAuth login
  loginWithGoogle(): void {
    window.location.href = `${this.API_URL}${this.AUTH_ENDPOINTS.google}`;
  }

  // GitHub OAuth login
  loginWithGithub(): void {
    window.location.href = `${this.API_URL}${this.AUTH_ENDPOINTS.github}`;
  }

  // Microsoft OAuth login
  loginWithMicrosoft(): void {
    window.location.href = `${this.API_URL}${this.AUTH_ENDPOINTS.microsoft}`;
  }

  // Handle OAuth callback
  handleOAuthCallback(code: string, provider: string): Observable<AuthResponse> {
    const callbackData = {
      code: code,
      provider: provider
    };

    return this.http.post<AuthResponse>(`${this.API_URL}${this.AUTH_ENDPOINTS.callback}`, callbackData)
      .pipe(
        tap(response => this.handleAuthSuccess(response)),
        catchError(this.handleError)
      );
  }

  // Refresh token
  refreshToken(): Observable<RefreshTokenResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http.post<RefreshTokenResponse>(
      `${this.API_URL}${this.AUTH_ENDPOINTS.refresh}`, 
      { refresh_token: refreshToken }
    ).pipe(
      tap(response => this.updateTokens(response)),
      catchError(this.handleError)
    );
  }

  // User logout
  logout(): Observable<any> {
    const refreshToken = this.getRefreshToken();
    return this.http.post(`${this.API_URL}${this.AUTH_ENDPOINTS.logout}`, {
      refresh_token: refreshToken
    }).pipe(
      tap(() => this.clearAuthData()),
      catchError(this.handleError)
    );
  }

  // Get current user
  getCurrentUser(): UserPayload | null {
    return this.currentUserSubject.value;
  }

  // Check authentication status
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const user = this.currentUserSubject.value;
    return !!(token && user);
  }

  // Get access token
  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  // Get refresh token
  private getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  // Handle auth success
  private handleAuthSuccess(response: AuthResponse): void {
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);
    this.currentUserSubject.next(response.user);
  }

  // Update tokens
  private updateTokens(response: RefreshTokenResponse): void {
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);
  }

  // Load user from storage
  private loadUserFromStorage(): void {
    const token = this.getAccessToken();
    if (token) {
      try {
        const payload = this.decodeToken(token);
        this.currentUserSubject.next(payload);
      } catch (error) {
        this.clearAuthData();
      }
    }
  }

  // Decode JWT token
  private decodeToken(token: string): UserPayload {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  }

  // Clear auth data
  private clearAuthData(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.currentUserSubject.next(null);
  }

  // Handle errors
  private handleError = (error: any): Observable<never> => {
    console.error('Auth Service Error:', error);
    if (error.status === 401) {
      this.clearAuthData();
    }
    return throwError(() => error);
  };
}