const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// In-memory БД (временная)
global.db = {
    users: [],
    messages: [],
    supportChats: {},
    bannedUsers: new Set()
};

// Маршруты
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/support', require('./routes/support'));

// WebSocket
require('./sockets/chat')(io);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', users: global.db.users.length, messages: global.db.messages.length });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
    console.log('╔══════════════════════════════════════╗');
    console.log('║   🚀 Portal 3 Backend запущен!       ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║   📡 Порт: ${PORT}                    ║`);
    console.log(`║   🌐 API: http://localhost:${PORT}/api ║`);
    console.log(`║   🔌 WebSocket: ws://localhost:${PORT}  ║`);
    console.log('╚══════════════════════════════════════╝');
});
