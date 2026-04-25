const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const path = require("path");

// static files
app.use(express.static(path.join(__dirname, "../client")));

// ================= ROUTES =================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../client", "index.html"));
});

app.get("/room/:id", (req, res) => {
    res.sendFile(path.join(__dirname, "../client", "room.html"));
});

app.get("/leave", (req, res) => {
    res.sendFile(path.join(__dirname, "../client", "leave.html"));
});

// ================= SOCKET =================

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // ================= JOIN ROOM =================
    socket.on("join-room", ({ roomId, name }) => {
        socket.join(roomId);

        socket.data.name = name || "User";
        socket.data.roomId = roomId;

        console.log(`${socket.data.name} (${socket.id}) joined room: ${roomId}`);

        const users = [];
        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);

        if (socketsInRoom) {
            socketsInRoom.forEach(id => {
                if (id !== socket.id) {
                    const s = io.sockets.sockets.get(id);
                    users.push({
                        userId: id,
                        name: s?.data?.name || "User"
                    });
                }
            });
        }

        socket.emit("existing-users", users);

        socket.to(roomId).emit("user-joined", {
            userId: socket.id,
            name: socket.data.name
        });
    });

    // ================= OFFER =================
    socket.on("offer", ({ offer, to }) => {
        socket.to(to).emit("offer", {
            offer,
            from: socket.id,
            name: socket.data.name
        });
    });

    // ================= ANSWER =================
    socket.on("answer", ({ answer, to }) => {
        socket.to(to).emit("answer", {
            answer,
            from: socket.id,
            name: socket.data.name
        });
    });

    // ================= ICE =================
    socket.on("ice-candidate", ({ candidate, to }) => {
        socket.to(to).emit("ice-candidate", {
            candidate,
            from: socket.id,
            name: socket.data.name
        });
    });

    // ================= REACTIONS =================

    socket.on("heart-reaction", ({ roomId }) => {
        const targetRoom = roomId || socket.data.roomId;
        if (!targetRoom) return;

        socket.to(targetRoom).emit("heart-reaction", {
            userId: socket.id,
            name: socket.data.name || "User"
        });
    });

    socket.on("thumbs-reaction", ({ roomId }) => {
        const targetRoom = roomId || socket.data.roomId;
        if (!targetRoom) return;

        socket.to(targetRoom).emit("thumbs-reaction", {
            userId: socket.id,
            name: socket.data.name || "User"
        });
    });

    socket.on("energy-reaction", ({ roomId }) => {
        const targetRoom = roomId || socket.data.roomId;
        if (!targetRoom) return;

        socket.to(targetRoom).emit("energy-reaction", {
            userId: socket.id,
            name: socket.data.name || "User"
        });
    });

    socket.on("flower-reaction", ({ roomId }) => {
        const targetRoom = roomId || socket.data.roomId;
        if (!targetRoom) return;

        socket.to(targetRoom).emit("flower-reaction", {
            userId: socket.id,
            name: socket.data.name || "User"
        });
    });

    // ================= DISCONNECTING =================
    socket.on("disconnecting", () => {
        const rooms = [...socket.rooms];

        rooms.forEach(room => {
            if (room !== socket.id) {
                socket.to(room).emit("user-left", socket.id);
            }
        });
    });

    // ================= DISCONNECT =================
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// ================= START SERVER =================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});