import { Component, OnInit } from '@angular/core';
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
import { AuthService } from '../../core/services/auth.service';

interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unreadCount?: number;
  isOnline: boolean;
  avatar: string;
}

interface Message {
  sender: string;
  text: string;
  time: string;
  avatar: string;
  isCurrentUser?: boolean;
  image?: string;
}

interface Member {
  name: string;
  avatar: string;
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
    MatSlideToggleModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  currentUser: any = null;
  activeTab: string = 'chat';
  activeChatId: string = '2';
  notificationOn: boolean = true;
  soundOn: boolean = false;
  saveToDownloadsOn: boolean = false;

  chats: Chat[] = [
    {
      id: '1',
      name: 'Leslie Coello',
      lastMessage: 'Tienes Netflix? quiero verme una serie jajaja',
      timestamp: '12:30',
      unreadCount: 8,
      isOnline: true,
      avatar: 'https://ui-avatars.com/api/?name=Leslie+Coello&background=random'
    },
    {
      id: '2',
      name: 'Shirley Amaguaña',
      lastMessage: 'Pasame el deber de fundamentos porfa',
      timestamp: '11:40',
      isOnline: false,
      avatar: 'https://ui-avatars.com/api/?name=Shirley+Amaguaña&background=000000&color=fff'
    },
    {
      id: '3',
      name: 'Ariel Masaquiza',
      lastMessage: 'Caes al futbol el sabado?',
      timestamp: '11:25',
      unreadCount: 4,
      isOnline: true,
      avatar: 'https://ui-avatars.com/api/?name=Ariel+Masaquiza&background=random'
    },
    {
      id: '4',
      name: 'Sebastian Ortiz',
      lastMessage: 'Quieres ir a un asado este fin de semana?',
      timestamp: '11:15',
      isOnline: true,
      avatar: 'https://ui-avatars.com/api/?name=Sebastian+Ortiz&background=random'
    },
     {
      id: '5',
      name: 'Los más estudiosos',
      lastMessage: 'jajaja uh no ya valimos carpeta',
      timestamp: '11:11',
      isOnline: true,
      avatar: 'https://ui-avatars.com/api/?name=Los+más+estudiosos&background=random'
    },
    
    
  ];

  messages: Message[] = [
    {
      sender: 'Leslie Coello',
      text: 'Como era de hacer el deber de sistemas operativos?',
      time: '11:03',
      avatar: 'https://ui-avatars.com/api/?name=Leslie+Coello&background=random',
      isCurrentUser: true
    },
    {
      sender: 'Shirley Amaguaña',
      text: 'No digan, habría deber? jajajajja',
      time: '11:05',
      avatar: 'https://ui-avatars.com/api/?name=Shirley+Amaguaña&background=000000&color=fff'
    },
    {
      sender: 'Ariel Masaquiza',
      text: 'Claro pues jajaj encima el jueves hay prueba',
      time: '11:10',
      avatar: 'https://ui-avatars.com/api/?name=Ariel+Masaquiza&background=random'
    },
    {
      sender: 'Sebastian Ortiz',
      text: 'jajaja uh no ya valimos carpeta',
      time: '11:11',
      avatar: 'https://ui-avatars.com/api/?name=Sebastian+Ortiz&background=random',
      image: 'https://media.cnn.com/api/v1/images/stellar/prod/cnne-212344-monkey-selfie.jpeg?c=16x9&q=h_833,w_1480,c_fill'
    }
  ];

  members: Member[] = [
    { name: 'Leslie Coello', avatar: 'https://ui-avatars.com/api/?name=Leslie+Coello&background=random' },
    { name: 'Shirley Amaguaña', avatar: 'https://ui-avatars.com/api/?name=Shirley+Amaguaña&background=000000&color=fff' },
    { name: 'Ariel Masaquiza', avatar: 'https://ui-avatars.com/api/?name=Ariel+Masaquiza&background=random' },
    { name: 'Sebastian Ortiz', avatar: 'https://ui-avatars.com/api/?name=Sebastian+Ortiz&background=random' }
  ];

  get activeChat(): Chat | undefined {
    return this.chats.find(chat => chat.id === this.activeChatId);
  }

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
    }
  }

  selectChat(chatId: string): void {
    this.activeChatId = chatId;
  }

  logout(): void {
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
