import type { EventGroup } from "./event_handler";

// Structure pour gérer les utilisateurs connectés dans les salles
const roomParticipants = new Map<string, Set<string>>(); // roomId -> Set of socketIds
const userRooms = new Map<string, string>(); // socketId -> roomId
const socketUsers = new Map<string, any>(); // socketId -> user info

const roomEvents: EventGroup = {
  // Rejoindre une salle
  join: ({ data, ws }) => {
    if (!ws) return;
    const { roomId, user } = data;

    if (!roomId || !user) {
      ws.emit("room:error", { message: "RoomId et user requis" });
      return;
    }

    // Quitter la salle précédente si l'utilisateur en était dans une
    if (userRooms.has(ws.id)) {
      const previousRoom = userRooms.get(ws.id);
      if (previousRoom && roomParticipants.has(previousRoom)) {
        roomParticipants.get(previousRoom)?.delete(ws.id);
        ws.leave(previousRoom);
        ws.to(previousRoom).emit("room:user-left", {
          userId: ws.id,
          user: socketUsers.get(ws.id),
          participantCount: roomParticipants.get(previousRoom)?.size || 0,
        });
      }
    }

    // Rejoindre la nouvelle salle
    ws.join(roomId);
    userRooms.set(ws.id, roomId);
    socketUsers.set(ws.id, user);

    if (!roomParticipants.has(roomId)) {
      roomParticipants.set(roomId, new Set());
    }
    roomParticipants.get(roomId)?.add(ws.id);

    // Notifier les autres participants
    ws.to(roomId).emit("room:user-joined", {
      userId: ws.id,
      user,
      participantCount: roomParticipants.get(roomId)?.size || 0,
    });

    // Envoyer la liste des participants existants au nouvel utilisateur
    const existingParticipants = Array.from(roomParticipants.get(roomId) || [])
      .filter((socketId) => socketId !== ws.id)
      .map((socketId) => ({
        userId: socketId,
        user: socketUsers.get(socketId),
      }));

    ws.emit("room:joined", {
      roomId,
      participants: existingParticipants,
      participantCount: roomParticipants.get(roomId)?.size || 0,
    });
  },

  // Quitter une salle
  leave: ({ ws }) => {
    if (!ws) return;

    const roomId = userRooms.get(ws.id);
    if (roomId && roomParticipants.has(roomId)) {
      roomParticipants.get(roomId)?.delete(ws.id);
      ws.leave(roomId);
      ws.to(roomId).emit("room:user-left", {
        userId: ws.id,
        user: socketUsers.get(ws.id),
        participantCount: roomParticipants.get(roomId)?.size || 0,
      });
    }
    userRooms.delete(ws.id);
    socketUsers.delete(ws.id);
  },

  // Événements de signalisation WebRTC
  offer: ({ data, ws }) => {
    if (!ws) return;

    const { targetUserId, offer } = data;
    ws.to(targetUserId).emit("room:offer", {
      fromUserId: ws.id,
      offer,
      user: socketUsers.get(ws.id),
    });
  },

  answer: ({ data, ws }) => {
    if (!ws) return;

    const { targetUserId, answer } = data;
    ws.to(targetUserId).emit("room:answer", {
      fromUserId: ws.id,
      answer,
    });
  },

  "ice-candidate": ({ data, ws }) => {
    if (!ws) return;

    const { targetUserId, candidate } = data;
    ws.to(targetUserId).emit("room:ice-candidate", {
      fromUserId: ws.id,
      candidate,
    });
  },

  // Gestion de la déconnexion
  disconnect: ({ ws }) => {
    if (!ws) return;

    const roomId = userRooms.get(ws.id);
    if (roomId && roomParticipants.has(roomId)) {
      roomParticipants.get(roomId)?.delete(ws.id);
      ws.to(roomId).emit("room:user-left", {
        userId: ws.id,
        user: socketUsers.get(ws.id),
        participantCount: roomParticipants.get(roomId)?.size || 0,
      });
    }
    userRooms.delete(ws.id);
    socketUsers.delete(ws.id);
  },
};

export default roomEvents;
