import { reactive } from "vue";
import { onSocketEvent, onSocketConnected } from "./websocket";

// Configuration STUN/TURN (basique pour commencer)
const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// State réactif pour gérer les connexions WebRTC
export const webrtcState = reactive({
  localStream: null as MediaStream | null,
  remoteStreams: new Map<string, MediaStream>(),
  peerConnections: new Map<string, RTCPeerConnection>(),
  isAudioEnabled: true,
  isVideoEnabled: true,
  currentRoom: null as string | null,
  participants: [] as Array<{ userId: string; user: any }>,
});

// Types pour les événements
export interface RoomUser {
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface RoomEvent {
  roomId: string;
  participants: RoomUser[];
  participantCount: number;
}

// Vérifier si WebRTC est supporté
function isWebRTCSupported() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.RTCPeerConnection
  );
}

// Obtenir le stream local (caméra + micro)
export async function getLocalStream() {
  // Vérifier si WebRTC est supporté
  if (!isWebRTCSupported()) {
    throw new Error(
      "WebRTC n'est pas supporté dans ce navigateur. Utilisez un navigateur moderne avec HTTPS.",
    );
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    webrtcState.localStream = stream;
    return stream;
  } catch (error: any) {
    console.error("Erreur lors de l'accès aux médias:", error);

    // Messages d'erreur plus explicites
    if (error.name === "NotAllowedError") {
      throw new Error(
        "Accès refusé à la caméra/micro. Veuillez autoriser l'accès dans les paramètres du navigateur.",
      );
    }
    if (error.name === "NotFoundError") {
      throw new Error("Aucune caméra ou microphone trouvé.");
    }
    if (error.name === "NotSupportedError") {
      throw new Error("Votre navigateur ne supporte pas cette fonctionnalité.");
    }
    if (error.name === "NotReadableError") {
      throw new Error(
        "Caméra/microphone déjà utilisé par une autre application.",
      );
    }

    throw new Error(`Erreur d'accès aux médias : ${error.message}`);
  }
}

// Arrêter le stream local
export function stopLocalStream() {
  if (webrtcState.localStream) {
    webrtcState.localStream.getTracks().forEach((track) => track.stop());
    webrtcState.localStream = null;
  }
}

// Créer une connexion peer-to-peer
function createPeerConnection(userId: string) {
  const pc = new RTCPeerConnection(rtcConfig);

  // Ajouter le stream local si disponible
  if (webrtcState.localStream) {
    webrtcState.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, webrtcState.localStream!);
    });
  }

  // Gérer le stream distant
  pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    webrtcState.remoteStreams.set(userId, remoteStream);
  };

  // Gérer les candidats ICE
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onSocketConnected((socket) => {
        socket.emit("room:ice-candidate", {
          targetUserId: userId,
          candidate: event.candidate,
        });
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`Connexion avec ${userId}:`, pc.connectionState);
    if (
      pc.connectionState === "disconnected" ||
      pc.connectionState === "failed"
    ) {
      webrtcState.remoteStreams.delete(userId);
      webrtcState.peerConnections.delete(userId);
    }
  };

  webrtcState.peerConnections.set(userId, pc);
  return pc;
}

// Rejoindre une salle
export async function joinRoom(roomId: string, user: any) {
  try {
    // Vérifier d'abord si WebRTC est supporté
    if (!isWebRTCSupported()) {
      throw new Error(
        "WebRTC n'est pas supporté. Vérifiez que vous utilisez HTTPS et un navigateur moderne.",
      );
    }

    // Obtenir le stream local d'abord
    await getLocalStream();

    webrtcState.currentRoom = roomId;

    // Émettre l'événement de rejoindre la salle
    onSocketConnected((socket) => {
      socket.emit("room:join", { roomId, user });
    });

    return true;
  } catch (error) {
    console.error("Erreur lors de la connexion à la salle:", error);
    throw error;
  }
}

// Quitter une salle
export function leaveRoom() {
  // Arrêter toutes les connexions peer
  webrtcState.peerConnections.forEach((pc) => pc.close());
  webrtcState.peerConnections.clear();
  webrtcState.remoteStreams.clear();

  // Arrêter le stream local
  stopLocalStream();

  // Notifier le serveur
  onSocketConnected((socket) => {
    socket.emit("room:leave");
  });

  webrtcState.currentRoom = null;
  webrtcState.participants = [];
}

// Activer/désactiver l'audio
export function toggleAudio() {
  if (webrtcState.localStream) {
    const audioTrack = webrtcState.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      webrtcState.isAudioEnabled = audioTrack.enabled;
    }
  }
}

// Activer/désactiver la vidéo
export function toggleVideo() {
  if (webrtcState.localStream) {
    const videoTrack = webrtcState.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      webrtcState.isVideoEnabled = videoTrack.enabled;
    }
  }
}

// Gestion des événements WebSocket pour WebRTC
export function setupWebRTCListeners() {
  // Événement: quelqu'un a rejoint la salle
  onSocketEvent("room:joined", (data: RoomEvent) => {
    webrtcState.participants = data.participants;
    // Créer des offres pour tous les participants existants
    data.participants.forEach((participant) => {
      if (participant.userId !== webrtcState.currentRoom) {
        createOffer(participant.userId);
      }
    });
  });

  // Événement: un nouvel utilisateur a rejoint
  onSocketEvent("room:user-joined", (data: { userId: string; user: any }) => {
    webrtcState.participants.push(data);
  });

  // Événement: un utilisateur a quitté
  onSocketEvent("room:user-left", (data: { userId: string }) => {
    webrtcState.participants = webrtcState.participants.filter(
      (p) => p.userId !== data.userId,
    );
    webrtcState.remoteStreams.delete(data.userId);
    const pc = webrtcState.peerConnections.get(data.userId);
    if (pc) {
      pc.close();
      webrtcState.peerConnections.delete(data.userId);
    }
  });

  // Événement: réception d'une offre WebRTC
  onSocketEvent(
    "room:offer",
    async (data: {
      fromUserId: string;
      offer: RTCSessionDescriptionInit;
      user: any;
    }) => {
      const pc = createPeerConnection(data.fromUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      onSocketConnected((socket) => {
        socket.emit("room:answer", {
          targetUserId: data.fromUserId,
          answer: answer,
        });
      });
    },
  );

  // Événement: réception d'une réponse WebRTC
  onSocketEvent(
    "room:answer",
    async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = webrtcState.peerConnections.get(data.fromUserId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    },
  );

  // Événement: réception d'un candidat ICE
  onSocketEvent(
    "room:ice-candidate",
    async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const pc = webrtcState.peerConnections.get(data.fromUserId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    },
  );
}

// Créer une offre WebRTC
async function createOffer(userId: string) {
  const pc = createPeerConnection(userId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  onSocketConnected((socket) => {
    socket.emit("room:offer", {
      targetUserId: userId,
      offer: offer,
    });
  });
}

// Initialiser WebRTC au chargement
setupWebRTCListeners();
