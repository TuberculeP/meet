import type { Server, Socket } from "socket.io";
import testEvents from "./test.event";
import roomEvents from "./room.event";

export type SubEventFunction = (params: {
  event: string;
  ws?: Socket;
  data?: any;
}) => void;

export type EventGroup = Record<string, SubEventFunction>;

const eventGroupList: Record<string, EventGroup> = {
  // Register your event groups here
  test: testEvents,
  room: roomEvents,
};

export function registerWebsocketListeners(wss: Server) {
  wss.on("connection", (ws) => {
    for (const [prefix, events] of Object.entries(eventGroupList)) {
      for (const [event, handler] of Object.entries(events)) {
        if (event === "default") {
          ws.on(prefix, (data) => {
            handler({ event, data, ws });
          });
          continue;
        }
        ws.on(`${prefix}:${event}`, (data) => {
          handler({ event, data, ws });
        });
      }
    }

    // Gérer les déconnexions
    ws.on("disconnect", () => {
      // Appeler les gestionnaires de déconnexion de chaque groupe d'événements
      for (const [, events] of Object.entries(eventGroupList)) {
        if (events.disconnect) {
          events.disconnect({ event: "disconnect", ws });
        }
      }
    });
  });
}
