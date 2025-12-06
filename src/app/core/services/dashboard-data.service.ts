import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { MessagesService, Chat, Message, SendMessageRequest } from './messages.service';
import { ContactsService, Contact, FriendRequest, User } from './contacts.service';
import { environment } from '../../../environments/environment';
import { DisplayChat, DisplayMessage, MessagesResult, ProfileData } from '../models/auth.module';

@Injectable({
  providedIn: 'root'
})
/**
 * Servicio fachada que combina datos de mensajes, contactos y perfil
 * para entregarlos listos para mostrar en el dashboard.
 */
export class DashboardDataService {
  constructor(
    private messagesService: MessagesService,
    private contactsService: ContactsService,
    private authService: AuthService
  ) {}

  /** Obtiene los chats desde la API y los transforma en `DisplayChat`. */
  fetchChats(): Observable<DisplayChat[]> {
    return this.messagesService.getChats().pipe(
      map(response => response.data.map(chat => this.mapChatToDisplay(chat)))
    );
  }

  /** Recupera los chats archivados aplicando el mismo mapeo de presentación. */
  fetchArchivedChats(): Observable<DisplayChat[]> {
    return this.messagesService.getArchivedChats().pipe(
      map(response => response.data.map(chat => this.mapChatToDisplay(chat, (chat as any).archivedAt)))
    );
  }

  /** Devuelve los contactos planos para integrarlos con los chats en UI. */
  fetchContacts(): Observable<Contact[]> {
    return this.contactsService.getContacts().pipe(map(response => response.data));
  }

  /** Normaliza las solicitudes recibidas para que incluyan avatares válidos. */
  fetchPendingRequests(): Observable<FriendRequest[]> {
    return this.contactsService.getPendingRequests().pipe(
      map(response => response.data.map(request => this.normalizeFriendRequest(request)))
    );
  }

  /** Normaliza las solicitudes enviadas agregando avatares de respaldo. */
  fetchSentRequests(): Observable<FriendRequest[]> {
    return this.contactsService.getSentRequests().pipe(
      map(response => response.data.map(request => this.normalizeFriendRequest(request)))
    );
  }

  /** Busca usuarios y garantiza que cuenten con un avatar utilizable. */
  searchUsers(query: string): Observable<User[]> {
    return this.contactsService.searchUsers(query).pipe(
      map(response =>
        response.data.map(user => ({
          ...user,
          avatar: this.getAvatarOrFallback(user.avatar, user.name, user.email)
        }))
      )
    );
  }

  /** Proxy que envía solicitudes de amistad. */
  sendFriendRequest(contactId: number) {
    return this.contactsService.sendFriendRequest({ contactId });
  }

  /** Proxy que acepta solicitudes de amistad. */
  acceptFriendRequest(contactId: number) {
    return this.contactsService.acceptFriendRequest(contactId);
  }

  /** Proxy que rechaza solicitudes de amistad. */
  rejectFriendRequest(contactId: number) {
    return this.contactsService.rejectFriendRequest(contactId);
  }

  /** Obtiene mensajes paginados y los adapta al formato mostrado en el dashboard. */
  fetchMessages(contactId: number, currentUserId?: number, limit: number = 20, cursor?: number): Observable<MessagesResult> {
    return this.messagesService.getMessages(contactId, limit, cursor).pipe(
      map(response => ({
        messages: response.data.map(message => this.mapMessageToDisplay(message, currentUserId)),
        hasMore: (response as any).hasMore || false,
        nextCursor: (response as any).nextCursor ?? null
      }))
    );
  }

  /** Busca mensajes dentro de un chat aplicando el mapeo a `DisplayMessage`. */
  searchMessages(contactId: number, query: string, currentUserId?: number): Observable<DisplayMessage[]> {
    return this.messagesService.searchMessages(contactId, query).pipe(
      map(response => response.data.map(message => this.mapMessageToDisplay(message, currentUserId)))
    );
  }

  /** Envía un mensaje y devuelve su representación de UI. */
  sendMessage(request: SendMessageRequest, currentUserId?: number): Observable<DisplayMessage> {
    return this.messagesService.sendMessage(request).pipe(
      map(response => this.mapMessageToDisplay(response.data, currentUserId))
    );
  }

  /** Elimina un mensaje por id. */
  deleteMessage(messageId: number) {
    return this.messagesService.deleteMessage(messageId);
  }

  /** Archiva un chat existente. */
  archiveChat(contactId: number) {
    return this.messagesService.archiveChat(contactId);
  }

  /** Quita un chat del archivo. */
  unarchiveChat(contactId: number) {
    return this.messagesService.unarchiveChat(contactId);
  }

  /** Reenvía un mensaje a otro contacto. */
  forwardMessage(receiverId: number, originalMessageId: number, currentUserId?: number): Observable<DisplayMessage> {
    return this.messagesService.forwardMessage(receiverId, originalMessageId).pipe(
      map(response => this.mapMessageToDisplay(response.data, currentUserId))
    );
  }

  /** Elimina un chat completo (todos los mensajes). */
  deleteChat(contactId: number) {
    return this.messagesService.deleteChat(contactId);
  }

  /** Sube un archivo (imagen o audio) y retorna su información. */
  uploadFile(file: File): Observable<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }> {
    return this.messagesService.uploadFile(file).pipe(
      map(response => {
        console.log('Upload file response:', response);
        if (response && response.data) {
          return response.data;
        }
        throw new Error('Invalid response from upload service');
      })
    );
  }

  /** Marca mensajes como leídos en el backend. */
  markMessagesAsRead(contactId: number) {
    return this.messagesService.markMessagesAsRead(contactId);
  }

  /** Recupera el perfil del usuario y asegura rutas absolutas de avatar. */
  fetchProfile(): Observable<ProfileData> {
    return this.authService.getProfile().pipe(
      map(response => ({
        name: response.user.name || '',
        email: response.user.email || '',
        avatar: this.toAbsoluteAvatar(response.user.avatar)
      }))
    );
  }

  /** Actualiza el nombre del perfil y devuelve la nueva información. */
  updateProfile(name: string): Observable<ProfileData> {
    return this.authService.updateProfile({ name }).pipe(
      map(response => ({
        name: response.user.name || '',
        email: response.user.email || '',
        avatar: this.toAbsoluteAvatar(response.user.avatar)
      }))
    );
  }

  /** Sube un avatar y retorna el perfil actualizado más el mensaje del backend. */
  uploadAvatar(file: File): Observable<{ profile: ProfileData; message: string }> {
    return this.authService.uploadAvatar(file).pipe(
      map(response => ({
        profile: {
          name: response.user.name || '',
          email: response.user.email || '',
          avatar: this.toAbsoluteAvatar(response.avatarUrl || response.user.avatar)
        },
        message: response.message || 'Avatar actualizado correctamente'
      }))
    );
  }

  /** Genera un chat "vacío" a partir de un contacto sin conversación previa. */
  createChatFromContact(contact: Contact): DisplayChat {
    return {
      id: contact.contact.id.toString(),
      contactId: contact.contact.id,
      name: contact.contact.name || contact.contact.email,
      lastMessage: 'Nuevo contacto - ¡Envía el primer mensaje!',
      lastMessageSenderId: undefined,
      timestamp: this.formatRelativeTime(contact.createdAt),
      unreadCount: 0,
      isOnline: contact.contact.isOnline || false,
      avatar: this.getAvatarOrFallback(contact.contact.avatar, contact.contact.name, contact.contact.email)
    };
  }

  /** Adapta un mensaje recibido por socket al formato de la UI. */
  mapRealtimeMessage(message: Message, currentUserId?: number): DisplayMessage {
    return this.mapMessageToDisplay(message, currentUserId);
  }

  /** Helper para exponer el resolvedor de avatares al componente. */
  resolveAvatar(avatar?: string | null, name?: string | null, email?: string | null): string {
    return this.getAvatarOrFallback(avatar, name, email);
  }

  /** Expone la generación de avatares genéricos. */
  buildFallbackAvatar(name?: string | null, email?: string | null): string {
    return this.getFallbackAvatar(name, email);
  }

  /** Convierte fechas ISO en textos relativos amigables (Hace X min, etc.). */
  formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;

    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  /** Transforma la estructura `Chat` entregada por la API a `DisplayChat`. */
  private mapChatToDisplay(chat: Chat, fallbackDate?: string): DisplayChat {
    const lastActivity = chat.lastMessage?.createdAt || fallbackDate || new Date().toISOString();
    return {
      id: chat.contact.id.toString(),
      contactId: Number(chat.contact.id),
      name: chat.contact.name || chat.contact.email,
      lastMessage: chat.lastMessage?.content || '',
      lastMessageSenderId: chat.lastMessage?.senderId,
      timestamp: this.formatRelativeTime(lastActivity),
      unreadCount: chat.unreadCount || 0,
      isOnline: chat.contact.isOnline || false,
      avatar: this.getAvatarOrFallback(chat.contact.avatar, chat.contact.name, chat.contact.email)
    };
  }

  /** Convierte el modelo de mensaje del backend a uno apto para la interfaz. */
  private mapMessageToDisplay(message: Message, currentUserId?: number): DisplayMessage {
    const displayMessage: DisplayMessage = {
      id: message.id,
      sender: message.sender.name || message.sender.email,
      text: message.content,
      time: this.formatRelativeTime(message.createdAt),
      avatar: this.getAvatarOrFallback(message.sender.avatar, message.sender.name, message.sender.email),
      isCurrentUser: message.senderId === currentUserId,
      isRead: message.isRead,
      readAt: message.readAt
    };

    if (message.fileUrl) {
      displayMessage.fileUrl = this.toAbsoluteFileUrl(message.fileUrl);
      displayMessage.fileName = message.fileName;
      displayMessage.fileType = message.fileType;
      displayMessage.fileSize = message.fileSize;
      console.log('Message with file:', {
        fileUrl: displayMessage.fileUrl,
        fileName: displayMessage.fileName,
        fileType: displayMessage.fileType
      });
    }

    if (message.forwardedFrom) {
      displayMessage.forwardedFrom = {
        id: message.forwardedFrom.id,
        content: message.forwardedFrom.content,
        sender: message.forwardedFrom.sender.name || message.forwardedFrom.sender.email
      };
    }

    return displayMessage;
  }

  /** Construye URLs absolutas para archivos adjuntos. */
  private toAbsoluteFileUrl(fileUrl?: string | null): string | undefined {
    if (!fileUrl || (typeof fileUrl === 'string' && fileUrl.trim().length === 0)) {
      return undefined;
    }

    if (/^https?:\/\//i.test(fileUrl) || fileUrl.startsWith('data:')) {
      return fileUrl;
    }

    const normalized = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
    return `${environment.apiUrl}${normalized}`;
  }

  /** Asegura que las solicitudes de amistad tengan avatares válidos. */
  private normalizeFriendRequest(request: FriendRequest): FriendRequest {
    return {
      ...request,
      ...(request.user && {
        user: {
          ...request.user,
          avatar: this.getAvatarOrFallback(request.user.avatar, request.user.name, request.user.email)
        }
      }),
      ...(request.contact && {
        contact: {
          ...request.contact,
          avatar: this.getAvatarOrFallback(request.contact.avatar, request.contact.name, request.contact.email)
        }
      })
    };
  }

  /** Construye URLs absolutas para avatares almacenados como rutas relativas. */
  private toAbsoluteAvatar(avatar?: string | null): string | undefined {
    // Manejar null, undefined, o cadena vacía
    if (!avatar || (typeof avatar === 'string' && avatar.trim().length === 0) || avatar === 'null' || avatar === 'undefined') {
      return undefined;
    }

    // Si ya es una URL absoluta o data URI, retornarla directamente
    if (/^https?:\/\//i.test(avatar) || avatar.startsWith('data:')) {
      return avatar;
    }

    // Convertir ruta relativa a absoluta
    const normalized = avatar.startsWith('/') ? avatar : `/${avatar}`;
    return `${environment.apiUrl}${normalized}`;
  }

  /** Retorna un avatar válido o genera uno nuevo si la referencia no sirve. */
  private getAvatarOrFallback(avatar?: string | null, name?: string | null, email?: string | null): string {
    const resolved = this.toAbsoluteAvatar(avatar);
    // Asegurar que siempre retornamos un string válido
    return resolved ?? this.getFallbackAvatar(name, email);
  }

  /** Construye un avatar usando el servicio externo de iniciales como respaldo. */
  private getFallbackAvatar(name?: string | null, email?: string | null): string {
    const identifier = name || email || 'Usuario';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(identifier)}&background=random`;
  }
}

