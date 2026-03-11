const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());


const isProduction = process.env.NODE_ENV === "production";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: isProduction ? process.env.CLIENT_URL : ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true 
});

let rooms = {}; 
let users = {}; 

const MAX_USERS_PER_ROOM = 15;

io.on("connection", (socket) => {
  // --- HELPER: Send Button States ---
  const emitUserState = (roomId, socketId) => {
    // 1. Can Undo? (Does this user have ANY lines in the current room history?)
    const roomHistory = rooms[roomId] || [];
    const canUndo = roomHistory.some(line => line.socketId === socketId);

    // 2. Can Redo? (Does this user have items in their personal redo stack?)
    const user = users[socketId];
    const canRedo = user ? user.redoStack.length > 0 : false;

    // Emit only to this specific user
    io.to(socketId).emit("interaction_state", { canUndo, canRedo });
  };

  socket.on("join_room", ({ name, color, roomId }) => {
    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    if (roomSize >= MAX_USERS_PER_ROOM) {
      socket.emit("room_full");
      return;
    }

    // --- NAME DUPLICATE CHECK ---
    const usersInRoom = Object.values(users).filter(u => u.roomId === roomId);
    const nameTaken = usersInRoom.some(u => u.name.toLowerCase() === name.toLowerCase());

    if (nameTaken) {
        socket.emit("join_error", "Name already taken");
        return;
    }

    socket.join(roomId);
    users[socket.id] = { name, color, roomId, redoStack: [] };

    if (!rooms[roomId]) rooms[roomId] = [];

    socket.emit("load_history", rooms[roomId]);
    
    // Broadcast User List
    const newUsersList = Object.values(users).filter(u => u.roomId === roomId);
    io.to(roomId).emit("update_users", newUsersList);
    
    // Send initial button state
    emitUserState(roomId, socket.id);
  });

  socket.on("draw_batch", (batchData) => {
    const { roomId, batch } = batchData;
    if (rooms[roomId]) {
        const taggedBatch = batch.map(point => ({ ...point, socketId: socket.id }));
        rooms[roomId].push(...taggedBatch);
        socket.to(roomId).emit("draw_batch", taggedBatch);
        
        if(users[socket.id]) users[socket.id].redoStack = []; 
        
        // Update sender's undo/redo state
        emitUserState(roomId, socket.id);
    }
  });

  socket.on("undo", ({ roomId }) => {
    if (!rooms[roomId]) return;
    const roomHistory = rooms[roomId];
    let lastStrokeId = null;

    for (let i = roomHistory.length - 1; i >= 0; i--) {
        if (roomHistory[i].socketId === socket.id) {
            lastStrokeId = roomHistory[i].strokeId;
            break;
        }
    }

    if (lastStrokeId) {
        const strokesToUndo = roomHistory.filter(pt => pt.strokeId === lastStrokeId);
        rooms[roomId] = roomHistory.filter(pt => pt.strokeId !== lastStrokeId);

        if (users[socket.id]) {
            users[socket.id].redoStack.push(strokesToUndo);
        }

        io.to(roomId).emit("refresh_board", rooms[roomId]);
        
        // Update sender's state
        emitUserState(roomId, socket.id);
    }
  });

  socket.on("redo", ({ roomId }) => {
    const user = users[socket.id];
    if (user && user.redoStack.length > 0) {
        const strokeToRestore = user.redoStack.pop();
        rooms[roomId].push(...strokeToRestore);

        io.to(roomId).emit("refresh_board", rooms[roomId]);
        
        // Update sender's state
        emitUserState(roomId, socket.id);
    }
  });

  socket.on("clear_my_canvas", (roomId) => {
    if (rooms[roomId]) {
        rooms[roomId] = rooms[roomId].filter(pt => pt.socketId !== socket.id);
        if(users[socket.id]) users[socket.id].redoStack = [];

        io.to(roomId).emit("refresh_board", rooms[roomId]);
        
        // Update sender's state (Should disable both Undo and Redo)
        emitUserState(roomId, socket.id);
    }
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
        const { roomId } = user;
        delete users[socket.id];
        const usersInRoom = Object.values(users).filter(u => u.roomId === roomId);
        io.to(roomId).emit("update_users", usersInRoom);
        if (usersInRoom.length === 0) delete rooms[roomId];
    }
  });
});

server.listen(5000, () => {
  console.log("SERVER RUNNING ON PORT 5000");
});
