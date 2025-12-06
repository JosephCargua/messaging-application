import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, ElementRef, Input, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { VideoCallService, CallEvent, WebRTCOfferEvent, WebRTCAnswerEvent, WebRTCIceCandidateEvent } from '../../../core/services/video-call.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-video-call',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './video-call.component.html',
  styleUrls: ['./video-call.component.scss']
})
export class VideoCallComponent implements OnInit, OnDestroy, OnChanges {
  @Input() contactId!: number;
  @Input() contactName: string = 'Usuario';
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;

  isCallActive = false;
  isIncomingCall = false;
  isCalling = false;
  callerId: number | null = null;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  isVideoEnabled = false;
  hasVideoTrack = false;
  displayName: string = 'Usuario';

  private subscriptions = new Subscription();

  constructor(
    private videoCallService: VideoCallService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.displayName = this.contactName;
    this.setupEventListeners();
    
    this.checkForIncomingCall();
    
    setTimeout(() => {
      if (this.contactId && !this.isIncomingCall && !this.isCallActive) {
        this.startCall();
      }
    }, 500);
  }

  private checkForIncomingCall(): void {
    const pendingCall = this.videoCallService.getPendingIncomingCall();
    const currentCall = this.videoCallService.getCurrentCall();
    
    if (pendingCall && !currentCall) {
      console.log('Llamada entrante pendiente detectada al inicializar:', pendingCall);
      this.isIncomingCall = true;
      this.isCalling = false;
      this.callerId = pendingCall.from;
      
      if (this.contactId && this.contactId === pendingCall.from) {
        this.displayName = this.contactName;
      } else if (!this.contactId || this.contactId === 0) {
        this.contactId = pendingCall.from;
      }
      
      this.cdr.detectChanges();
    } else if (!currentCall && this.contactId && this.contactId > 0) {
      const incomingCall = this.videoCallService.getPendingIncomingCall();
      if (incomingCall && incomingCall.from === this.contactId) {
        console.log('Llamada entrante detectada por contactId:', this.contactId);
        this.isIncomingCall = true;
        this.isCalling = false;
        this.callerId = this.contactId;
        this.cdr.detectChanges();
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['contactName'] && changes['contactName'].currentValue) {
      this.displayName = changes['contactName'].currentValue;
      this.cdr.detectChanges();
    }
    if (changes['contactId'] && changes['contactId'].currentValue) {
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.endCall();
  }

  private setupEventListeners(): void {
    // Llamada entrante
    this.subscriptions.add(
      this.videoCallService.onCallIncoming().subscribe((event: CallEvent) => {
        console.log('Llamada entrante detectada en componente:', event);
        console.log('contactId actual:', this.contactId, 'callerId:', event.from);
        
        this.isIncomingCall = true;
        this.isCalling = false;
        this.callerId = event.from;
        
        if (this.contactId && this.contactId === event.from) {
          this.displayName = this.contactName;
        } else if (!this.contactId || this.contactId === 0) {
          this.contactId = event.from;
        }
        
        console.log('Estado después de llamada entrante - isIncomingCall:', this.isIncomingCall, 'isCalling:', this.isCalling, 'isCallActive:', this.isCallActive);
        this.cdr.detectChanges();
      })
    );

    // Llamada aceptada
    this.subscriptions.add(
      this.videoCallService.onCallAccepted().subscribe(async (event: CallEvent) => {
        this.isCalling = false;
        this.isCallActive = true;
        await this.setupVideoStreams();
      })
    );

    // Llamada rechazada
    this.subscriptions.add(
      this.videoCallService.onCallRejected().subscribe(() => {
        console.log('Llamada rechazada, limpiando y recargando...');
        this.isCalling = false;
        this.isIncomingCall = false;
        this.isCallActive = false;
        this.cleanup();
        this.videoCallService.clearPendingIncomingCall();
        setTimeout(() => {
          window.location.reload();
        }, 500);
      })
    );

    // Llamada finalizada
    this.subscriptions.add(
      this.videoCallService.onCallEnded().subscribe(() => {
        console.log('Llamada finalizada, limpiando y recargando...');
        this.endCall();
        this.videoCallService.clearPendingIncomingCall();
        setTimeout(() => {
          window.location.reload();
        }, 500);
      })
    );

    // WebRTC Offer
    this.subscriptions.add(
      this.videoCallService.onWebRTCOffer().subscribe(async (event: WebRTCOfferEvent) => {
        if (event.from === this.callerId) {
          await this.videoCallService.handleOffer(event.offer, event.from);
        }
      })
    );

    // WebRTC Answer
    this.subscriptions.add(
      this.videoCallService.onWebRTCAnswer().subscribe(async (event: WebRTCAnswerEvent) => {
        await this.videoCallService.handleAnswer(event.answer);
      })
    );

    // WebRTC ICE Candidate
    this.subscriptions.add(
      this.videoCallService.onWebRTCIceCandidate().subscribe(async (event: WebRTCIceCandidateEvent) => {
        await this.videoCallService.handleIceCandidate(event.candidate);
      })
    );
  }

  async startCall(): Promise<void> {
    try {
      this.isCalling = true;
      await this.videoCallService.initiateCall(this.contactId);
      await this.setupVideoStreams();
      this.updateVideoStatus();
    } catch (error) {
      console.error('Error iniciando llamada:', error);
      this.isCalling = false;
    }
  }

  async acceptCall(): Promise<void> {
    console.log('Botón aceptar llamada presionado, callerId:', this.callerId);
    if (!this.callerId) {
      console.error('No hay callerId para aceptar la llamada');
      return;
    }

    try {
      console.log('Aceptando llamada de:', this.callerId);
      this.videoCallService.clearPendingIncomingCall();
      this.isIncomingCall = false;
      this.isCallActive = true;
      this.isCalling = false;
      this.cdr.detectChanges();
      
      await this.videoCallService.acceptCall(this.callerId);
      await this.setupVideoStreams();
      this.updateVideoStatus();
      
      console.log('Llamada aceptada correctamente');
    } catch (error) {
      console.error('Error aceptando llamada:', error);
      this.isIncomingCall = false;
      this.isCallActive = false;
      this.isCalling = false;
      this.cdr.detectChanges();
    }
  }

  rejectCall(): void {
    console.log('Botón rechazar llamada presionado, callerId:', this.callerId);
    this.videoCallService.clearPendingIncomingCall();
    if (this.callerId) {
      this.videoCallService.rejectCall(this.callerId);
    }
    this.isIncomingCall = false;
    this.isCalling = false;
    this.isCallActive = false;
    this.callerId = null;
    this.cleanup();
    this.cdr.detectChanges();
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  endCall(): void {
    console.log('Finalizando llamada...');
    this.videoCallService.endCall();
    this.isCallActive = false;
    this.isCalling = false;
    this.isIncomingCall = false;
    this.callerId = null;
    this.videoCallService.clearPendingIncomingCall();
    this.cleanup();
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  toggleMute(): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
    }
  }

  async toggleVideo(): Promise<void> {
    if (!this.localStream) return;

    const videoTracks = this.localStream.getVideoTracks();
    
    if (videoTracks.length > 0) {
      const isEnabled = videoTracks[0].enabled;
      videoTracks.forEach(track => {
        track.enabled = !isEnabled;
      });
      this.updateVideoStatus();
    } else {
      const success = await this.videoCallService.enableVideo();
      if (success) {
        this.localStream = this.videoCallService.getLocalStream();
        if (this.localStream && this.localVideoRef) {
          this.localVideoRef.nativeElement.srcObject = this.localStream;
        }
        this.updateVideoStatus();
        this.cdr.detectChanges();
      }
    }
  }

  private updateVideoStatus(): void {
    this.hasVideoTrack = this.videoCallService.hasVideoTrack();
    this.isVideoEnabled = this.videoCallService.isVideoEnabled();
    this.cdr.detectChanges();
  }

  private async setupVideoStreams(): Promise<void> {
    // Stream local
    this.localStream = this.videoCallService.getLocalStream();
    if (this.localStream && this.localVideoRef) {
      this.localVideoRef.nativeElement.srcObject = this.localStream;
    }

    // Stream remoto
    const peerConnection = this.videoCallService.getPeerConnection();
    if (peerConnection) {
      // Actualizar stream remoto cuando se reciban tracks
      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0] && this.remoteVideoRef) {
          this.remoteStream = event.streams[0];
          this.remoteVideoRef.nativeElement.srcObject = event.streams[0];
        }
      };

      // Verificar si ya hay tracks
      setTimeout(() => {
        const remoteStream = this.videoCallService.getRemoteStream();
        if (remoteStream && this.remoteVideoRef) {
          this.remoteStream = remoteStream;
          this.remoteVideoRef.nativeElement.srcObject = remoteStream;
        }
      }, 1000);
    }

    this.updateVideoStatus();
  }

  private cleanup(): void {
    if (this.localVideoRef) {
      this.localVideoRef.nativeElement.srcObject = null;
    }
    if (this.remoteVideoRef) {
      this.remoteVideoRef.nativeElement.srcObject = null;
    }
    this.localStream = null;
    this.remoteStream = null;
  }
}

