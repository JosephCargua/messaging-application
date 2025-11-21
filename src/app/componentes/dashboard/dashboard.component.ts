import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
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
import { MatDialogModule, MatDialog, MatDialogRef, MatDialogConfig } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth.service';
import { ContactsService, Contact, FriendRequest, User, BlockedUser } from '../../core/services/contacts.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { DashboardDataService } from '../../core/services/dashboard-data.service';
import { DisplayChat, DisplayMessage, ProfileData } from '../../core/models/auth.module';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { Subscription } from 'rxjs';

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
  @ViewChild('avatarInput') avatarInputRef?: ElementRef<HTMLInputElement>;

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
  
  profileData: ProfileData = {};
  isSavingProfile = false;
  isLoadingProfile = false;
  isUploadingAvatar = false;
  
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

  get profileAvatarUrl(): string {
    if (this.profileData?.avatar) {
      return this.profileData.avatar;
    }

    return this.dashboardDataService.buildFallbackAvatar(
      this.profileData?.name || this.currentUser?.name,
      this.profileData?.email || this.currentUser?.email
    );
  }

  get isActiveChatBlocked(): boolean {
    return this.activeChat ? this.isUserBlocked(this.activeChat.contactId) : false;
  }

  getActiveChatAvatar(): string | undefined {
    if (!this.activeChat) return undefined;
    
    // Si el avatar está vacío o es null/undefined, generar uno de fallback
    if (!this.activeChat.avatar || this.activeChat.avatar.trim().length === 0) {
      return this.dashboardDataService.buildFallbackAvatar(
        this.activeChat.name,
        this.activeChat.name // Usar el nombre como fallback si no hay email disponible
      );
    }
    
    // Si el avatar no es una URL válida (no empieza con http o data), intentar resolverla
    if (!this.activeChat.avatar.startsWith('http') && !this.activeChat.avatar.startsWith('data:')) {
      return this.dashboardDataService.resolveAvatar(
        this.activeChat.avatar,
        this.activeChat.name,
        this.activeChat.name
      );
    }
    
    return this.activeChat.avatar;
  }

  onAvatarError(event: Event, name?: string): void {
    const img = event.target as HTMLImageElement;
    
    // Si la imagen ya es un avatar de fallback, no hacer nada para evitar loops infinitos
    if (img.src && img.src.includes('ui-avatars.com')) {
      return;
    }
    
    // Si hay un nombre, usar el avatar de fallback
    if (name) {
      img.src = this.dashboardDataService.buildFallbackAvatar(name);
    } else {
      // Si no hay nombre, usar un avatar genérico
      img.src = this.dashboardDataService.buildFallbackAvatar('Usuario');
    }
    
    // Prevenir que se siga intentando cargar la imagen original
    img.onerror = null;
  }

  blockedUsers: Set<number> = new Set();
  isBlockingUser = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    public dashboardDataService: DashboardDataService,
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

    const currentUserSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
    this.subscriptions.push(currentUserSub);

    this.checkMobileView();
    window.addEventListener('resize', this.resizeHandler);
    this.websocketService.connect();
    this.loadArchivedChats();
    this.loadChats();
    this.loadContacts();
    this.loadPendingRequests();
    this.loadSentRequests();
    this.loadBlockedUsers();
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
    this.dashboardDataService.fetchChats().subscribe({
      next: (loadedChats) => {
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
    this.dashboardDataService.fetchContacts().subscribe({
      next: (contacts) => {
        this.contacts = contacts;
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
    this.dashboardDataService.fetchArchivedChats().subscribe({
      next: (archived) => {
        this.archivedChats = archived;
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
        this.chats.push(this.dashboardDataService.createChatFromContact(contact));
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

    const currentUserId = this.currentUser?.sub;
    this.dashboardDataService.fetchMessages(contactId, currentUserId, 20, this.nextCursor || undefined).subscribe({
      next: (response) => {
        const newMessages: DisplayMessage[] = response.messages;
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
    this.dashboardDataService.fetchPendingRequests().subscribe({
      next: (requests) => {
        this.pendingRequests = requests;
      },
      error: (error) => {
        console.error('Error loading pending requests:', error);
      }
    });
  }

  loadSentRequests(): void {
    this.dashboardDataService.fetchSentRequests().subscribe({
      next: (requests) => {
        this.sentRequests = requests;
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
    this.dashboardDataService.markMessagesAsRead(contactId).subscribe({
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

    // Verificar si el contacto está bloqueado
    if (this.isUserBlocked(chat.contactId)) {
      this.snackBar.open('No puedes enviar mensajes a un contacto bloqueado. Desbloquéalo para continuar.', 'Cerrar', {
        duration: 4000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    // Verificar si el contacto existe en la lista de contactos válidos
    // Si el contacto fue eliminado por bloqueo, puede que el chat exista pero no el contacto
    const contactExists = this.contacts.some(c => c.contact.id === chat.contactId);
    // También verificar si existe un chat activo con ese contacto (los chats pueden existir aunque el contacto fue eliminado)
    // Si el chat existe, intentar enviar el mensaje de todas formas

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
      avatar: this.dashboardDataService.resolveAvatar(this.currentUser?.avatar, this.currentUser?.name, this.currentUser?.email),
      isCurrentUser: true
    };
    this.messages.push(tempMessage);
    this.messageText = '';
    setTimeout(() => this.scrollToBottom(), 100);

    this.dashboardDataService.sendMessage(request, currentUserId).subscribe({
      next: (displayMessage) => {
        const messageIndex = this.messages.findIndex(m => m.id === tempMessage.id);
        if (messageIndex !== -1) {
          this.messages[messageIndex] = displayMessage;
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
        
        // Manejar errores específicos
        let errorMessage = 'Error al enviar el mensaje';
        if (error.error?.message) {
          const errorMsg = error.error.message.toLowerCase();
          // Si el error menciona que no es contacto o hay que enviar solicitud, verificar si está bloqueado
          if ((errorMsg.includes('contacto') || errorMsg.includes('solicitud')) && this.isUserBlocked(chat.contactId)) {
            errorMessage = 'No puedes enviar mensajes a un contacto bloqueado. Desbloquéalo para continuar.';
          } else if (errorMsg.includes('bloqueado') || errorMsg.includes('blocked')) {
            errorMessage = 'No puedes enviar mensajes a este contacto porque está bloqueado.';
          } else {
            errorMessage = error.error.message;
          }
        }
        
        this.snackBar.open(errorMessage, 'Cerrar', {
          duration: 4000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  setupWebSocketListeners(): void {
    const newMessageSub = this.websocketService.onNewMessage().subscribe((event) => {
      const currentUserId = this.currentUser?.sub;
      const displayMessage = this.dashboardDataService.mapRealtimeMessage(event.message, currentUserId);

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

    const userBlockedSub = this.websocketService.onUserBlocked().subscribe((event) => {
      // Evento recibido cuando alguien me bloquea (el evento se emite al usuario bloqueado)
      this.loadBlockedUsers();
      this.loadChats();
      this.loadContacts();
      // Si estoy en un chat con la persona que me bloqueó, cerrarlo
      if (this.activeChat?.contactId === event.by) {
        this.activeChatId = null;
        this.messages = [];
        this.showDetailsPanel = false;
      }
      this.snackBar.open('Has sido bloqueado por un contacto', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
    });

    const userUnblockedSub = this.websocketService.onUserUnblocked().subscribe((event) => {
      this.loadBlockedUsers();
      this.loadChats();
      this.loadContacts();
    });

    this.subscriptions.push(
      newMessageSub,
      friendRequestSub,
      friendAcceptedSub,
      friendRejectedSub,
      userOnlineSub,
      userOfflineSub,
      userTypingSub,
      messagesReadSub,
      userBlockedSub,
      userUnblockedSub
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

  acceptFriendRequest(contactId: number): void {
    this.dashboardDataService.acceptFriendRequest(contactId).subscribe({
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
    this.dashboardDataService.rejectFriendRequest(contactId).subscribe({
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

    this.dashboardDataService.deleteMessage(messageId).subscribe({
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
    this.dashboardDataService.archiveChat(contactId).subscribe({
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
    this.dashboardDataService.unarchiveChat(contactId).subscribe({
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

  loadBlockedUsers(): void {
    this.contactsService.getBlockedUsers().subscribe({
      next: (response) => {
        this.blockedUsers = new Set(response.data.map(blocked => blocked.blockedUser.id));
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading blocked users:', error);
      }
    });
  }

  isUserBlocked(userId: number): boolean {
    return this.blockedUsers.has(userId);
  }

  openBlockConfirmDialog(userId: number, userName: string): void {
    const dialogConfig: MatDialogConfig = {
      width: '400px',
      data: {
        title: 'Bloquear contacto',
        message: `¿Estás seguro de que deseas bloquear a ${userName}? No podrás enviarle mensajes`,
        confirmText: 'Bloquear',
        cancelText: 'Cancelar',
        type: 'block'
      }
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.blockUser(userId);
      }
    });
  }

  openUnblockConfirmDialog(userId: number, userName: string): void {
    const dialogConfig: MatDialogConfig = {
      width: '400px',
      data: {
        title: 'Desbloquear contacto',
        message: `¿Estás seguro de que deseas desbloquear a ${userName}?`,
        confirmText: 'Desbloquear',
        cancelText: 'Cancelar',
        type: 'unblock'
      }
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.unblockUser(userId);
      }
    });
  }

  blockUser(userId: number): void {
    this.isBlockingUser = true;
    this.contactsService.blockUser(userId).subscribe({
      next: (response) => {
        this.blockedUsers.add(userId);
        this.snackBar.open('Usuario bloqueado correctamente. Ya no podrás enviarle mensajes.', 'Cerrar', {
          duration: 4000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        // No recargar chats/contactos porque el backend los elimina, solo actualizar el estado local
        // Mantener el chat visible pero marcado como bloqueado
        this.cdr.detectChanges();
        this.isBlockingUser = false;
      },
      error: (error) => {
        console.error('Error blocking user:', error);
        this.snackBar.open(error.error?.message || 'Error al bloquear el usuario', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.isBlockingUser = false;
      }
    });
  }

  unblockUser(userId: number): void {
    this.isBlockingUser = true;
    this.contactsService.unblockUser(userId).subscribe({
      next: (response) => {
        this.blockedUsers.delete(userId);
        this.snackBar.open('Usuario desbloqueado correctamente. Ya puedes enviarle mensajes.', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        // Recargar chats y contactos para sincronizar con el backend
        // El backend puede haber recreado el contacto al desbloquear
        this.loadBlockedUsers();
        this.loadChats();
        this.loadContacts();
        this.cdr.detectChanges();
        this.isBlockingUser = false;
      },
      error: (error) => {
        console.error('Error unblocking user:', error);
        this.snackBar.open(error.error?.message || 'Error al desbloquear el usuario', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.isBlockingUser = false;
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
    this.dashboardDataService.searchUsers(this.userSearchQuery.trim()).subscribe({
      next: (users) => {
        this.searchResults = users;
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
    this.dashboardDataService.sendFriendRequest(userId).subscribe({
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
    this.dashboardDataService.fetchProfile().subscribe({
      next: (profile) => {
        this.profileData = profile;
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
    this.dashboardDataService.updateProfile(this.profileData.name.trim()).subscribe({
      next: (profile) => {
        this.profileData = profile;
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

  triggerAvatarUpload(): void {
    if (this.isUploadingAvatar) {
      return;
    }
    this.avatarInputRef?.nativeElement.click();
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    if (!this.validateAvatarFile(file)) {
      this.resetAvatarInput();
      return;
    }

    this.startAvatarUpload(file);
  }

  private startAvatarUpload(file: File): void {
    this.isUploadingAvatar = true;
    this.dashboardDataService.uploadAvatar(file).subscribe({
      next: ({ profile, message }) => {
        this.profileData = {
          ...this.profileData,
          avatar: profile.avatar,
        };
        this.isUploadingAvatar = false;
        this.snackBar.open(message || 'Avatar actualizado correctamente', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.resetAvatarInput();
        this.loadChats();
      },
      error: (error) => {
        console.error('Error uploading avatar:', error);
        this.isUploadingAvatar = false;
        this.snackBar.open(error.error?.message || 'Error al subir el avatar', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.resetAvatarInput();
      }
    });
  }

  private validateAvatarFile(file: File): boolean {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.snackBar.open('Solo se permiten imágenes JPG, PNG o WEBP', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return false;
    }

    const maxSize = 2 * 1024 * 1024; // 2 MB
    if (file.size > maxSize) {
      this.snackBar.open('La imagen debe pesar menos de 2 MB', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return false;
    }

    return true;
  }

  private resetAvatarInput(): void {
    if (this.avatarInputRef) {
      this.avatarInputRef.nativeElement.value = '';
    }
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
    const currentUserId = this.currentUser?.sub;
    this.dashboardDataService.searchMessages(activeChat.contactId, this.searchQuery.trim(), currentUserId).subscribe({
      next: (messages) => {
        this.messages = messages;
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
