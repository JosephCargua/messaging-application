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

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}${this.AUTH_ENDPOINTS.login}`, credentials)
      .pipe(
        tap(response => this.handleAuthSuccess(response)),
        catchError(this.handleError)
      );
  }

  register(userData: RegisterRequest): Observable<any> {
    return this.http.post(`${this.API_URL}${this.AUTH_ENDPOINTS.register}`, userData)
      .pipe(catchError(this.handleError));
  }

  loginWithGoogle(): void {
    window.location.href = `${this.API_URL}${this.AUTH_ENDPOINTS.google}`;
  }

  loginWithGithub(): void {
    window.location.href = `${this.API_URL}${this.AUTH_ENDPOINTS.github}`;
  }

  loginWithMicrosoft(): void {
    window.location.href = `${this.API_URL}${this.AUTH_ENDPOINTS.microsoft}`;
  }

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

  logout(): Observable<any> {
    const refreshToken = this.getRefreshToken();
    return this.http.post(`${this.API_URL}${this.AUTH_ENDPOINTS.logout}`, {
      refresh_token: refreshToken
    }).pipe(
      tap(() => this.clearAuthData()),
      catchError(this.handleError)
    );
  }

  getCurrentUser(): UserPayload | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const user = this.currentUserSubject.value;
    return !!(token && user);
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  private getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  private handleAuthSuccess(response: AuthResponse): void {
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);
    this.currentUserSubject.next(response.user);
  }

  private updateTokens(response: RefreshTokenResponse): void {
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);
  }

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

  private clearAuthData(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.currentUserSubject.next(null);
  }

  getProfile(): Observable<{ user: User; message: string }> {
    return this.http.get<{ user: User; message: string }>(`${this.API_URL}${this.AUTH_ENDPOINTS.me}`)
      .pipe(catchError(this.handleError));
  }

  updateProfile(data: { name?: string; avatar?: string }): Observable<{ user: User; message: string }> {
    return this.http.put<{ user: User; message: string }>(`${this.API_URL}${this.AUTH_ENDPOINTS.me}`, data)
      .pipe(
        tap(response => {
          const currentUser = this.currentUserSubject.value;
          if (currentUser) {
            const updatedUser: UserPayload = {
              ...currentUser,
              ...(response.user.name && { name: response.user.name }),
              ...(response.user.avatar && { avatar: response.user.avatar }),
            };
            this.currentUserSubject.next(updatedUser);
          }
        }),
        catchError(this.handleError)
      );
  }

  private handleError = (error: any): Observable<never> => {
    console.error('Auth Service Error:', error);
    if (error.status === 401) {
      this.clearAuthData();
    }
    return throwError(() => error);
  };
}