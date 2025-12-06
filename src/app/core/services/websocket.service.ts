import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { Message } from './messages.service';
import { Contact, FriendRequest } from './contacts.service';

export interface FriendRequestReceivedEvent {
  from: number;
  request: Contact | FriendRequest;
  timestamp: string;
}

export interface FriendRequestAcceptedEvent {
  by: number;
  contact: Contact;
  timestamp: string;
}

export interface FriendRequestRejectedEvent {
  by: number;
  timestamp: string;
}

export interface NewMessageEvent {
  from: number;
  message: Message;
  timestamp: string;
}

export interface UserOnlineEvent {
  userId: number;
  timestamp: string;
}

export interface UserOfflineEvent {
  userId: number;
  timestamp: string;
}

export interface ContactRemovedEvent {
  by: number;
  timestamp: string;
}

export interface UserTypingEvent {
  from: number;
  isTyping: boolean;
  timestamp: string;
}

export interface MessagesReadEvent {
  from: number;
  messageIds: number[];
  timestamp: string;
}

export interface UserBlockedEvent {
  by: number;
  timestamp: string;
}

export interface UserUnblockedEvent {
  by: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
/**
 * Administra la conexión Socket.IO y expone observables para eventos en tiempo real.
 */
export class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;

  // Subjects para eventos
  private friendRequestReceived$ = new Subject<FriendRequestReceivedEvent>();
  private friendRequestAccepted$ = new Subject<FriendRequestAcceptedEvent>();
  private friendRequestRejected$ = new Subject<FriendRequestRejectedEvent>();
  private newMessage$ = new Subject<NewMessageEvent>();
  private userOnline$ = new Subject<UserOnlineEvent>();
  private userOffline$ = new Subject<UserOfflineEvent>();
  private contactRemoved$ = new Subject<ContactRemovedEvent>();
  private userTyping$ = new Subject<UserTypingEvent>();
  private messagesRead$ = new Subject<MessagesReadEvent>();
  private userBlocked$ = new Subject<UserBlockedEvent>();
  private userUnblocked$ = new Subject<UserUnblockedEvent>();

  constructor(private authService: AuthService) {}

  /**
   * Conectar al servidor WebSocket
   */
  connect(): void {
    if (this.isConnected && this.socket?.connected) {
      return;
    }

    const token = this.authService.getAccessToken();
    if (!token) {
      console.error('No hay token de acceso disponible');
      return;
    }

    this.socket = io(`${environment.apiUrl}/events`, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.setupEventListeners();
    });
    
    this.setupEventListeners();

    this.socket.on('disconnect', () => {
      console.log('Desconectado del servidor WebSocket');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Error de conexión WebSocket:', error);
    });
  }

  /**
   * Configurar listeners de eventos (llamado después de conectar)
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Remover listeners anteriores si existen para evitar duplicados
    this.socket.off('friend_request_received');
    this.socket.off('friend_request_accepted');
    this.socket.off('friend_request_rejected');
    this.socket.off('new_message');
    this.socket.off('user_online');
    this.socket.off('user_offline');
    this.socket.off('contact_removed');
    this.socket.off('user_typing');
    this.socket.off('messages_read');
    this.socket.off('user_blocked');
    this.socket.off('user_unblocked');

    // Escuchar eventos
    this.socket.on('friend_request_received', (data: FriendRequestReceivedEvent) => {
      this.friendRequestReceived$.next(data);
    });

    this.socket.on('friend_request_accepted', (data: FriendRequestAcceptedEvent) => {
      this.friendRequestAccepted$.next(data);
    });

    this.socket.on('friend_request_rejected', (data: FriendRequestRejectedEvent) => {
      this.friendRequestRejected$.next(data);
    });

    this.socket.on('new_message', (data: NewMessageEvent) => {
      this.newMessage$.next(data);
    });

    this.socket.on('user_online', (data: UserOnlineEvent) => {
      this.userOnline$.next(data);
    });

    this.socket.on('user_offline', (data: UserOfflineEvent) => {
      this.userOffline$.next(data);
    });

    this.socket.on('contact_removed', (data: ContactRemovedEvent) => {
      this.contactRemoved$.next(data);
    });

    this.socket.on('user_typing', (data: UserTypingEvent) => {
      this.userTyping$.next(data);
    });

    this.socket.on('messages_read', (data: MessagesReadEvent) => {
      this.messagesRead$.next(data);
    });

    this.socket.on('user_blocked', (data: UserBlockedEvent) => {
      this.userBlocked$.next(data);
    });

    this.socket.on('user_unblocked', (data: UserUnblockedEvent) => {
      this.userUnblocked$.next(data);
    });
  }

  /**
   * Desconectar del servidor WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * Reconectar con nuevo token
   */
  reconnect(): void {
    this.disconnect();
    this.connect();
  }

  // Observables para eventos
  /** Observable del evento cuando se recibe una solicitud de amistad. */
  onFriendRequestReceived(): Observable<FriendRequestReceivedEvent> {
    return this.friendRequestReceived$.asObservable();
  }

  /** Evento que indica que aceptaron una solicitud enviada. */
  onFriendRequestAccepted(): Observable<FriendRequestAcceptedEvent> {
    return this.friendRequestAccepted$.asObservable();
  }

  /** Evento que indica que rechazaron una solicitud enviada. */
  onFriendRequestRejected(): Observable<FriendRequestRejectedEvent> {
    return this.friendRequestRejected$.asObservable();
  }

  /** Evento para mensajes entrantes en tiempo real. */
  onNewMessage(): Observable<NewMessageEvent> {
    return this.newMessage$.asObservable();
  }

  /** Notifica cuando un usuario se conecta. */
  onUserOnline(): Observable<UserOnlineEvent> {
    return this.userOnline$.asObservable();
  }

  /** Notifica cuando un usuario se desconecta. */
  onUserOffline(): Observable<UserOfflineEvent> {
    return this.userOffline$.asObservable();
  }

  /** Evento emitido cuando se elimina la relación de contacto. */
  onContactRemoved(): Observable<ContactRemovedEvent> {
    return this.contactRemoved$.asObservable();
  }

  /** Emite cambios del estado "está escribiendo". */
  onUserTyping(): Observable<UserTypingEvent> {
    return this.userTyping$.asObservable();
  }

  /** Evento cuando el contacto marca mensajes como leídos. */
  onMessagesRead(): Observable<MessagesReadEvent> {
    return this.messagesRead$.asObservable();
  }

  /** Notifica si el usuario actual fue bloqueado por alguien. */
  onUserBlocked(): Observable<UserBlockedEvent> {
    return this.userBlocked$.asObservable();
  }

  /** Notifica si el usuario actual fue desbloqueado. */
  onUserUnblocked(): Observable<UserUnblockedEvent> {
    return this.userUnblocked$.asObservable();
  }

  /**
   * Emitir evento de que el usuario está escribiendo
   */
  /** Emite al servidor que el usuario comenzó a escribir a un contacto. */
  emitTypingStart(receiverId: number): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('typing_start', { receiverId });
    }
  }

  /**
   * Emitir evento de que el usuario dejó de escribir
   */
  /** Indica que el usuario dejó de escribir al contacto indicado. */
  emitTypingStop(receiverId: number): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('typing_stop', { receiverId });
    }
  }

  /**
   * Verificar si está conectado
   */
  /** Indica si el socket mantiene una conexión activa. */
  getIsConnected(): boolean {
    return this.isConnected && (this.socket?.connected ?? false);
  }
}

