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
import { SendMessageRequest } from '../../core/services/messages.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ForwardMessageDialogComponent } from '../../shared/components/forward-message-dialog/forward-message-dialog.component';
import { VideoCallComponent } from '../../shared/components/video-call/video-call.component';
import { VideoCallService } from '../../core/services/video-call.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

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
    MatDialogModule,
    VideoCallComponent
  ],
  providers: [VideoCallService],
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
  
  isRecordingAudio = false;
  audioRecorder: MediaRecorder | null = null;
  recordedAudioBlob: Blob | null = null;
  recordingTime = 0;
  recordingInterval: any = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  
  chatMediaImages: DisplayMessage[] = [];
  activeContentTab: 'media' | 'links' | 'docs' = 'media';
  isLoadingMedia = false;
  
  showVideoCall = false;
  
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;
  
  private subscriptions: Subscription[] = [];
  private typingDebounceTimeout: any = null;
  private messagesContainer: HTMLElement | null = null;
  private resizeHandler = () => this.checkMobileView();

  /**
   * Devuelve el chat activo combinando los listados de chats normales y archivados.
   */
  get activeChat(): DisplayChat | undefined {
    if (!this.activeChatId) return undefined;
    return [...this.chats, ...this.archivedChats].find(chat => chat.id === this.activeChatId);
  }

  /**
   * Lista de chats a mostrar según si hay filtro de búsqueda activo.
   */
  get displayedChats(): DisplayChat[] {
    if (!this.contactSearchQuery || this.contactSearchQuery.trim().length === 0) {
      return this.chats;
    }
    return this.filteredChats;
  }

  /**
   * Lista de chats archivados visible en la UI, filtrada si corresponde.
   */
  get displayedArchivedChats(): DisplayChat[] {
    if (!this.contactSearchQuery || this.contactSearchQuery.trim().length === 0) {
      return this.archivedChats;
    }
    return this.filteredArchivedChats;
  }

  /**
   * Obtiene la URL del avatar del perfil o genera uno de respaldo.
   */
  get profileAvatarUrl(): string {
    if (this.profileData?.avatar) {
      return this.profileData.avatar;
    }

    return this.dashboardDataService.buildFallbackAvatar(
      this.profileData?.name || this.currentUser?.name,
      this.profileData?.email || this.currentUser?.email
    );
  }

  /**
   * Indica si el chat activo pertenece a un contacto bloqueado.
   */
  get isActiveChatBlocked(): boolean {
    return this.activeChat ? this.isUserBlocked(this.activeChat.contactId) : false;
  }

  /**
   * Calcula la imagen del chat activo resolviendo avatares relativos o generando fallback.
   */
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
    if (this.activeChat.avatar && !this.activeChat.avatar.startsWith('http') && !this.activeChat.avatar.startsWith('data:')) {
      return this.dashboardDataService.resolveAvatar(
        this.activeChat.avatar,
        this.activeChat.name || '',
        this.activeChat.name || ''
      );
    }
    
    return this.activeChat.avatar || '';
  }

  /**
   * Maneja errores al cargar avatares reemplazándolos por alternativas seguras.
   */
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

  /**
   * Maneja errores al cargar imágenes de mensajes.
   */
  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.error('Error loading image:', img.src);
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'image-error';
      errorDiv.textContent = 'Error al cargar la imagen';
      parent.appendChild(errorDiv);
    }
  }

  /**
   * Maneja errores al cargar archivos de audio.
   */
  onAudioError(event: Event, fileUrl?: string): void {
    const audio = event.target as HTMLAudioElement;
    console.error('Error loading audio:', fileUrl || audio.src);
    
    if (fileUrl && !fileUrl.startsWith('http')) {
      const resolvedUrl = this.resolveFileUrl(fileUrl);
      if (resolvedUrl && resolvedUrl !== audio.src) {
        audio.src = resolvedUrl;
        audio.load();
        return;
      }
    }
    
    this.snackBar.open('Error al cargar el audio', 'Cerrar', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
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
    private cdr: ChangeDetectorRef,
    private videoCallService: VideoCallService
  ) {}

  /**
   * Inicializa el dashboard: valida sesión, configura listeners y carga datos base.
   */
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

  /**
   * Determina si se debe usar vista móvil según el tamaño actual de la ventana.
   */
  checkMobileView(): void {
    this.isMobileView = window.innerWidth < 768;
    if (this.isMobileView && this.activeChatId) {
      this.showChatList = false;
    }
  }

  /**
   * Abre o cierra el panel lateral con la información del chat/contacto.
   */
  toggleDetailsPanel(): void {
    this.showDetailsPanel = !this.showDetailsPanel;
    if (this.isMobileView && this.showDetailsPanel && !this.activeChatId) {
      if (!this.activeChat) {
        this.showDetailsPanel = false;
      }
    }
  }

  /**
   * Cierra el panel lateral de detalles.
   */
  closeDetailsPanel(): void {
    this.showDetailsPanel = false;
  }

  /**
   * Vuelve al listado principal de chats (útil en móvil) y limpia el estado del chat activo.
   */
  backToChatList(): void {
    this.showChatList = true;
    this.activeChatId = null;
    this.messages = [];
    this.isSearchMode = false;
    this.searchQuery = '';
  }

  /**
   * Limpia listeners y suscripciones cuando el componente se destruye.
   */
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
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
    }
    if (this.audioRecorder && this.isRecordingAudio) {
      this.cancelAudioRecording();
    }
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.websocketService.disconnect();
  }

  /**
   * Obtiene los chats activos desde el backend y sincroniza con la lista de contactos.
   */
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

  private loadChatsForIncomingCall(callerId: number): void {
    this.isLoadingChats = true;
    this.dashboardDataService.fetchChats().subscribe({
      next: (loadedChats) => {
        const archivedContactIds = new Set(this.archivedChats.map(ac => ac.contactId));
        this.chats = loadedChats.filter(chat => !archivedContactIds.has(chat.contactId));
        this.isLoadingChats = false;
        this.mergeContactsWithChats();
        this.filterChats();
        
        const updatedChat = [...this.chats, ...this.archivedChats].find(c => c.contactId === callerId);
        if (updatedChat) {
          this.activeChatId = updatedChat.id;
          this.showVideoCall = true;
          this.cdr.detectChanges();
        } else {
          this.snackBar.open('Llamada entrante de un contacto desconocido', 'Cerrar', {
            duration: 5000,
            horizontalPosition: 'center',
            verticalPosition: 'top'
          });
          this.showVideoCall = true;
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('Error loading chats:', error);
        this.isLoadingChats = false;
        this.snackBar.open('Llamada entrante de un contacto desconocido', 'Cerrar', {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.showVideoCall = true;
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Recupera los contactos aceptados para complementar la información de los chats.
   */
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

  /**
   * Trae los chats archivados y actualiza los listados visibles.
   */
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

  /**
   * Agrega contactos sin conversación a la lista de chats y ordena por actividad reciente.
   */
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

  /**
   * Carga mensajes del contacto indicado y controla si se agregan o reemplazan en pantalla.
   */
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

  /**
   * Obtiene más mensajes antiguos cuando el usuario hace scroll hacia arriba.
   */
  loadMoreMessages(): void {
    if (!this.activeChatId || this.isLoadingMoreMessages || !this.hasMoreMessages) return;
    const chat = [...this.chats, ...this.archivedChats].find(c => c.id === this.activeChatId);
    if (chat) {
      this.loadMessages(chat.contactId, true);
    }
  }

  /**
   * Mantiene la posición de scroll cuando se insertan mensajes históricos.
   */
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

  /**
   * Detecta cuando el usuario llega al inicio del contenedor para cargar más mensajes.
   */
  onMessagesScroll(event: Event): void {
    const container = event.target as HTMLElement;
    if (container.scrollTop === 0 && this.hasMoreMessages && !this.isLoadingMoreMessages) {
      this.loadMoreMessages();
    }
  }

  /**
   * Carga las solicitudes de amistad recibidas.
   */
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

  /**
   * Carga las solicitudes de amistad enviadas.
   */
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

  /**
   * Activa un chat, carga sus mensajes y prepara la UI (scroll, lectura, typing).
   */
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

  /**
   * Marca los mensajes del contacto como leídos tanto en backend como en la vista.
   */
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

  /**
   * Envía un mensaje al chat activo gestionando el estado optimista y errores.
   */
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

  /**
   * Registra todos los listeners necesarios para reaccionar a eventos en tiempo real.
   */
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

      if (displayMessage.fileType === 'image' && this.showDetailsPanel && this.activeContentTab === 'media') {
        this.loadChatMedia();
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

    const incomingCallSub = this.videoCallService.onCallIncoming().subscribe((event) => {
      console.log('Llamada entrante recibida:', event);
      const callerId = event.from;
      const chat = [...this.chats, ...this.archivedChats].find(c => c.contactId === callerId);
      
      if (chat) {
        this.activeChatId = chat.id;
        this.showVideoCall = true;
        this.cdr.detectChanges();
      } else {
        this.loadChatsForIncomingCall(callerId);
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
      messagesReadSub,
      userBlockedSub,
      userUnblockedSub,
      incomingCallSub
    );
  }

  /**
   * Emite eventos de "está escribiendo" y marca mensajes como leídos al interactuar con el input.
   */
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

  /**
   * Informa al servidor que el usuario dejó de escribir cuando el input pierde foco.
   */
  onMessageInputBlur(): void {
    if (!this.activeChatId) return;
    
    const chat = [...this.chats, ...this.archivedChats].find(c => c.id === this.activeChatId);
    if (!chat) return;

    if (this.typingDebounceTimeout) {
      clearTimeout(this.typingDebounceTimeout);
    }
    this.websocketService.emitTypingStop(chat.contactId);
  }

  /**
   * Acepta una solicitud de amistad y refresca los datos relacionados.
   */
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

  /**
   * Rechaza una solicitud de amistad recibida.
   */
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

  /**
   * Construye el texto que se muestra debajo del nombre del contacto en la lista de chats.
   */
  formatChatPreview(chat: DisplayChat): string {
    const lastMessage = chat.lastMessage || '';
    
    if (!lastMessage || lastMessage === 'Nuevo contacto - ¡Envía el primer mensaje!') {
      return lastMessage || 'Sin mensajes';
    }

    const currentUserId = this.currentUser?.sub;
    const isFromCurrentUser = chat.lastMessageSenderId === currentUserId;

    if (isFromCurrentUser) {
      return `Tu: ${lastMessage}`;
    } else {
      const senderName = chat.name || '';
      const initials = this.getInitials(senderName);
      return `${initials}: ${lastMessage}`;
    }
  }

  /**
   * Obtiene iniciales a partir del nombre o correo para usarlas como identificador.
   */
  getInitials(nameOrEmail: string | null | undefined): string {
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

  /**
   * Lleva el scroll de la conversación al último mensaje.
   */
  scrollToBottom(): void {
    const messagesContainer = this.messagesContainer || document.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Elimina un mensaje específico tras confirmación del usuario.
   */
  deleteMessage(messageId: number): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Eliminar mensaje',
        message: '¿Estás seguro de que quieres eliminar este mensaje? Esta acción no se puede deshacer.',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        type: 'delete'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
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
    });
  }

  /**
   * Mueve un chat al listado de archivados y resetea el chat activo si corresponde.
   */
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

  /**
   * Restaura un chat del archivo a la bandeja principal.
   */
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

  /**
   * Obtiene la lista de usuarios bloqueados para habilitar lógica de bloqueo en UI.
   */
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

  /**
   * Determina si un contacto está bloqueado actualmente.
   */
  isUserBlocked(userId: number): boolean {
    return this.blockedUsers.has(userId);
  }

  /**
   * Abre el diálogo de confirmación para bloquear a un contacto.
   */
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

  /**
   * Abre el diálogo de confirmación para desbloquear a un contacto.
   */
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

  /**
   * Llama al backend para bloquear a un usuario y actualiza el estado local.
   */
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

  /**
   * Solicita al backend desbloquear a un usuario y sincroniza la información local.
   */
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

  /**
   * Maneja el cambio entre pestañas y carga la información asociada.
   */
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

  /**
   * Dispara el filtrado de chats cuando cambia el texto de búsqueda.
   */
  onContactSearchInput(): void {
    this.filterChats();
  }

  /**
   * Filtra los chats activos y archivados según el texto ingresado.
   */
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

  /**
   * Controla el input de búsqueda de usuarios externos con un debounce.
   */
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

  /**
   * Consume el servicio de búsqueda de usuarios cuando el texto es válido.
   */
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

  /**
   * Envía una solicitud de amistad desde los resultados de búsqueda.
   */
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

  /**
   * Verifica si el usuario ya tiene una solicitud enviada.
   */
  isUserInSentRequests(userId: number): boolean {
    return this.sentRequests.some(req => 
      (req.user && req.user.id === userId) || 
      (req.contact && req.contact.id === userId)
    );
  }

  /**
   * Verifica si el usuario ya envió una solicitud que está pendiente.
   */
  isUserInPendingRequests(userId: number): boolean {
    return this.pendingRequests.some(req => 
      req.user && req.user.id === userId
    );
  }

  /**
   * Determina si el usuario ya forma parte de la lista de contactos o chats.
   */
  isUserAlreadyContact(userId: number): boolean {
    return this.chats.some(chat => chat.contactId === userId) ||
           this.contacts.some(contact => contact.contact.id === userId);
  }

  /**
   * Obtiene la información del perfil para mostrarla en la pestaña correspondiente.
   */
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

  /**
   * Envía los cambios del nombre del perfil y actualiza la lista de chats.
   */
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

  /**
   * Abre el selector de archivos para cambiar el avatar del usuario.
   */
  triggerAvatarUpload(): void {
    if (this.isUploadingAvatar) {
      return;
    }
    this.avatarInputRef?.nativeElement.click();
  }

  /**
   * Valida y procesa el archivo cargado antes de subir el avatar.
   */
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

  /**
   * Envía el archivo del avatar al backend y actualiza el estado local.
   */
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

  /**
   * Verifica tipo y tamaño del archivo del avatar antes de subirlo.
   */
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

  /**
   * Limpia el input file para permitir nuevas cargas consecutivas.
   */
  private resetAvatarInput(): void {
    if (this.avatarInputRef) {
      this.avatarInputRef.nativeElement.value = '';
    }
  }

  /**
   * Activa o desactiva el modo de búsqueda dentro del chat.
   */
  toggleSearchMode(): void {
    this.isSearchMode = !this.isSearchMode;
    if (!this.isSearchMode) {
      this.searchQuery = '';
      if (this.activeChatId && this.activeChat) {
        this.loadMessages(this.activeChat.contactId);
      }
    }
  }

  /**
   * Busca mensajes que coincidan con el texto ingresado en el chat activo.
   */
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

  /**
   * Cierra sesión del usuario, cierra el socket y redirige al inicio.
   */
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

  /**
   * Abre un diálogo para seleccionar el contacto al que reenviar el mensaje.
   */
  openForwardDialog(messageId: number): void {
    if (!this.chats || this.chats.length === 0) {
      this.snackBar.open('No tienes contactos para reenviar el mensaje', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    const availableChats = [...this.chats, ...this.archivedChats].filter(chat => 
      chat.contactId !== this.activeChat?.contactId
    );

    if (availableChats.length === 0) {
      this.snackBar.open('No tienes otros contactos para reenviar el mensaje', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    const dialogConfig: MatDialogConfig = {
      width: '400px',
      maxWidth: '90vw',
      data: {
        chats: availableChats,
        currentContactId: this.activeChat?.contactId
      }
    };

    const dialogRef = this.dialog.open(ForwardMessageDialogComponent, dialogConfig);

    dialogRef.afterClosed().subscribe((selectedContactIds: number[]) => {
      if (selectedContactIds && selectedContactIds.length > 0) {
        let successCount = 0;
        let errorCount = 0;
        const total = selectedContactIds.length;

        selectedContactIds.forEach((contactId, index) => {
          const currentUserId = this.currentUser?.sub;
          this.dashboardDataService.forwardMessage(contactId, messageId, currentUserId).subscribe({
            next: (displayMessage) => {
              successCount++;
              if (this.activeChatId && this.activeChat?.contactId === contactId) {
                this.messages.push(displayMessage);
                setTimeout(() => this.scrollToBottom(), 100);
              }
              
              if (index === total - 1) {
                this.loadChats();
                if (successCount === total) {
                  this.snackBar.open(
                    total === 1 
                      ? 'Mensaje reenviado correctamente' 
                      : `Mensaje reenviado a ${successCount} contacto${successCount > 1 ? 's' : ''}`,
                    'Cerrar',
                    {
                      duration: 3000,
                      horizontalPosition: 'center',
                      verticalPosition: 'top'
                    }
                  );
                } else if (errorCount > 0) {
                  this.snackBar.open(
                    `Reenviado a ${successCount} de ${total} contacto${total > 1 ? 's' : ''}`,
                    'Cerrar',
                    {
                      duration: 3000,
                      horizontalPosition: 'center',
                      verticalPosition: 'top'
                    }
                  );
                }
              }
            },
            error: (error) => {
              errorCount++;
              console.error('Error forwarding message:', error);
              
              if (index === total - 1) {
                if (errorCount === total) {
                  this.snackBar.open('Error al reenviar el mensaje', 'Cerrar', {
                    duration: 3000,
                    horizontalPosition: 'center',
                    verticalPosition: 'top'
                  });
                } else if (successCount > 0) {
                  this.snackBar.open(
                    `Reenviado a ${successCount} de ${total} contacto${total > 1 ? 's' : ''}`,
                    'Cerrar',
                    {
                      duration: 3000,
                      horizontalPosition: 'center',
                      verticalPosition: 'top'
                    }
                  );
                }
              }
            }
          });
        });
      }
    });
  }

  /**
   * Reenvía un mensaje a otro contacto.
   */
  forwardMessage(messageId: number, receiverId: number): void {
    const currentUserId = this.currentUser?.sub;
    this.dashboardDataService.forwardMessage(receiverId, messageId, currentUserId).subscribe({
      next: (displayMessage) => {
        if (this.activeChatId && this.activeChat?.contactId === receiverId) {
          this.messages.push(displayMessage);
          setTimeout(() => this.scrollToBottom(), 100);
        }
        this.loadChats();
        this.snackBar.open('Mensaje reenviado correctamente', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      },
      error: (error) => {
        console.error('Error forwarding message:', error);
        this.snackBar.open(error.error?.message || 'Error al reenviar el mensaje', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  /**
   * Elimina un chat completo tras confirmación del usuario.
   */
  deleteChat(contactId: number): void {
    const dialogConfig: MatDialogConfig = {
      width: '400px',
      data: {
        title: 'Eliminar chat',
        message: '¿Estás seguro de que deseas eliminar este chat? Se eliminarán todos los mensajes y no podrás recuperarlos.',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        type: 'delete'
      }
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.dashboardDataService.deleteChat(contactId).subscribe({
          next: () => {
            this.snackBar.open('Chat eliminado correctamente', 'Cerrar', {
              duration: 3000,
              horizontalPosition: 'center',
              verticalPosition: 'top'
            });
            if (this.activeChatId && this.activeChat?.contactId === contactId) {
              this.activeChatId = null;
              this.messages = [];
            }
            this.loadChats();
            this.loadArchivedChats();
          },
          error: (error) => {
            console.error('Error deleting chat:', error);
            this.snackBar.open(error.error?.message || 'Error al eliminar el chat', 'Cerrar', {
              duration: 3000,
              horizontalPosition: 'center',
              verticalPosition: 'top'
            });
          }
        });
      }
    });
  }

  /**
   * Maneja la selección de archivo para adjuntar a un mensaje.
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    this.uploadAndSendFile(file);
    
    if (input) {
      input.value = '';
    }
  }

  /**
   * Sube un archivo y lo envía como mensaje.
   */
  private uploadAndSendFile(file: File): void {
    if (!this.activeChatId) {
      this.snackBar.open('Selecciona un chat primero', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    const chat = [...this.chats, ...this.archivedChats].find(c => c.id === this.activeChatId);
    if (!chat) return;

    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/') || 
                    file.type === 'audio/webm' || 
                    file.name.toLowerCase().endsWith('.webm') ||
                    file.name.toLowerCase().endsWith('.ogg') ||
                    file.name.toLowerCase().endsWith('.m4a') ||
                    file.name.toLowerCase().endsWith('.mp3') ||
                    file.name.toLowerCase().endsWith('.wav');

    if (!isImage && !isAudio) {
      this.snackBar.open('Solo se permiten imágenes y archivos de audio', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.snackBar.open('El archivo debe pesar menos de 10 MB', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    this.dashboardDataService.uploadFile(file).subscribe({
      next: (fileInfo) => {
        const request: SendMessageRequest = {
          receiverId: chat.contactId,
          content: isImage ? '📷 Imagen' : '🎵 Audio',
          fileUrl: fileInfo.fileUrl,
          fileName: fileInfo.fileName,
          fileType: fileInfo.fileType,
          fileSize: fileInfo.fileSize
        };

        if (this.fileInputRef) {
          this.fileInputRef.nativeElement.value = '';
        }

        const currentUserId = this.currentUser?.sub;
        const resolvedFileUrl = this.resolveFileUrl(fileInfo.fileUrl);
        console.log('Sending file message:', {
          fileUrl: fileInfo.fileUrl,
          resolvedFileUrl: resolvedFileUrl,
          fileName: fileInfo.fileName,
          fileType: fileInfo.fileType
        });
        const tempMessage: DisplayMessage = {
          id: Date.now(),
          sender: this.currentUser?.email || 'Tú',
          text: request.content,
          time: 'Ahora',
          avatar: this.dashboardDataService.resolveAvatar(this.currentUser?.avatar, this.currentUser?.name, this.currentUser?.email),
          isCurrentUser: true,
          fileUrl: resolvedFileUrl,
          fileName: fileInfo.fileName,
          fileType: fileInfo.fileType,
          fileSize: fileInfo.fileSize
        };
        console.log('Temp message created:', tempMessage);
        this.messages.push(tempMessage);
        this.cdr.detectChanges();
        setTimeout(() => this.scrollToBottom(), 100);

        this.dashboardDataService.sendMessage(request, currentUserId).subscribe({
          next: (displayMessage) => {
            const messageIndex = this.messages.findIndex(m => m.id === tempMessage.id);
            if (messageIndex !== -1) {
              this.messages[messageIndex] = displayMessage;
            }
            if (displayMessage.fileType === 'image' && this.showDetailsPanel && this.activeContentTab === 'media') {
              this.loadChatMedia();
            }
            this.loadChats();
          },
          error: (error) => {
            console.error('Error sending file message:', error);
            const messageIndex = this.messages.findIndex(m => m.id === tempMessage.id);
            if (messageIndex !== -1) {
              this.messages.splice(messageIndex, 1);
            }
            this.snackBar.open(error.error?.message || 'Error al enviar el archivo', 'Cerrar', {
              duration: 3000,
              horizontalPosition: 'center',
              verticalPosition: 'top'
            });
          }
        });
      },
      error: (error) => {
        console.error('Error uploading file:', error);
        this.snackBar.open(error.error?.message || 'Error al subir el archivo', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      }
    });
  }

  /**
   * Dispara el selector de archivos para adjuntar imágenes.
   */
  triggerImageUpload(): void {
    if (this.fileInputRef) {
      this.fileInputRef.nativeElement.accept = 'image/*';
      this.fileInputRef.nativeElement.click();
    }
  }

  /**
   * Inicia la grabación de audio.
   */
  async startAudioRecording(): Promise<void> {
    if (!this.activeChatId) {
      this.snackBar.open('Selecciona un chat primero', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        options.mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      }
      
      this.audioRecorder = new MediaRecorder(this.mediaStream, options);
      this.audioChunks = [];

      this.audioRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.audioRecorder.onstop = () => {
        if (this.audioChunks.length > 0) {
          const mimeType = options.mimeType || 'audio/webm';
          this.recordedAudioBlob = new Blob(this.audioChunks, { type: mimeType });
        }
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach(track => track.stop());
          this.mediaStream = null;
        }
      };

      this.audioRecorder.onerror = (event) => {
        console.error('Error en MediaRecorder:', event);
        this.snackBar.open('Error al grabar audio', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
        this.cancelAudioRecording();
      };

      this.audioRecorder.start(100);
      this.isRecordingAudio = true;
      this.recordingTime = 0;
      this.recordedAudioBlob = null;

      this.recordingInterval = setInterval(() => {
        this.recordingTime++;
        this.cdr.detectChanges();
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.snackBar.open('No se pudo acceder al micrófono. Verifica los permisos.', 'Cerrar', {
        duration: 4000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      this.isRecordingAudio = false;
    }
  }

  /**
   * Detiene la grabación de audio y envía el mensaje.
   */
  stopAudioRecording(): void {
    if (this.audioRecorder && this.isRecordingAudio) {
      this.isRecordingAudio = false;
      
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }

      if (this.audioRecorder.state === 'recording') {
        this.audioRecorder.stop();
      }

      setTimeout(() => {
        if (this.recordedAudioBlob && this.recordedAudioBlob.size > 0) {
          const mimeType = this.recordedAudioBlob.type || 'audio/webm';
          const extension = mimeType.includes('webm') ? 'webm' : 
                           mimeType.includes('ogg') ? 'ogg' : 
                           mimeType.includes('mp4') ? 'm4a' : 'webm';
          
          const audioFile = new File([this.recordedAudioBlob], `audio-${Date.now()}.${extension}`, {
            type: mimeType
          });
          
          this.uploadAndSendFile(audioFile);
          this.recordedAudioBlob = null;
          this.audioChunks = [];
          this.recordingTime = 0;
        } else {
          this.snackBar.open('No se pudo grabar el audio. Intenta de nuevo.', 'Cerrar', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'top'
          });
        }
      }, 200);
    }
  }

  /**
   * Cancela la grabación de audio.
   */
  cancelAudioRecording(): void {
    if (this.audioRecorder && this.isRecordingAudio) {
      this.isRecordingAudio = false;
      
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }

      if (this.audioRecorder.state === 'recording') {
        this.audioRecorder.stop();
      }

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      this.recordedAudioBlob = null;
      this.audioChunks = [];
      this.recordingTime = 0;
      this.audioRecorder = null;
    }
  }

  /**
   * Formatea el tiempo de grabación en formato MM:SS.
   */
  formatRecordingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Resuelve la URL del archivo a una URL absoluta.
   */
  private resolveFileUrl(fileUrl?: string | null): string | undefined {
    if (!fileUrl || (typeof fileUrl === 'string' && fileUrl.trim().length === 0)) {
      return undefined;
    }

    if (/^https?:\/\//i.test(fileUrl) || fileUrl.startsWith('data:')) {
      return fileUrl;
    }

    const normalized = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
    return `${environment.apiUrl}${normalized}`;
  }

  /**
   * Carga las imágenes del chat activo para mostrar en la sección Media.
   */
  loadChatMedia(): void {
    if (!this.activeChat) {
      this.chatMediaImages = [];
      return;
    }

    this.isLoadingMedia = true;
    const currentUserId = this.currentUser?.sub;
    
    this.dashboardDataService.fetchMessages(this.activeChat.contactId, currentUserId, 200).subscribe({
      next: (response) => {
        this.chatMediaImages = response.messages
          .filter(msg => msg.fileType === 'image' && msg.fileUrl)
          .reverse();
        this.isLoadingMedia = false;
      },
      error: (error) => {
        console.error('Error loading chat media:', error);
        this.chatMediaImages = [];
        this.isLoadingMedia = false;
      }
    });
  }

  /**
   * Abre una imagen en un modal o vista ampliada.
   */
  openImageModal(imageUrl: string): void {
    window.open(imageUrl, '_blank');
  }

  startVideoCall(): void {
    if (!this.activeChat) return;
    this.showVideoCall = true;
    // El componente VideoCallComponent iniciará la llamada automáticamente
    setTimeout(() => {
      const videoCallComponent = document.querySelector('app-video-call');
      if (videoCallComponent) {
        // El componente manejará la lógica internamente
      }
    }, 100);
  }

  closeVideoCall(): void {
    this.showVideoCall = false;
    this.videoCallService.cleanup();
  }
}
