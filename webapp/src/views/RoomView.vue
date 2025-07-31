<template>
  <div class="room-container">
    <!-- Header de la salle -->
    <div class="room-header">
      <div class="room-info">
        <h1>{{ room?.name || `Salle ${roomId}` }}</h1>
        <p v-if="room?.description">{{ room.description }}</p>
        <div class="participants-count">
          👥 {{ webrtcState.participants.length + 1 }} participant(s)
        </div>
      </div>
      <div class="room-controls">
        <button
          @click="toggleAudio"
          class="control-btn"
          :class="{ active: webrtcState.isAudioEnabled }"
        >
          {{ webrtcState.isAudioEnabled ? "🎤" : "🚫🎤" }}
        </button>
        <button
          @click="toggleVideo"
          class="control-btn"
          :class="{ active: webrtcState.isVideoEnabled }"
        >
          {{ webrtcState.isVideoEnabled ? "📹" : "🚫📹" }}
        </button>
        <button @click="leaveRoom" class="leave-btn">🚪 Quitter</button>
      </div>
    </div>

    <!-- Zone vidéo principale -->
    <div class="video-container">
      <!-- Vidéo locale -->
      <div class="video-wrapper local-video">
        <video
          ref="localVideoRef"
          autoplay
          muted
          playsinline
          class="video-element"
        ></video>
        <div class="video-label">Vous</div>
        <div class="video-controls">
          <span v-if="!webrtcState.isAudioEnabled" class="muted-indicator"
            >🚫🎤</span
          >
          <span v-if="!webrtcState.isVideoEnabled" class="video-off-indicator"
            >🚫📹</span
          >
        </div>
      </div>

      <!-- Vidéos des participants distants -->
      <div
        v-for="participant in webrtcState.participants"
        :key="participant.userId"
        class="video-wrapper remote-video"
      >
        <video
          :ref="
            (el) =>
              setRemoteVideoRef(participant.userId, el as HTMLVideoElement)
          "
          autoplay
          playsinline
          class="video-element"
        ></video>
        <div class="video-label">
          {{ participant.user?.firstName }} {{ participant.user?.lastName }}
        </div>
      </div>

      <!-- Message si pas de participants -->
      <div v-if="webrtcState.participants.length === 0" class="no-participants">
        <h3>🕐 En attente d'autres participants...</h3>
        <p>Partagez le lien de cette salle pour inviter d'autres personnes :</p>
        <div class="share-link">
          <input :value="shareLink" readonly class="link-input" />
          <button @click="copyShareLink" class="copy-btn">📋 Copier</button>
        </div>
      </div>
    </div>

    <!-- Zone de chat (pour plus tard) -->
    <div class="chat-panel" v-if="showChat">
      <div class="chat-header">
        <h3>💬 Chat</h3>
        <button @click="showChat = false" class="close-chat">✕</button>
      </div>
      <div class="chat-messages">
        <!-- Messages à implémenter plus tard -->
      </div>
      <div class="chat-input">
        <input
          type="text"
          placeholder="Tapez votre message..."
          class="message-input"
        />
        <button class="send-btn">Envoyer</button>
      </div>
    </div>

    <!-- Bouton pour ouvrir le chat -->
    <button v-if="!showChat" @click="showChat = true" class="chat-toggle">
      💬 Chat
    </button>

    <!-- États de chargement et d'erreur -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Connexion à la salle...</p>
      <small>Demande d'accès à votre caméra et microphone...</small>
    </div>

    <div v-if="error" class="error-overlay">
      <div class="error-message">
        <h3>❌ Erreur</h3>
        <p>{{ error }}</p>

        <!-- Messages d'aide spécifiques -->
        <div v-if="error.includes('HTTPS')" class="help-message">
          <h4>💡 Solution :</h4>
          <p>
            Les navigateurs exigent HTTPS pour utiliser la caméra et le
            microphone.
          </p>
          <p>
            Utilisez <code>https://localhost:3000</code> ou déployez sur un
            serveur HTTPS.
          </p>
        </div>

        <div v-if="error.includes('refusé')" class="help-message">
          <h4>💡 Solution :</h4>
          <p>1. Cliquez sur l'icône 🔒 ou 📹 dans la barre d'adresse</p>
          <p>2. Autorisez l'accès à la caméra et au microphone</p>
          <p>3. Rechargez la page</p>
        </div>

        <div class="error-actions">
          <button @click="retryConnection" class="retry-btn">
            🔄 Réessayer
          </button>
          <button @click="goHome" class="home-btn">
            🏠 Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/authStore";
import apiClient from "../lib/utils/apiClient";
import {
  webrtcState,
  joinRoom,
  leaveRoom as leaveWebRTCRoom,
  toggleAudio,
  toggleVideo,
} from "../lib/utils/webrtc";

// Types
interface Room {
  id: number;
  name: string;
  description?: string;
  maxParticipants: number;
  isActive: boolean;
}

// Store et navigation
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// État du composant
const loading = ref(true);
const error = ref("");
const room = ref<Room | null>(null);
const showChat = ref(false);
const roomId = route.params.id as string;
const shareLink = ref(window.location.href);

// Références pour les éléments vidéo
const localVideoRef = ref<HTMLVideoElement>();
const remoteVideoRefs = new Map<string, HTMLVideoElement>();

// Configurer une référence vidéo distante
function setRemoteVideoRef(userId: string, videoEl: HTMLVideoElement | null) {
  if (videoEl) {
    remoteVideoRefs.set(userId, videoEl);
    // Attacher le stream si disponible
    const stream = webrtcState.remoteStreams.get(userId);
    if (stream) {
      videoEl.srcObject = stream;
    }
  }
}

// Charger les informations de la salle
async function loadRoomInfo() {
  const result = await apiClient.get<Room>(`/rooms/${roomId}`);
  if (result.error) {
    console.error("Erreur lors du chargement de la salle:", result.error);
    // Continuer même si on ne peut pas charger les infos de la salle
  } else {
    room.value = result.data;
  }
}

// Initialiser la connexion à la salle
async function initializeRoom() {
  if (!authStore.user) {
    router.push("/login");
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    // Charger les infos de la salle en parallèle
    await loadRoomInfo();

    // Rejoindre la salle WebRTC
    await joinRoom(roomId, authStore.user);

    // Attacher le stream local à la vidéo
    await nextTick();
    if (localVideoRef.value && webrtcState.localStream) {
      localVideoRef.value.srcObject = webrtcState.localStream;
    }

    loading.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Erreur de connexion";
    loading.value = false;
  }
}

// Quitter la salle
function leaveRoom() {
  leaveWebRTCRoom();
  router.push("/");
}

// Réessayer la connexion
function retryConnection() {
  error.value = "";
  initializeRoom();
}

// Retourner à l'accueil
function goHome() {
  router.push("/");
}

// Copier le lien de partage
async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value);
    // Optionnel: afficher une notification de succès
  } catch (err) {
    console.error("Erreur lors de la copie:", err);
  }
}

// Surveiller les changements dans les streams distants
function watchRemoteStreams() {
  // Observer les changements dans les streams distants pour les attacher aux vidéos
  setInterval(() => {
    webrtcState.remoteStreams.forEach((stream, userId) => {
      const videoEl = remoteVideoRefs.get(userId);
      if (videoEl && videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
    });
  }, 1000);
}

// Lifecycle hooks
onMounted(() => {
  initializeRoom();
  watchRemoteStreams();
});

onUnmounted(() => {
  leaveWebRTCRoom();
});
</script>

<style scoped>
.room-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  color: white;
  position: relative;
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: #2c3e50;
  border-bottom: 2px solid #34495e;
}

.room-info h1 {
  margin: 0;
  color: white;
  font-size: 1.5rem;
}

.room-info p {
  margin: 0.5rem 0 0 0;
  color: #bdc3c7;
  font-size: 0.9rem;
}

.participants-count {
  color: #3498db;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.room-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.control-btn {
  background: #34495e;
  border: none;
  padding: 0.75rem;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.25rem;
  transition: all 0.3s;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn.active {
  background: #27ae60;
}

.control-btn:not(.active) {
  background: #e74c3c;
}

.control-btn:hover {
  transform: scale(1.1);
}

.leave-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.3s;
}

.leave-btn:hover {
  background: #c0392b;
}

.video-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  padding: 1rem;
  overflow: auto;
}

.video-wrapper {
  position: relative;
  background: #2c3e50;
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 16/9;
  min-height: 200px;
}

.local-video {
  border: 3px solid #3498db;
}

.remote-video {
  border: 3px solid #95a5a6;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #2c3e50;
}

.video-label {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.5rem;
  border-radius: 5px;
  font-size: 0.9rem;
}

.video-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 0.5rem;
}

.muted-indicator,
.video-off-indicator {
  background: rgba(231, 76, 60, 0.9);
  padding: 0.25rem 0.5rem;
  border-radius: 15px;
  font-size: 0.8rem;
}

.no-participants {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem;
  color: #bdc3c7;
}

.no-participants h3 {
  color: white;
  margin-bottom: 1rem;
}

.share-link {
  display: flex;
  gap: 1rem;
  max-width: 500px;
  margin: 1rem auto;
}

.link-input {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid #34495e;
  border-radius: 5px;
  background: #2c3e50;
  color: white;
  font-size: 0.9rem;
}

.copy-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.75rem 1rem;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.copy-btn:hover {
  background: #2980b9;
}

.chat-panel {
  position: fixed;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  width: 300px;
  height: 400px;
  background: #2c3e50;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #34495e;
}

.chat-header h3 {
  margin: 0;
  color: white;
  font-size: 1rem;
}

.close-chat {
  background: none;
  border: none;
  color: #bdc3c7;
  cursor: pointer;
  font-size: 1.2rem;
}

.chat-messages {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
}

.chat-input {
  display: flex;
  padding: 1rem;
  border-top: 1px solid #34495e;
}

.message-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #34495e;
  border-radius: 5px;
  background: #34495e;
  color: white;
  margin-right: 0.5rem;
}

.send-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 5px;
  cursor: pointer;
}

.chat-toggle {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  background: #3498db;
  color: white;
  border: none;
  padding: 1rem;
  border-radius: 50px;
  cursor: pointer;
  font-size: 1rem;
  z-index: 100;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.loading-overlay,
.error-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid #34495e;
  border-top: 5px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.error-message {
  background: #2c3e50;
  padding: 2rem;
  border-radius: 10px;
  text-align: center;
  max-width: 400px;
}

.error-message h3 {
  color: #e74c3c;
  margin-bottom: 1rem;
}

.error-message p {
  color: #bdc3c7;
  margin-bottom: 1rem;
}

.help-message {
  background: #34495e;
  padding: 1rem;
  border-radius: 5px;
  margin: 1rem 0;
  text-align: left;
}

.help-message h4 {
  color: #f39c12;
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
}

.help-message p {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  color: #ecf0f1;
}

.help-message code {
  background: #2c3e50;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: monospace;
  color: #e74c3c;
}

.error-actions {
  margin-top: 1.5rem;
}

.retry-btn,
.home-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 5px;
  cursor: pointer;
  margin: 0 0.5rem;
  transition: background-color 0.3s;
}

.retry-btn:hover,
.home-btn:hover {
  background: #2980b9;
}

/* Responsive */
@media (max-width: 768px) {
  .room-header {
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .room-controls {
    justify-content: center;
  }

  .video-container {
    grid-template-columns: 1fr;
    padding: 0.5rem;
  }

  .chat-panel {
    width: calc(100% - 2rem);
    height: 300px;
    right: 1rem;
    bottom: 1rem;
    top: auto;
    transform: none;
  }

  .share-link {
    flex-direction: column;
  }
}
</style>
