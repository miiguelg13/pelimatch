// Avisos en tiempo real a los dos miembros de una pareja (los envía realtime.ts por Socket.IO).
type Emitter = (coupleId: string, event: string, data: unknown) => void;
let emitter: Emitter = () => {};

export function setEmitter(e: Emitter): void {
  emitter = e;
}

export function emitToCouple(coupleId: unknown, event: string, data: unknown): void {
  if (coupleId) emitter(String(coupleId), event, data);
}

// Al emparejarse o dejar la pareja, los sockets abiertos del usuario cambian de sala.
type RoomSync = (userId: string, coupleId: string | null) => void;
let roomSync: RoomSync = () => {};

export function setRoomSync(fn: RoomSync): void {
  roomSync = fn;
}

export function syncUserRooms(userId: unknown, coupleId: unknown): void {
  roomSync(String(userId), coupleId ? String(coupleId) : null);
}
