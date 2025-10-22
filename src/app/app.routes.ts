import { Routes } from '@angular/router';
import { LoginComponent } from './componentes/login/login.component';
import { RegisterComponent } from './componentes/registration/registration.component';
import { DashboardComponent } from './componentes/dashboard/dashboard.component';
import { OAuthCallbackComponent } from './componentes/oauth-callback/oauth-callback.component';
import { AuthGuard } from './core/guards/auth.guard';
import { GuestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  { path: '', component: LoginComponent, canActivate: [GuestGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [GuestGuard] },
  { path: 'oauth-callback', component: OAuthCallbackComponent },
  { path: 'auth/google/callback', component: OAuthCallbackComponent },
  { path: 'auth/github/callback', component: OAuthCallbackComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: '' }
];
