export interface LoginRequest {
    email: string;
    password: string;
  }
  
  export interface RegisterRequest {
    email: string;
    username: string;
    password: string;
  }
  
  export interface AuthResponse {
    access_token: string;
    refresh_token: string;
    user: UserPayload;
  }
  
  export interface UserPayload {
    sub: number;
    email: string;
    roles: string[];
    tenantId?: number;
  }
  
  export interface RefreshTokenRequest {
    refresh_token: string;
  }
  
  export interface RefreshTokenResponse {
    access_token: string;
    refresh_token: string;
  }
  
  export interface User {
    id: number;
    email: string;
    name?: string;
    avatar?: string;
    isActive: boolean;
    emailVerified: boolean;
    isOnline?: boolean;
    lastSeen?: string;
    createdAt: string;
    updatedAt: string;
    role: 'USER';
    tenantId?: number;
  }