// Tiempo real con Socket.IO: cada móvil se une a la sala de su pareja y recibe
// «match», el progreso del otro, sesiones nuevas y cambios de la pareja.
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { setEmitter, setRoomSync } from './events.js';
import { userFromToken } from './routes.js';

export function attachRealtime(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: '*' } });
  io.use(async (socket, next) => {
    try {
      const user = await userFromToken(socket.handshake.auth?.token as string | undefined);
      if (!user) return next(new Error('unauthorized'));
      socket.data.userId = String(user._id);
      await socket.join(`user:${user._id}`);
      if (user.coupleId) await socket.join(`couple:${user.coupleId}`);
      next();
    } catch (err) {
      next(err as Error);
    }
  });
  io.on('connection', (socket) => {
    // Tras emparejarse, la app pide volver a unirse a la sala de la pareja.
    socket.on('rejoin', async () => {
      const user = await userFromToken(socket.handshake.auth?.token as string | undefined);
      for (const room of socket.rooms) if (room.startsWith('couple:')) await socket.leave(room);
      if (user?.coupleId) await socket.join(`couple:${user.coupleId}`);
    });
  });
  setEmitter((coupleId, event, data) => io.to(`couple:${coupleId}`).emit(event, data));
  setRoomSync((userId, coupleId) => {
    const room = io.in(`user:${userId}`);
    void (async () => {
      const sockets = await room.fetchSockets();
      for (const s of sockets) {
        for (const r of s.rooms) if (r.startsWith('couple:')) s.leave(r);
        if (coupleId) s.join(`couple:${coupleId}`);
      }
    })();
  });
  return io;
}
