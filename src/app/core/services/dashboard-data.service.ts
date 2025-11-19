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
export class DashboardDataService {
  constructor(
    private messagesService: MessagesService,
    private contactsService: ContactsService,
    private authService: AuthService
  ) {}

  fetchChats(): Observable<DisplayChat[]> {
    return this.messagesService.getChats().pipe(
      map(response => response.data.map(chat => this.mapChatToDisplay(chat)))
    );
  }

  fetchArchivedChats(): Observable<DisplayChat[]> {
    return this.messagesService.getArchivedChats().pipe(
      map(response => response.data.map(chat => this.mapChatToDisplay(chat, (chat as any).archivedAt)))
    );
  }

  fetchContacts(): Observable<Contact[]> {
    return this.contactsService.getContacts().pipe(map(response => response.data));
  }

  fetchPendingRequests(): Observable<FriendRequest[]> {
    return this.contactsService.getPendingRequests().pipe(
      map(response => response.data.map(request => this.normalizeFriendRequest(request)))
    );
  }

  fetchSentRequests(): Observable<FriendRequest[]> {
    return this.contactsService.getSentRequests().pipe(
      map(response => response.data.map(request => this.normalizeFriendRequest(request)))
    );
  }

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

  sendFriendRequest(contactId: number) {
    return this.contactsService.sendFriendRequest({ contactId });
  }

  acceptFriendRequest(contactId: number) {
    return this.contactsService.acceptFriendRequest(contactId);
  }

  rejectFriendRequest(contactId: number) {
    return this.contactsService.rejectFriendRequest(contactId);
  }

  fetchMessages(contactId: number, currentUserId?: number, limit: number = 20, cursor?: number): Observable<MessagesResult> {
    return this.messagesService.getMessages(contactId, limit, cursor).pipe(
      map(response => ({
        messages: response.data.map(message => this.mapMessageToDisplay(message, currentUserId)),
        hasMore: (response as any).hasMore || false,
        nextCursor: (response as any).nextCursor ?? null
      }))
    );
  }

  searchMessages(contactId: number, query: string, currentUserId?: number): Observable<DisplayMessage[]> {
    return this.messagesService.searchMessages(contactId, query).pipe(
      map(response => response.data.map(message => this.mapMessageToDisplay(message, currentUserId)))
    );
  }

  sendMessage(request: SendMessageRequest, currentUserId?: number): Observable<DisplayMessage> {
    return this.messagesService.sendMessage(request).pipe(
      map(response => this.mapMessageToDisplay(response.data, currentUserId))
    );
  }

  deleteMessage(messageId: number) {
    return this.messagesService.deleteMessage(messageId);
  }

  archiveChat(contactId: number) {
    return this.messagesService.archiveChat(contactId);
  }

  unarchiveChat(contactId: number) {
    return this.messagesService.unarchiveChat(contactId);
  }

  markMessagesAsRead(contactId: number) {
    return this.messagesService.markMessagesAsRead(contactId);
  }

  fetchProfile(): Observable<ProfileData> {
    return this.authService.getProfile().pipe(
      map(response => ({
        name: response.user.name || '',
        email: response.user.email || '',
        avatar: this.toAbsoluteAvatar(response.user.avatar)
      }))
    );
  }

  updateProfile(name: string): Observable<ProfileData> {
    return this.authService.updateProfile({ name }).pipe(
      map(response => ({
        name: response.user.name || '',
        email: response.user.email || '',
        avatar: this.toAbsoluteAvatar(response.user.avatar)
      }))
    );
  }

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

  mapRealtimeMessage(message: Message, currentUserId?: number): DisplayMessage {
    return this.mapMessageToDisplay(message, currentUserId);
  }

  resolveAvatar(avatar?: string | null, name?: string | null, email?: string | null): string {
    return this.getAvatarOrFallback(avatar, name, email);
  }

  buildFallbackAvatar(name?: string | null, email?: string | null): string {
    return this.getFallbackAvatar(name, email);
  }

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

  private mapMessageToDisplay(message: Message, currentUserId?: number): DisplayMessage {
    return {
      id: message.id,
      sender: message.sender.name || message.sender.email,
      text: message.content,
      time: this.formatRelativeTime(message.createdAt),
      avatar: this.getAvatarOrFallback(message.sender.avatar, message.sender.name, message.sender.email),
      isCurrentUser: message.senderId === currentUserId,
      isRead: message.isRead,
      readAt: message.readAt
    };
  }

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

  private toAbsoluteAvatar(avatar?: string | null): string | undefined {
    if (!avatar || avatar.trim().length === 0) {
      return undefined;
    }

    if (/^https?:\/\//i.test(avatar) || avatar.startsWith('data:')) {
      return avatar;
    }

    const normalized = avatar.startsWith('/') ? avatar : `/${avatar}`;
    return `${environment.apiUrl}${normalized}`;
  }

  private getAvatarOrFallback(avatar?: string | null, name?: string | null, email?: string | null): string {
    return this.toAbsoluteAvatar(avatar) ?? this.getFallbackAvatar(name, email);
  }

  private getFallbackAvatar(name?: string | null, email?: string | null): string {
    const identifier = name || email || 'Usuario';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(identifier)}&background=random`;
  }
}

