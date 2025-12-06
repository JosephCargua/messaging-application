import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { WebSocketService } from './websocket.service';

export interface CallEvent {
  from: number;
  timestamp: string;
}

export interface WebRTCOfferEvent {
  from: number;
  offer: RTCSessionDescriptionInit;
  timestamp: string;
}

export interface WebRTCAnswerEvent {
  from: number;
  answer: RTCSessionDescriptionInit;
  timestamp: string;
}

export interface WebRTCIceCandidateEvent {
  from: number;
  candidate: RTCIceCandidateInit;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class VideoCallService {
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private currentCall: { userId: number; isCaller: boolean } | null = null;
  private pendingIncomingCall: CallEvent | null = null;

  // Subjects para eventos
  private callIncoming$ = new Subject<CallEvent>();
  private callAccepted$ = new Subject<CallEvent>();
  private callRejected$ = new Subject<CallEvent>();
  private callEnded$ = new Subject<CallEvent>();
  private webrtcOffer$ = new Subject<WebRTCOfferEvent>();
  private webrtcAnswer$ = new Subject<WebRTCAnswerEvent>();
  private webrtcIceCandidate$ = new Subject<WebRTCIceCandidateEvent>();

  constructor(private webSocketService: WebSocketService) {
    this.setupWebSocketListeners();
    this.ensureSocketConnection();
  }

  private ensureSocketConnection(): void {
    if (!this.webSocketService.getIsConnected()) {
      this.webSocketService.connect();
    }
  }

  private setupWebSocketListeners(): void {
    const socket = (this.webSocketService as any).socket;
    if (!socket) {
      setTimeout(() => this.setupWebSocketListeners(), 100);
      return;
    }

    if (!socket.connected) {
      socket.once('connect', () => {
        this.setupSocketEventListeners(socket);
      });
      setTimeout(() => this.setupWebSocketListeners(), 100);
      return;
    }

    this.setupSocketEventListeners(socket);
  }

  private setupSocketEventListeners(socket: any): void {
    socket.off('call:incoming');
    socket.off('call:accepted');
    socket.off('call:rejected');
    socket.off('call:ended');
    socket.off('webrtc:offer');
    socket.off('webrtc:answer');
    socket.off('webrtc:ice-candidate');

    socket.on('call:incoming', (data: CallEvent) => {
      console.log('Evento call:incoming recibido:', data);
      this.pendingIncomingCall = data;
      this.callIncoming$.next(data);
    });

    socket.on('call:accepted', (data: CallEvent) => {
      console.log('Evento call:accepted recibido:', data);
      this.callAccepted$.next(data);
    });

    socket.on('call:rejected', (data: CallEvent) => {
      console.log('Evento call:rejected recibido:', data);
      this.callRejected$.next(data);
    });

    socket.on('call:ended', (data: CallEvent) => {
      console.log('Evento call:ended recibido:', data);
      this.callEnded$.next(data);
    });

    socket.on('webrtc:offer', (data: WebRTCOfferEvent) => {
      console.log('Evento webrtc:offer recibido:', data);
      this.webrtcOffer$.next(data);
    });

    socket.on('webrtc:answer', (data: WebRTCAnswerEvent) => {
      console.log('Evento webrtc:answer recibido:', data);
      this.webrtcAnswer$.next(data);
    });

    socket.on('webrtc:ice-candidate', (data: WebRTCIceCandidateEvent) => {
      this.webrtcIceCandidate$.next(data);
    });
  }

  // Observables
  onCallIncoming(): Observable<CallEvent> {
    return this.callIncoming$.asObservable();
  }

  onCallAccepted(): Observable<CallEvent> {
    return this.callAccepted$.asObservable();
  }

  onCallRejected(): Observable<CallEvent> {
    return this.callRejected$.asObservable();
  }

  onCallEnded(): Observable<CallEvent> {
    return this.callEnded$.asObservable();
  }

  onWebRTCOffer(): Observable<WebRTCOfferEvent> {
    return this.webrtcOffer$.asObservable();
  }

  onWebRTCAnswer(): Observable<WebRTCAnswerEvent> {
    return this.webrtcAnswer$.asObservable();
  }

  onWebRTCIceCandidate(): Observable<WebRTCIceCandidateEvent> {
    return this.webrtcIceCandidate$.asObservable();
  }

  // Iniciar llamada
  async initiateCall(receiverId: number): Promise<void> {
    try {
      this.ensureSocketConnection();
      
      await this.getUserMedia();
      this.currentCall = { userId: receiverId, isCaller: true };
      
      const socket = (this.webSocketService as any).socket;
      if (!socket || !socket.connected) {
        console.error('Socket no está conectado. Intentando conectar...');
        this.webSocketService.connect();
        await new Promise((resolve) => {
          if (socket) {
            socket.once('connect', resolve);
            setTimeout(resolve, 2000);
          } else {
            resolve(null);
          }
        });
      }

      if (socket && socket.connected) {
        console.log(`Enviando call:initiate a usuario ${receiverId}`);
        socket.emit('call:initiate', { receiverId });
      } else {
        console.error('No se pudo conectar al socket para enviar la llamada');
        throw new Error('No se pudo conectar al servidor');
      }

      await this.createPeerConnection(receiverId, true);
    } catch (error) {
      console.error('Error iniciando llamada:', error);
      throw error;
    }
  }

  // Aceptar llamada
  async acceptCall(callerId: number): Promise<void> {
    try {
      this.ensureSocketConnection();
      
      await this.getUserMedia();
      this.currentCall = { userId: callerId, isCaller: false };
      
      const socket = (this.webSocketService as any).socket;
      if (!socket || !socket.connected) {
        console.error('Socket no está conectado. Intentando conectar...');
        this.webSocketService.connect();
        await new Promise((resolve) => {
          if (socket) {
            socket.once('connect', resolve);
            setTimeout(resolve, 2000);
          } else {
            resolve(null);
          }
        });
      }

      if (socket && socket.connected) {
        console.log(`Enviando call:accept a usuario ${callerId}`);
        socket.emit('call:accept', { callerId });
      } else {
        console.error('No se pudo conectar al socket para aceptar la llamada');
        throw new Error('No se pudo conectar al servidor');
      }

      await this.createPeerConnection(callerId, false);
    } catch (error) {
      console.error('Error aceptando llamada:', error);
      throw error;
    }
  }

  // Rechazar llamada
  rejectCall(callerId: number): void {
    const socket = (this.webSocketService as any).socket;
    if (socket) {
      socket.emit('call:reject', { callerId });
    }
    this.currentCall = null;
  }

  // Finalizar llamada
  endCall(): void {
    if (this.currentCall) {
      const socket = (this.webSocketService as any).socket;
      if (socket) {
        socket.emit('call:end', { receiverId: this.currentCall.userId });
      }
    }
    this.cleanup();
  }

  // Obtener stream de medios
  async getUserMedia(): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      return this.localStream;
    } catch (videoError) {
      console.warn('No se pudo obtener video, intentando solo audio:', videoError);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
        return this.localStream;
      } catch (audioError) {
        console.warn('No se pudo obtener audio, intentando solo video:', audioError);
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
          return this.localStream;
        } catch (finalError) {
          console.warn('No se pudieron obtener medios, continuando sin cámara/micrófono:', finalError);
          this.localStream = new MediaStream();
          return this.localStream;
        }
      }
    }
  }

  // Crear conexión peer
  private async createPeerConnection(userId: number, isCaller: boolean): Promise<void> {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Agregar stream local
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        if (this.peerConnection) {
          this.peerConnection.addTrack(track, this.localStream!);
        }
      });
    }

    // Manejar ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = (this.webSocketService as any).socket;
        if (socket) {
          socket.emit('webrtc:ice-candidate', {
            receiverId: userId,
            candidate: event.candidate.toJSON()
          });
        }
      }
    };

    // Manejar stream remoto
    this.peerConnection.ontrack = (event) => {
      // El stream remoto se manejará en el componente
    };

    // Si es el llamador, crear oferta
    if (isCaller) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      const socket = (this.webSocketService as any).socket;
      if (socket) {
        socket.emit('webrtc:offer', {
          receiverId: userId,
          offer: offer
        });
      }
    }
  }

  // Manejar oferta recibida
  async handleOffer(offer: RTCSessionDescriptionInit, callerId: number): Promise<void> {
    if (!this.peerConnection) {
      await this.createPeerConnection(callerId, false);
    }

    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      const socket = (this.webSocketService as any).socket;
      if (socket) {
        socket.emit('webrtc:answer', {
          receiverId: callerId,
          answer: answer
        });
      }
    }
  }

  // Manejar respuesta recibida
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  // Manejar ICE candidate recibido
  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error agregando ICE candidate:', error);
      }
    }
  }

  // Obtener stream local
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  // Activar cámara si no está activa
  async enableVideo(): Promise<boolean> {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
      
      const videoTrack = videoStream.getVideoTracks()[0];
      if (videoTrack && this.localStream) {
        const existingVideoTrack = this.localStream.getVideoTracks()[0];
        if (existingVideoTrack) {
          existingVideoTrack.stop();
          this.localStream.removeTrack(existingVideoTrack);
        }
        this.localStream.addTrack(videoTrack);
        
        if (this.peerConnection) {
          const sender = this.peerConnection.getSenders().find(s => 
            s.track && s.track.kind === 'video'
          );
          if (sender) {
            await sender.replaceTrack(videoTrack);
          } else {
            this.peerConnection.addTrack(videoTrack, this.localStream);
          }
        }
        
        videoStream.getTracks().forEach(track => {
          if (track !== videoTrack) {
            track.stop();
          }
        });
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error activando cámara:', error);
      return false;
    }
  }

  // Verificar si hay cámara disponible
  hasVideoTrack(): boolean {
    return this.localStream ? this.localStream.getVideoTracks().length > 0 : false;
  }

  // Verificar si la cámara está activa
  isVideoEnabled(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    return videoTrack ? videoTrack.enabled : false;
  }

  // Obtener peer connection
  getPeerConnection(): RTCPeerConnection | null {
    return this.peerConnection;
  }

  // Obtener stream remoto
  getRemoteStream(): MediaStream | null {
    if (!this.peerConnection) return null;

    const remoteStream = new MediaStream();
    this.peerConnection.getReceivers().forEach(receiver => {
      if (receiver.track) {
        remoteStream.addTrack(receiver.track);
      }
    });

    return remoteStream;
  }

  // Limpiar recursos
  cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.currentCall = null;
    this.pendingIncomingCall = null;
  }

  // Verificar si hay una llamada activa
  isInCall(): boolean {
    return this.currentCall !== null;
  }

  // Obtener información de la llamada actual
  getCurrentCall(): { userId: number; isCaller: boolean } | null {
    return this.currentCall;
  }

  // Verificar si hay una llamada entrante pendiente
  getPendingIncomingCall(): CallEvent | null {
    return this.pendingIncomingCall;
  }

  // Limpiar llamada entrante pendiente
  clearPendingIncomingCall(): void {
    this.pendingIncomingCall = null;
  }
}


