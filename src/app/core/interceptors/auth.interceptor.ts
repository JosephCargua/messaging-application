import { Injectable, inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse, HttpInterceptor } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Add token to requests
    const authReq = this.addTokenToRequest(req);
    
    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && this.authService.getAccessToken()) {
          return this.handle401Error(authReq, next);
        }
        return throwError(() => error);
      })
    );
  }

  private addTokenToRequest(req: HttpRequest<any>): HttpRequest<any> {
    const token = this.authService.getAccessToken();
    if (token) {
      return req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }
    return req;
  }

  private handle401Error(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return this.authService.refreshToken().pipe(
        switchMap((tokenResponse: any) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(tokenResponse.access_token);
          return next.handle(this.addTokenToRequest(req));
        }),
        catchError((err) => {
          this.isRefreshing = false;
          this.authService.logout();
          return throwError(() => err);
        })
      );
    }

    return this.refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(() => next.handle(this.addTokenToRequest(req)))
    );
  }
}

// Functional interceptor
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  
  // Add token to requests
  const token = authService.getAccessToken();
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token) {
        // Handle 401 by refreshing token
        return authService.refreshToken().pipe(
          switchMap((tokenResponse: any) => {
            // Retry with new token
            const newReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${tokenResponse.access_token}`
              }
            });
            return next(newReq);
          }),
          catchError((err) => {
            // If refresh fails, logout
            authService.logout();
            return throwError(() => err);
          })
        );
      }
      return throwError(() => error);
    })
  );
};