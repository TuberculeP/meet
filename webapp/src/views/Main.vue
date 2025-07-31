<template>
  <div class="main-container">
    <header class="header">
      <h1>Application de Vidéoconférence</h1>
      <p>Choisissez une salle de réunion pour commencer</p>
    </header>

    <div class="rooms-section">
      <div class="rooms-header">
        <h2>Salles de réunion</h2>
        <button @click="loadRooms" class="refresh-btn">🔄 Actualiser</button>
      </div>

      <div v-if="loading" class="loading">Chargement des salles...</div>

      <div v-else-if="error" class="error">
        {{ error }}
      </div>

      <div v-else class="rooms-grid">
        <div
          v-for="room in rooms"
          :key="room.id"
          class="room-card"
          @click="joinRoom(room)"
        >
          <div class="room-header">
            <h3>{{ room.name }}</h3>
            <span class="room-participants">
              👥 {{ getRoomParticipantCount(room.id) }}/{{
                room.maxParticipants
              }}
            </span>
          </div>
          <p v-if="room.description" class="room-description">
            {{ room.description }}
          </p>
          <div class="room-footer">
            <button
              class="join-btn"
              :disabled="
                getRoomParticipantCount(room.id) >= room.maxParticipants
              "
            >
              Rejoindre
            </button>
          </div>
        </div>
      </div>

      <div class="quick-rooms">
        <h3>Accès rapide</h3>
        <div class="quick-rooms-grid">
          <button @click="joinQuickRoom('1')" class="quick-room-btn">
            📞 Salle 1
          </button>
          <button @click="joinQuickRoom('2')" class="quick-room-btn">
            📞 Salle 2
          </button>
          <button @click="joinQuickRoom('3')" class="quick-room-btn">
            📞 Salle 3
          </button>
          <button @click="joinQuickRoom('4')" class="quick-room-btn">
            📞 Salle 4
          </button>
        </div>
      </div>
    </div>

    <!-- Modal pour créer une nouvelle salle -->
    <div v-if="showCreateModal" class="modal-overlay" @click="closeCreateModal">
      <div class="modal" @click.stop>
        <h3>Créer une nouvelle salle</h3>
        <form @submit.prevent="createRoom">
          <div class="form-group">
            <label for="roomName">Nom de la salle *</label>
            <input
              id="roomName"
              v-model="newRoom.name"
              type="text"
              required
              placeholder="Ex: Réunion équipe"
            />
          </div>
          <div class="form-group">
            <label for="roomDescription">Description</label>
            <textarea
              id="roomDescription"
              v-model="newRoom.description"
              placeholder="Description optionnelle"
            ></textarea>
          </div>
          <div class="form-group">
            <label for="maxParticipants">Nombre max de participants</label>
            <input
              id="maxParticipants"
              v-model.number="newRoom.maxParticipants"
              type="number"
              min="2"
              max="20"
            />
          </div>
          <div class="form-actions">
            <button type="button" @click="closeCreateModal" class="cancel-btn">
              Annuler
            </button>
            <button type="submit" class="create-btn" :disabled="!newRoom.name">
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="actions">
      <button @click="showCreateModal = true" class="create-room-btn">
        ➕ Créer une salle
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/authStore";
import apiClient from "../lib/utils/apiClient";

// Types
interface Room {
  id: number;
  name: string;
  description?: string;
  maxParticipants: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Store et router
const authStore = useAuthStore();
const router = useRouter();

// État réactif
const rooms = ref<Room[]>([]);
const loading = ref(false);
const error = ref("");
const showCreateModal = ref(false);
const participantCounts = reactive<Record<string, number>>({});

const newRoom = reactive({
  name: "",
  description: "",
  maxParticipants: 10,
});

// Charger les salles depuis l'API
async function loadRooms() {
  loading.value = true;
  error.value = "";

  const result = await apiClient.get<Room[]>("/rooms");
  if (result.error) {
    error.value = result.error;
  } else {
    rooms.value = result.data || [];
  }
  loading.value = false;
}

// Obtenir le nombre de participants dans une salle
function getRoomParticipantCount(roomId: number): number {
  return participantCounts[roomId.toString()] || 0;
}

// Rejoindre une salle existante
async function joinRoom(room: Room) {
  if (!authStore.user) {
    router.push("/auth/login");
    return;
  }

  if (getRoomParticipantCount(room.id) >= room.maxParticipants) {
    alert("Cette salle est pleine");
    return;
  }

  // Rediriger vers la vue de salle
  router.push(`/room/${room.id}`);
}

// Rejoindre une salle rapide (crée la salle si elle n'existe pas)
async function joinQuickRoom(roomNumber: string) {
  if (!authStore.user) {
    router.push("/auth/login");
    return;
  }

  const roomName = `Salle ${roomNumber}`;

  // Vérifier si la salle existe déjà
  let existingRoom = rooms.value.find((room) => room.name === roomName);

  if (!existingRoom) {
    // Créer la salle
    const result = await apiClient.post<Room>("/rooms", {
      name: roomName,
      description: `Salle d'accès rapide ${roomNumber}`,
      maxParticipants: 10,
    });

    if (result.error || !result.data) {
      error.value = result.error;
      return;
    }

    existingRoom = result.data;
    rooms.value.push(existingRoom);
  }

  // Rejoindre la salle
  router.push(`/room/${existingRoom.id}`);
}

// Créer une nouvelle salle
async function createRoom() {
  const result = await apiClient.post<Room>("/rooms", newRoom);

  if (result.error || !result.data) {
    error.value = result.error;
    return;
  }

  const createdRoom = result.data;
  rooms.value.push(createdRoom);
  closeCreateModal();

  // Rejoindre immédiatement la nouvelle salle
  router.push(`/room/${createdRoom.id}`);
}

// Fermer le modal de création
function closeCreateModal() {
  showCreateModal.value = false;
  newRoom.name = "";
  newRoom.description = "";
  newRoom.maxParticipants = 10;
}

// Charger les salles au montage du composant
onMounted(() => {
  loadRooms();
});
</script>

<style scoped>
.main-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 3rem;
}

.header h1 {
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.header p {
  color: #7f8c8d;
  font-size: 1.1rem;
}

.rooms-section {
  margin-bottom: 3rem;
}

.rooms-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.refresh-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.refresh-btn:hover {
  background: #2980b9;
}

.loading,
.error {
  text-align: center;
  padding: 2rem;
  font-size: 1.1rem;
}

.error {
  color: #e74c3c;
}

.rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.room-card {
  background: white;
  border: 2px solid #ecf0f1;
  border-radius: 10px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.room-card:hover {
  border-color: #3498db;
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.room-header h3 {
  color: #2c3e50;
  margin: 0;
}

.room-participants {
  background: #ecf0f1;
  padding: 0.25rem 0.5rem;
  border-radius: 15px;
  font-size: 0.9rem;
  color: #7f8c8d;
}

.room-description {
  color: #7f8c8d;
  margin-bottom: 1rem;
  font-size: 0.95rem;
}

.room-footer {
  display: flex;
  justify-content: flex-end;
}

.join-btn {
  background: #27ae60;
  color: white;
  border: none;
  padding: 0.5rem 1.5rem;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.join-btn:hover:not(:disabled) {
  background: #219a52;
}

.join-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.quick-rooms {
  background: #f8f9fa;
  padding: 2rem;
  border-radius: 10px;
  margin-bottom: 2rem;
}

.quick-rooms h3 {
  color: #2c3e50;
  margin-bottom: 1rem;
  text-align: center;
}

.quick-rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.quick-room-btn {
  background: #9b59b6;
  color: white;
  border: none;
  padding: 1rem;
  border-radius: 10px;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all 0.3s;
}

.quick-room-btn:hover {
  background: #8e44ad;
  transform: translateY(-2px);
}

.actions {
  text-align: center;
}

.create-room-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 1rem 2rem;
  border-radius: 10px;
  cursor: pointer;
  font-size: 1.1rem;
  transition: background-color 0.3s;
}

.create-room-btn:hover {
  background: #c0392b;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 2rem;
  border-radius: 10px;
  width: 90%;
  max-width: 500px;
}

.modal h3 {
  color: #2c3e50;
  margin-bottom: 1.5rem;
  text-align: center;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #2c3e50;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #ecf0f1;
  border-radius: 5px;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #3498db;
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.cancel-btn,
.create-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.3s;
}

.cancel-btn {
  background: #95a5a6;
  color: white;
}

.cancel-btn:hover {
  background: #7f8c8d;
}

.create-btn {
  background: #27ae60;
  color: white;
}

.create-btn:hover:not(:disabled) {
  background: #219a52;
}

.create-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}
</style>
