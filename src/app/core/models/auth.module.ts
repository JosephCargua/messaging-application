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
    name?: string;
    avatar?: string;
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

  export interface DisplayChat {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageSenderId?: number;
  timestamp: string;
  unreadCount?: number;
  isOnline: boolean;
  avatar: string;
  contactId: number;
}

export interface DisplayMessage {
  id: number;
  sender: string;
  text: string;
  time: string;
  avatar: string;
  isCurrentUser?: boolean;
  image?: string;
  isRead?: boolean;
  readAt?: string;
}

export interface ProfileData {
  name?: string;
  email?: string;
  avatar?: string;
}

export interface MessagesResult {
  messages: DisplayMessage[];
  hasMore: boolean;
  nextCursor: number | null;
}

