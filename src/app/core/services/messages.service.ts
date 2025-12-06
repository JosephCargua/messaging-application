import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Message {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  forwardedFromId?: number;
  forwardedFrom?: {
    id: number;
    content: string;
    sender: {
      id: number;
      email: string;
      name: string;
      avatar?: string;
    };
  };
  sender: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
  };
  receiver: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
  };
}

export interface Chat {
  contact: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
    isOnline?: boolean;
    lastSeen?: string;
  };
  lastMessage: Message;
  unreadCount: number;
}

export interface SendMessageRequest {
  receiverId: number;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

export interface ApiResponse<T> {
  message: string;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
/** Servicio HTTP para interactuar con los endpoints de mensajería. */
export class MessagesService {
  private readonly API_URL = `${environment.apiUrl}/messages`;

  constructor(private http: HttpClient) {}

  /**
   * Obtener todos los chats del usuario
   */
  getChats(): Observable<ApiResponse<Chat[]>> {
    return this.http.get<ApiResponse<Chat[]>>(`${this.API_URL}/chats/all`);
  }

  /**
   * Obtener mensajes con un contacto
   */
  getMessages(contactId: number, limit: number = 20, cursor?: number): Observable<ApiResponse<Message[]>> {
    let params = new HttpParams().set('limit', limit.toString());
    if (cursor) {
      params = params.set('cursor', cursor.toString());
    }
    return this.http.get<ApiResponse<Message[]>>(`${this.API_URL}/${contactId}`, { params });
  }

  /**
   * Buscar mensajes dentro de un chat
   */
  searchMessages(contactId: number, query: string, limit: number = 20, cursor?: number): Observable<ApiResponse<Message[]>> {
    let params = new HttpParams()
      .set('q', query)
      .set('limit', limit.toString());
    if (cursor) {
      params = params.set('cursor', cursor.toString());
    }
    return this.http.get<ApiResponse<Message[]>>(`${this.API_URL}/${contactId}/search`, { params });
  }

  /**
   * Enviar un mensaje
   */
  sendMessage(request: SendMessageRequest): Observable<ApiResponse<Message>> {
    return this.http.post<ApiResponse<Message>>(`${this.API_URL}`, request);
  }

  /**
   * Eliminar un mensaje
   */
  deleteMessage(messageId: number): Observable<ApiResponse<Message>> {
    return this.http.delete<ApiResponse<Message>>(`${this.API_URL}/${messageId}`);
  }

  /**
   * Archivar un chat
   */
  archiveChat(contactId: number): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.API_URL}/chats/${contactId}/archive`, {});
  }

  /**
   * Desarchivar un chat
   */
  unarchiveChat(contactId: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.API_URL}/chats/${contactId}/archive`);
  }

  /**
   * Obtener chats archivados
   */
  getArchivedChats(): Observable<ApiResponse<Chat[]>> {
    return this.http.get<ApiResponse<Chat[]>>(`${this.API_URL}/chats/archived`);
  }

  /**
   * Marcar mensajes como leídos
   */
  markMessagesAsRead(contactId: number): Observable<ApiResponse<{ messageIds: number[]; count: number }>> {
    return this.http.post<ApiResponse<{ messageIds: number[]; count: number }>>(`${this.API_URL}/${contactId}/read`, {});
  }

  /**
   * Reenviar un mensaje
   */
  forwardMessage(receiverId: number, originalMessageId: number): Observable<ApiResponse<Message>> {
    return this.http.post<ApiResponse<Message>>(`${this.API_URL}/forward`, {
      receiverId,
      originalMessageId,
    });
  }

  /**
   * Eliminar un chat completo
   */
  deleteChat(contactId: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.API_URL}/chats/${contactId}`);
  }

  /**
   * Subir archivo (imagen o audio)
   */
  uploadFile(file: File): Observable<ApiResponse<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ApiResponse<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }>>(`${this.API_URL}/upload`, formData);
  }
}

