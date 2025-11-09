import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth.service';
import { MessagesService, Message, Chat } from '../../core/services/messages.service';
import { ContactsService, Contact, FriendRequest, User } from '../../core/services/contacts.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { Subscription } from 'rxjs';

interface DisplayChat {
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

interface DisplayMessage {
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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatTabsModule,
    MatSlideToggleModule,
    MatDialogModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  currentUser: any = null;
  activeTab: string = 'chat';
  activeChatId: string | null = null;
  showDetailsPanel = false;
  isMobileView = false;
  showChatList = true;
  notificationOn: boolean = true;
  soundOn: boolean = false;
  saveToDownloadsOn: boolean = false;
  isLoadingChats = false;
  isLoadingMessages = false;
  isLoadingMoreMessages = false;
  messageText = '';
  searchQuery = '';
  isSearchMode = false;
  hasMoreMessages = false;
  nextCursor: number | null = null;

  chats: DisplayChat[] = [];
  archivedChats: DisplayChat[] = [];
  contacts: Contact[] = [];
  messages: DisplayMessage[] = [];
  pendingRequests: FriendRequest[] = [];
  sentRequests: FriendRequest[] = [];
  isTyping: boolean = false;
  typingTimeout: any = null;
  
  profileData: { name?: string; email?: string; avatar?: string } = {};
  isSavingProfile = false;
  isLoadingProfile = false;
  
  userSearchQuery = '';
  searchResults: User[] = [];
  isSearchingUsers = false;
  searchTimeout: any = null;
  
  contactSearchQuery = '';
  filteredChats: DisplayChat[] = [];
  filteredArchivedChats: DisplayChat[] = [];
  
  private subscriptions: Subscription[] = [];
  private typingDebounceTimeout: any = null;
  private messagesContainer: HTMLElement | null = null;
  private resizeHandler = () => this.checkMobileView();

  get activeChat(): DisplayChat | undefined {
    if (!this.activeChatId) return undefined;
    return [...this.chats, ...this.archivedChats].find(chat => chat.id === this.activeChatId);
  }

  get displayedChats(): DisplayChat[] {
    if (!this.contactSearchQuery || this.contactSearchQuery.trim().length === 0) {
      return this.chats;
    }
    return this.filteredChats;
  }

  get displayedArchivedChats(): DisplayChat[] {
    if (!this.contactSearchQuery || this.contactSearchQuery.trim().length === 0) {
      return this.archivedChats;
    }
    return this.filteredArchivedChats;
  }

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private messagesService: MessagesService,
    private contactsService: ContactsService,
    private websocketService: WebSocketService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
      return;
    }

    this.checkMobileView();
    window.addEventListener('resize', this.resizeHandler);
    this.websocketService.connect();
    this.loadArchivedChats();
    this.loadChats();
    this.loadContacts();
    this.loadPendingRequests();
    this.loadSentRequests();
    this.setupWebSocketListeners();
  }

  checkMobileView(): void {
    this.isMobileView = window.innerWidth < 768;
    if (this.isMobileView && this.activeChatId) {
      this.showChatList = false;
    }
  }

  toggleDetailsPanel(): void {
    this.showDetailsPanel = !this.showDetailsPanel;
    if (this.isMobileView && this.showDetailsPanel && !this.activeChatId) {
      if (!this.activeChat) {
        this.showDetailsPanel = false;
      }
    }
  }

  closeDetailsPanel(): void {
    this.showDetailsPanel = false;
  }

  backToChatList(): void {
    this.showChatList = true;
    this.activeChatId = null;
    this.messages = [];
    this.isSearchMode = false;
    this.searchQuery = '';
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.typingDebounceTimeout) {
      clearTimeout(this.typingDebounceTimeout);
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.websocketService.disconnect();
  }

  loadChats(): void {
    this.isLoadingChats = true;
    this.messagesService.getChats().subscribe({
      next: (response) => {
        let loadedChats = response.data.map(chat => ({
          id: chat.contact.id.toString(),
          contactId: Number(chat.contact.id),
          name: chat.contact.name || chat.contact.email,
          lastMessage: chat.lastMessage?.content || '',
          lastMessageSenderId: chat.lastMessage?.senderId,
          timestamp: this.formatTime(chat.lastMessage?.createdAt || new Date().toISOString()),
          unreadCount: chat.unreadCount || 0,
          isOnline: chat.contact.isOnline || false,
          avatar: chat.contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.contact.name || chat.contact.email)}&background=random`
        }));
        
        const archivedContactIds = new Set(this.archivedChats.map(ac => ac.contactId));
        this.chats = loadedChats.filter(chat => !archivedContactIds.has(chat.contactId));
        this.isLoadingChats = false;
        this.mergeContactsWithChats();
        this.filterChats();
      },
      error: (error) => {
        console.error('Error loading chats:', error);
        this.snackBar.open('Error al cargar los chats', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.isLoadingChats = false;
      }
    });
  }

  loadContacts(): void {
    this.contactsService.getContacts().subscribe({
      next: (response) => {
        this.contacts = response.data;
        this.mergeContactsWithChats();
      },
      error: (error) => {
        console.error('Error loading contacts:', error);
      }
    });
  }

  loadArchivedChats(): void {
    if (this.activeTab === 'archived') {
      this.isLoadingChats = true;
    }
    this.messagesService.getArchivedChats().subscribe({
      next: (response) => {
        this.archivedChats = response.data.map((chat: any) => ({
          id: chat.contact.id.toString(),
          contactId: Number(chat.contact.id),
          name: chat.contact.name || chat.contact.email,
          lastMessage: chat.lastMessage?.content || '',
          lastMessageSenderId: chat.lastMessage?.senderId,
          timestamp: this.formatTime(chat.lastMessage?.createdAt || chat.archivedAt || new Date().toISOString()),
          unreadCount: chat.unreadCount || 0,
          isOnline: chat.contact.isOnline || false,
          avatar: chat.contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.contact.name || chat.contact.email)}&background=random`
        }));
        this.isLoadingChats = false;
        this.filterChats();
        if (this.chats.length > 0) {
          const archivedContactIds = new Set(this.archivedChats.map(ac => ac.contactId));
          this.chats = this.chats.filter(chat => !archivedContactIds.has(chat.contactId));
        }
        if (this.contacts.length > 0) {
          this.mergeContactsWithChats();
        }
      },
      error: (error) => {
        console.error('Error loading archived chats:', error);
        if (this.activeTab === 'archived') {
          this.snackBar.open('Error al cargar los chats archivados', 'Cerrar', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'top'
          });
        }
        this.isLoadingChats = false;
      }
    });
  }

  mergeContactsWithChats(): void {
    const archivedContactIds = new Set(this.archivedChats.map(ac => ac.contactId));
    this.chats = this.chats.filter(chat => !archivedContactIds.has(chat.contactId));
    const chatContactIds = new Set(this.chats.map(c => c.contactId));
    
    this.contacts.forEach(contact => {
      if (!chatContactIds.has(contact.contact.id) && !archivedContactIds.has(contact.contact.id)) {
        const newChat: DisplayChat = {
          id: contact.contact.id.toString(),
          contactId: contact.contact.id,
          name: contact.contact.name || contact.contact.email,
          lastMessage: 'Nuevo contacto - ¡Envía el primer mensaje!',
          lastMessageSenderId: undefined,
          timestamp: this.formatTime(contact.createdAt),
          unreadCount: 0,
          isOnline: contact.contact.isOnline || false,
          avatar: contact.contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.contact.name || contact.contact.email)}&background=random`
        };
        this.chats.push(newChat);
      }
    });
    
    this.chats.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateB - dateA;
    });
    this.filterChats();
  }

  loadMessages(contactId: number, append: boolean = false): void {
    if (!contactId) return;
    
    if (!append) {
      this.isLoadingMessages = true;
      this.messages = [];
      this.nextCursor = null;
      this.hasMoreMessages = false;
    } else {
      this.isLoadingMoreMessages = true;
    }

    this.messagesService.getMessages(contactId, 20, this.nextCursor || undefined).subscribe({
      next: (response: any) => {
        const currentUserId = this.currentUser?.sub;
        const newMessages: DisplayMessage[] = response.data.map((msg: Message) => ({
          id: msg.id,
          sender: msg.sender.name || msg.sender.email,
          text: msg.content,
          time: this.formatTime(msg.createdAt),
          avatar: msg.sender.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.sender.name || msg.sender.email)}&background=random`,
          isCurrentUser: msg.senderId === currentUserId,
          isRead: msg.isRead,
          readAt: msg.readAt
        }));

        if (append) {
          this.messages = [...newMessages, ...this.messages];
        } else {
          this.messages = newMessages;
        }

        this.hasMoreMessages = response.hasMore || false;
        this.nextCursor = response.nextCursor || null;
        this.isLoadingMessages = false;
        this.isLoadingMoreMessages = false;

        if (!append && this.messages.length > 0) {
          setTimeout(() => this.scrollToBottom(), 100);
        } else if (append) {
          setTimeout(() => this.maintainScrollPosition(newMessages.length), 100);
        }
      },
      error: (error) => {
        if (error.status === 404 || error.error?.message?.includes('no encontrado')) {
          if (!append) {
            this.messages = [];
          }
        } else {
          console.error('Error loading messages:', error);
          this.snackBar.open('Error al cargar los mensajes', 'Cerrar', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'top'
          });
        }
        this.isLoadingMessages = false;
        this.isLoadingMoreMessages = false;
      }
    });
  }

  loadMoreMessages(): void {
    if (!this.activeChatId || this.isLoadingMoreMessages || !this.hasMoreMessages) return;
    const chat = [...this.chats, ...this.archivedChats].find(c => c.id === this.activeChatId);
    if (chat) {
      this.loadMessages(chat.contactId, true);
    }
  }

  maintainScrollPosition(previousMessageCount: number): void {
    const container = this.messagesContainer || document.querySelector('.messages-container');
    if (container) {
      const currentScrollTop = container.scrollTop;
      const currentScrollHeight = container.scrollHeight;
      const newScrollHeight = container.scrollHeight;
      const heightDifference = newScrollHeight - currentScrollHeight;
      container.scrollTop = currentScrollTop + heightDifference;
    }
  }

  onMessagesScroll(event: Event): void {
    const container = event.target as HTMLElement;
    if (container.scrollTop === 0 && this.hasMoreMessages && !this.isLoadingMoreMessages) {
      this.loadMoreMessages();
    }
  }

  loadPendingRequests(): void {
    this.contactsService.getPendingRequests().subscribe({
      next: (response) => {
        this.pendingRequests = response.data;
      },
      error: (error) => {
        console.error('Error loading pending requests:', error);
      }
    });
  }

  loadSentRequests(): void {
    this.contactsService.getSentRequests().subscribe({
      next: (response) => {
        this.sentRequests = response.data;
      },
      error: (error) => {
        console.error('Error loading sent requests:', error);
      }
    });
  }

  selectChat(chatId: string): void {
    this.isTyping = false;
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    if (this.typingDebounceTimeout) {
      clearTimeout(this.typingDebounceTimeout);
    }
    
    if (this.activeChatId && this.activeChat) {
      this.websocketService.emitTypingStop(this.activeChat.contactId);
    }
    
    this.isSearchMode = false;
    this.searchQuery = '';
    this.activeChatId = chatId;
    
    if (this.isMobileView) {
      this.showChatList = false;
    }
    
    const chat = [...this.chats, ...this.archivedChats].find(c => c.id === chatId);
    if (chat) {
      this.loadMessages(chat.contactId);
      this.markMessagesAsRead(chat.contactId);
      setTimeout(() => {
        this.messagesContainer = document.querySelector('.messages-container');
      }, 100);
    }
  }

  markMessagesAsRead(contactId: number): void {
    this.messagesService.markMessagesAsRead(contactId).subscribe({
      next: (response) => {
        if (response.data.count > 0 && this.activeChatId) {
          response.data.messageIds.forEach(messageId => {
            const messageIndex = this.messages.findIndex(m => m.id === messageId);
            if (messageIndex !== -1) {
              this.messages[messageIndex].isRead = true;
              this.messages[messageIndex].readAt = new Date().toISOString();
            }
          });
          this.cdr.detectChanges();
          this.loadChats();
        }
      },
      error: (error) => {
        console.debug('Error al marcar mensajes como leídos:', error);
      }
    });
  }

  sendMessage(): void {
    if (!this.messageText.trim() || !this.activeChatId) return;

    const chat = [...this.chats, ...this.archivedChats].find(c => c.id === this.activeChatId);
    if (!chat) return;

    if (this.typingDebounceTimeout) {
      clearTimeout(this.typingDebounceTimeout);
    }
    this.websocketService.emitTypingStop(chat.contactId);

    const messageContent = this.messageText.trim();
    const request = {
      receiverId: chat.contactId,
      content: messageContent
    };

    const currentUserId = this.currentUser?.sub;
    const tempMessage: DisplayMessage = {
      id: Date.now(),
      sender: this.currentUser?.email || 'Tú',
      text: messageContent,
      time: 'Ahora',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentUser?.email || 'Usuario')}&background=random`,
      isCurrentUser: true
    };
    this.messages.push(tempMessage);
    this.messageText = '';
    setTimeout(() => this.scrollToBottom(), 100);

    this.messagesService.sendMessage(request).subscribe({
      next: (response) => {
        const messageIndex = this.messages.findIndex(m => m.id === tempMessage.id);
        if (messageIndex !== -1) {
          this.messages[messageIndex] = {
            id: response.data.id,
            sender: response.data.sender.name || response.data.sender.email,
            text: response.data.content,
            time: this.formatTime(response.data.createdAt),
            avatar: response.data.sender.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(response.data.sender.name || response.data.sender.email)}&background=random`,
            isCurrentUser: response.data.senderId === currentUserId,
            isRead: response.data.isRead,
            readAt: response.data.readAt
          };
        }
        this.loadChats();
      },
      error: (error) => {
        console.error('Error sending message:', error);
        const messageIndex = this.messages.findIndex(m => m.id === tempMessage.id);
        if (messageIndex !== -1) {
          this.messages.splice(messageIndex, 1);
        }
        this.messageText = messageContent;
        this.snackBar.open(error.error?.message || 'Error al enviar el mensaje', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  setupWebSocketListeners(): void {
    const newMessageSub = this.websocketService.onNewMessage().subscribe((event) => {
      const currentUserId = this.currentUser?.sub;
      const displayMessage: DisplayMessage = {
        id: event.message.id,
        sender: event.message.sender.name || event.message.sender.email,
        text: event.message.content,
        time: this.formatTime(event.message.createdAt),
        avatar: event.message.sender.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(event.message.sender.name || event.message.sender.email)}&background=random`,
        isCurrentUser: event.message.senderId === currentUserId,
        isRead: event.message.isRead,
        readAt: event.message.readAt
      };

      if (this.activeChatId && this.activeChat?.contactId === event.from) {
        const messageExists = this.messages.some(m => m.id === event.message.id);
        if (!messageExists) {
          const tempMessageIndex = this.messages.findIndex(m => 
            m.isCurrentUser && 
            m.text === event.message.content && 
            typeof m.id === 'number' && 
            m.id > 1000000000000
          );
          
          if (tempMessageIndex !== -1) {
            this.messages[tempMessageIndex] = displayMessage;
          } else {
            this.messages.push(displayMessage);
          }
          setTimeout(() => this.scrollToBottom(), 100);
          this.markMessagesAsRead(event.from);
        }
      }

      this.loadChats();
    });

    const friendRequestSub = this.websocketService.onFriendRequestReceived().subscribe((event) => {
      const request = event.request as any;
      const userName = (request.user?.name || request.user?.email || request.contact?.name || request.contact?.email || 'usuario') as string;
      this.snackBar.open(`Nueva solicitud de amistad de ${userName}`, 'Ver', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      this.loadPendingRequests();
    });

    const friendAcceptedSub = this.websocketService.onFriendRequestAccepted().subscribe((event) => {
      this.snackBar.open('Tu solicitud de amistad fue aceptada', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      this.loadChats();
      this.loadContacts();
      this.loadSentRequests();
    });

    const friendRejectedSub = this.websocketService.onFriendRequestRejected().subscribe((event) => {
      this.snackBar.open('Tu solicitud de amistad fue rechazada', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      this.loadSentRequests();
    });

    const userOnlineSub = this.websocketService.onUserOnline().subscribe((event) => {
      const chat = [...this.chats, ...this.archivedChats].find(c => c.contactId === event.userId);
      if (chat) {
        chat.isOnline = true;
        this.cdr.detectChanges();
      }
    });

    const userOfflineSub = this.websocketService.onUserOffline().subscribe((event) => {
      const chat = [...this.chats, ...this.archivedChats].find(c => c.contactId === event.userId);
      if (chat) {
        chat.isOnline = false;
        this.cdr.detectChanges();
      }
    });

    const messagesReadSub = this.websocketService.onMessagesRead().subscribe((event) => {
      if (this.activeChatId && this.activeChat?.contactId === event.from) {
        event.messageIds.forEach(messageId => {
          const messageIndex = this.messages.findIndex(m => m.id === messageId);
          if (messageIndex !== -1) {
            this.messages[messageIndex].isRead = true;
            this.messages[messageIndex].readAt = event.timestamp;
          }
        });
        this.cdr.detectChanges();
      }
      
      const chat = [...this.chats, ...this.archivedChats].find(c => c.contactId === event.from);
      if (chat) {
        this.loadChats();
      }
    });

    const userTypingSub = this.websocketService.onUserTyping().subscribe((event) => {
      const activeContactId = Number(this.activeChat?.contactId);
      const eventFromId = Number(event.from);
      
      if (this.activeChatId && !isNaN(activeContactId) && !isNaN(eventFromId) && activeContactId === eventFromId) {
        this.isTyping = event.isTyping;
        this.cdr.detectChanges();
        
        if (event.isTyping) {
          setTimeout(() => this.scrollToBottom(), 100);
          
          if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
          }
          this.typingTimeout = setTimeout(() => {
            this.isTyping = false;
            this.cdr.detectChanges();
          }, 3000);
        } else {
          this.isTyping = false;
          this.cdr.detectChanges();
          if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
          }
        }
      }
    });

    this.subscriptions.push(
      newMessageSub,
      friendRequestSub,
      friendAcceptedSub,
      friendRejectedSub,
      userOnlineSub,
      userOfflineSub,
      userTypingSub,
      messagesReadSub
    );
  }

  onMessageInput(): void {
    if (!this.activeChatId) return;
    
    const chat = [...this.chats, ...this.archivedChats].find(c => c.id === this.activeChatId);
    if (!chat) return;

    this.websocketService.emitTypingStart(chat.contactId);
    this.markMessagesAsRead(chat.contactId);

    if (this.typingDebounceTimeout) {
      clearTimeout(this.typingDebounceTimeout);
    }

    this.typingDebounceTimeout = setTimeout(() => {
      this.websocketService.emitTypingStop(chat.contactId);
    }, 2000);
  }

  onMessageInputBlur(): void {
    if (!this.activeChatId) return;
    
    const chat = [...this.chats, ...this.archivedChats].find(c => c.id === this.activeChatId);
    if (!chat) return;

    if (this.typingDebounceTimeout) {
      clearTimeout(this.typingDebounceTimeout);
    }
    this.websocketService.emitTypingStop(chat.contactId);
  }

  formatTime(dateString: string): string {
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

  acceptFriendRequest(contactId: number): void {
    this.contactsService.acceptFriendRequest(contactId).subscribe({
      next: (response) => {
        this.snackBar.open('Solicitud de amistad aceptada', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.loadPendingRequests();
        this.loadChats();
        this.loadContacts();
      },
      error: (error) => {
        console.error('Error accepting friend request:', error);
        this.snackBar.open(error.error?.message || 'Error al aceptar la solicitud', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  rejectFriendRequest(contactId: number): void {
    this.contactsService.rejectFriendRequest(contactId).subscribe({
      next: (response) => {
        this.snackBar.open('Solicitud de amistad rechazada', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.loadPendingRequests();
      },
      error: (error) => {
        console.error('Error rejecting friend request:', error);
        this.snackBar.open(error.error?.message || 'Error al rechazar la solicitud', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  encodeURI(str: string): string {
    return window.encodeURIComponent(str);
  }

  formatChatPreview(chat: DisplayChat): string {
    if (!chat.lastMessage || chat.lastMessage === 'Nuevo contacto - ¡Envía el primer mensaje!') {
      return chat.lastMessage;
    }

    const currentUserId = this.currentUser?.sub;
    const isFromCurrentUser = chat.lastMessageSenderId === currentUserId;

    if (isFromCurrentUser) {
      return `Tu: ${chat.lastMessage}`;
    } else {
      const senderName = chat.name;
      const initials = this.getInitials(senderName);
      return `${initials}: ${chat.lastMessage}`;
    }
  }

  getInitials(nameOrEmail: string): string {
    if (!nameOrEmail) return 'U';
    
    if (nameOrEmail.includes('@')) {
      const parts = nameOrEmail.split('@')[0].split(/[._-]/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return nameOrEmail.substring(0, 2).toUpperCase();
    }
    
    const words = nameOrEmail.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return nameOrEmail.substring(0, 2).toUpperCase();
  }

  scrollToBottom(): void {
    const messagesContainer = this.messagesContainer || document.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  deleteMessage(messageId: number): void {
    if (!confirm('¿Estás seguro de que quieres eliminar este mensaje?')) {
      return;
    }

    this.messagesService.deleteMessage(messageId).subscribe({
      next: () => {
        const messageIndex = this.messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          this.messages.splice(messageIndex, 1);
        }
        this.snackBar.open('Mensaje eliminado', 'Cerrar', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.loadChats();
      },
      error: (error) => {
        console.error('Error deleting message:', error);
        this.snackBar.open(error.error?.message || 'Error al eliminar el mensaje', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  archiveChat(contactId: number): void {
    this.messagesService.archiveChat(contactId).subscribe({
      next: () => {
        this.snackBar.open('Chat archivado', 'Cerrar', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.loadArchivedChats();
        this.loadChats();
        if (this.activeChatId && this.activeChat?.contactId === contactId) {
          this.activeChatId = null;
          this.messages = [];
        }
      },
      error: (error) => {
        console.error('Error archiving chat:', error);
        this.snackBar.open(error.error?.message || 'Error al archivar el chat', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  unarchiveChat(contactId: number): void {
    this.messagesService.unarchiveChat(contactId).subscribe({
      next: () => {
        this.snackBar.open('Chat desarchivado', 'Cerrar', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.loadArchivedChats();
        this.loadChats();
      },
      error: (error) => {
        console.error('Error unarchiving chat:', error);
        this.snackBar.open(error.error?.message || 'Error al desarchivar el chat', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  onTabChange(tab: string): void {
    this.activeTab = tab;
    if (tab === 'archived') {
      this.loadArchivedChats();
    } else if (tab === 'chat') {
      this.loadChats();
    } else if (tab === 'profile') {
      this.loadProfile();
    } else if (tab === 'requests') {
      this.userSearchQuery = '';
      this.searchResults = [];
    }
    this.contactSearchQuery = '';
    this.filterChats();
  }

  onContactSearchInput(): void {
    this.filterChats();
  }

  filterChats(): void {
    const query = this.contactSearchQuery.trim().toLowerCase();
    
    if (!query || query.length === 0) {
      this.filteredChats = [];
      this.filteredArchivedChats = [];
      return;
    }

    this.filteredChats = this.chats.filter(chat => {
      const nameMatch = chat.name.toLowerCase().includes(query);
      const emailMatch = chat.name.toLowerCase().includes(query);
      const messageMatch = chat.lastMessage.toLowerCase().includes(query);
      return nameMatch || emailMatch || messageMatch;
    });

    this.filteredArchivedChats = this.archivedChats.filter(chat => {
      const nameMatch = chat.name.toLowerCase().includes(query);
      const emailMatch = chat.name.toLowerCase().includes(query);
      const messageMatch = chat.lastMessage.toLowerCase().includes(query);
      return nameMatch || emailMatch || messageMatch;
    });
  }

  onUserSearchInput(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (!this.userSearchQuery || this.userSearchQuery.trim().length < 2) {
      this.searchResults = [];
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.searchUsers();
    }, 500);
  }

  searchUsers(): void {
    if (!this.userSearchQuery || this.userSearchQuery.trim().length < 2) {
      this.searchResults = [];
      return;
    }

    this.isSearchingUsers = true;
    this.contactsService.searchUsers(this.userSearchQuery.trim()).subscribe({
      next: (response) => {
        this.searchResults = response.data;
        this.isSearchingUsers = false;
      },
      error: (error) => {
        console.error('Error searching users:', error);
        this.searchResults = [];
        this.isSearchingUsers = false;
      }
    });
  }

  sendFriendRequestFromSearch(userId: number): void {
    this.contactsService.sendFriendRequest({ contactId: userId }).subscribe({
      next: (response) => {
        this.snackBar.open('Solicitud de amistad enviada', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.loadSentRequests();
        this.userSearchQuery = '';
        this.searchResults = [];
      },
      error: (error) => {
        console.error('Error sending friend request:', error);
        this.snackBar.open(error.error?.message || 'Error al enviar la solicitud', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  isUserInSentRequests(userId: number): boolean {
    return this.sentRequests.some(req => 
      (req.user && req.user.id === userId) || 
      (req.contact && req.contact.id === userId)
    );
  }

  isUserInPendingRequests(userId: number): boolean {
    return this.pendingRequests.some(req => 
      req.user && req.user.id === userId
    );
  }

  isUserAlreadyContact(userId: number): boolean {
    return this.chats.some(chat => chat.contactId === userId) ||
           this.contacts.some(contact => contact.contact.id === userId);
  }

  loadProfile(): void {
    this.isLoadingProfile = true;
    this.authService.getProfile().subscribe({
      next: (response) => {
        this.profileData = {
          name: response.user.name || '',
          email: response.user.email || '',
          avatar: response.user.avatar || undefined,
        };
        this.isLoadingProfile = false;
      },
      error: (error) => {
        console.error('Error loading profile:', error);
        this.profileData = {
          name: this.currentUser?.name || '',
          email: this.currentUser?.email || '',
          avatar: this.currentUser?.avatar || undefined,
        };
        this.isLoadingProfile = false;
      }
    });
  }

  saveProfile(): void {
    if (!this.profileData.name?.trim()) {
      this.snackBar.open('El nombre no puede estar vacío', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    this.isSavingProfile = true;
    this.authService.updateProfile({
      name: this.profileData.name.trim(),
    }).subscribe({
      next: (response) => {
        this.profileData = {
          name: response.user.name || '',
          email: response.user.email || '',
          avatar: response.user.avatar || undefined,
        };
        this.isSavingProfile = false;
        this.snackBar.open('Perfil actualizado correctamente', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.loadChats();
      },
      error: (error) => {
        console.error('Error updating profile:', error);
        this.isSavingProfile = false;
        this.snackBar.open(error.error?.message || 'Error al actualizar el perfil', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  toggleSearchMode(): void {
    this.isSearchMode = !this.isSearchMode;
    if (!this.isSearchMode) {
      this.searchQuery = '';
      if (this.activeChatId && this.activeChat) {
        this.loadMessages(this.activeChat.contactId);
      }
    }
  }

  searchMessages(): void {
    if (!this.searchQuery.trim() || !this.activeChatId) return;
    const activeChat = [...this.chats, ...this.archivedChats].find(c => c.id === this.activeChatId);
    if (!activeChat) return;

    this.isLoadingMessages = true;
    this.messagesService.searchMessages(activeChat.contactId, this.searchQuery.trim()).subscribe({
      next: (response: any) => {
        const currentUserId = this.currentUser?.sub;
        this.messages = response.data.map((msg: Message) => ({
          id: msg.id,
          sender: msg.sender.name || msg.sender.email,
          text: msg.content,
          time: this.formatTime(msg.createdAt),
          avatar: msg.sender.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.sender.name || msg.sender.email)}&background=random`,
          isCurrentUser: msg.senderId === currentUserId,
          isRead: msg.isRead,
          readAt: msg.readAt
        }));
        this.isLoadingMessages = false;
      },
      error: (error) => {
        console.error('Error searching messages:', error);
        this.snackBar.open('Error al buscar mensajes', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.isLoadingMessages = false;
      }
    });
  }

  logout(): void {
    this.websocketService.disconnect();
    this.authService.logout().subscribe({
      next: () => {
        this.snackBar.open('Sesión cerrada exitosamente', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.router.navigate(['/']);
      },
      error: (error) => {
        console.error('Error during logout:', error);
        this.router.navigate(['/']);
      }
    });
  }
}
