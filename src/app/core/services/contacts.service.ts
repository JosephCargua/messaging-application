import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Contact {
  id: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED';
  createdAt: string;
  updatedAt: string;
  contact: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
    isOnline?: boolean;
    lastSeen?: string;
  };
}

export interface FriendRequest {
  id: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  user?: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
    isOnline?: boolean;
    lastSeen?: string;
  };
  contact?: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
    isOnline?: boolean;
    lastSeen?: string;
  };
}

export interface SendFriendRequestRequest {
  contactId: number;
}

export interface ApiResponse<T> {
  message: string;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class ContactsService {
  private readonly API_URL = `${environment.apiUrl}/contacts`;

  constructor(private http: HttpClient) {}

  /**
   * Obtener todos los contactos aceptados
   */
  getContacts(): Observable<ApiResponse<Contact[]>> {
    return this.http.get<ApiResponse<Contact[]>>(`${this.API_URL}`);
  }

  /**
   * Enviar solicitud de amistad
   */
  sendFriendRequest(request: SendFriendRequestRequest): Observable<ApiResponse<Contact>> {
    return this.http.post<ApiResponse<Contact>>(`${this.API_URL}/request`, request);
  }

  /**
   * Aceptar solicitud de amistad
   */
  acceptFriendRequest(contactId: number): Observable<ApiResponse<Contact>> {
    return this.http.post<ApiResponse<Contact>>(`${this.API_URL}/accept/${contactId}`, {});
  }

  /**
   * Rechazar solicitud de amistad
   */
  rejectFriendRequest(contactId: number): Observable<ApiResponse<Contact>> {
    return this.http.post<ApiResponse<Contact>>(`${this.API_URL}/reject/${contactId}`, {});
  }

  /**
   * Obtener solicitudes pendientes (recibidas)
   */
  getPendingRequests(): Observable<ApiResponse<FriendRequest[]>> {
    return this.http.get<ApiResponse<FriendRequest[]>>(`${this.API_URL}/requests/pending`);
  }

  /**
   * Obtener solicitudes enviadas
   */
  getSentRequests(): Observable<ApiResponse<FriendRequest[]>> {
    return this.http.get<ApiResponse<FriendRequest[]>>(`${this.API_URL}/requests/sent`);
  }

  /**
   * Eliminar contacto
   */
  removeContact(contactId: number): Observable<ApiResponse<{ message: string }>> {
    return this.http.delete<ApiResponse<{ message: string }>>(`${this.API_URL}/${contactId}`);
  }

  /**
   * Buscar usuarios por email o nombre
   */
  searchUsers(query: string): Observable<ApiResponse<User[]>> {
    return this.http.get<ApiResponse<User[]>>(`${this.API_URL}/search`, {
      params: { q: query }
    });
  }
}

export interface User {
  id: number;
  email: string;
  name?: string;
  avatar?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

