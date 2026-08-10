const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

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

// ====== AUTH (регистрация/логин) ======
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'portal3-secret-key-2026-super-secure';
const ADMIN_EMAILS = ['gffrgoogle.com@gmail.com', 'portal3.fanedition.support@gmail.com'];

// Middleware
function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Нет токена' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        res.status(401).json({ error: 'Неверный токен' });
    }
}

function adminOnly(req, res, next) {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Нет прав администратора' });
    next();
}

// Auth routes
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    }
    if (global.db.users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email уже используется' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
        id: uuidv4(),
        username,
        email,
        password: hashedPassword,
        isAdmin: ADMIN_EMAILS.includes(email),
        createdAt: new Date().toISOString()
    };

    global.db.users.push(user);
    const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin }
    });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = global.db.users.find(u => u.email === email);
    if (!user) return res.status(400).json({ error: 'Неверный email или пароль' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Неверный email или пароль' });

    const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin }
    });
});

app.get('/api/auth/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Нет токена' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = global.db.users.find(u => u.id === decoded.userId);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        res.json({ id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin });
    } catch (e) {
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// ====== CHAT ======
app.get('/api/chat/messages', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(global.db.messages.slice(-limit));
});

app.post('/api/chat/messages', auth, (req, res) => {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

    const user = global.db.users.find(u => u.id === req.user.userId);
    if (global.db.bannedUsers.has(user.id)) {
        return res.status(403).json({ error: 'Вы забанены' });
    }

    const message = {
        id: Date.now().toString(),
        text: text.trim(),
        userId: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        timestamp: new Date().toISOString()
    };

    global.db.messages.push(message);
    if (global.db.messages.length > 500) global.db.messages = global.db.messages.slice(-500);
    if (global.io) global.io.emit('new_message', message);

    res.json(message);
});

app.delete('/api/chat/messages', auth, adminOnly, (req, res) => {
    global.db.messages = [];
    if (global.io) global.io.emit('messages_cleared');
    res.json({ success: true });
});

app.post('/api/chat/ban', auth, adminOnly, (req, res) => {
    global.db.bannedUsers.add(req.body.userId);
    res.json({ success: true });
});

// ====== SUPPORT ======
app.get('/api/support/conversation', auth, (req, res) => {
    const convId = 'conv_' + req.user.userId;
    if (!global.db.supportChats[convId]) {
        global.db.supportChats[convId] = {
            id: convId,
            userId: req.user.userId,
            messages: [],
            needsAdmin: false,
            createdAt: new Date().toISOString()
        };
    }
    res.json(global.db.supportChats[convId]);
});

app.post('/api/support/message', auth, (req, res) => {
    const { text } = req.body;
    const convId = 'conv_' + req.user.userId;

    if (!global.db.supportChats[convId]) {
        global.db.supportChats[convId] = {
            id: convId,
            userId: req.user.userId,
            messages: [],
            needsAdmin: false,
            createdAt: new Date().toISOString()
        };
    }

    const message = {
        id: Date.now().toString(),
        text: text.trim(),
        sender: 'user',
        timestamp: new Date().toISOString()
    };

    global.db.supportChats[convId].messages.push(message);
    global.db.supportChats[convId].needsAdmin = true;
    global.db.supportChats[convId].lastMessage = text;
    global.db.supportChats[convId].lastTime = new Date().toISOString();

    if (global.io) global.io.emit('support_update', { convId, needsAdmin: true });
    res.json(message);
});

app.get('/api/support/conversations', auth, adminOnly, (req, res) => {
    const convs = Object.values(global.db.supportChats)
        .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0))
        .map(c => ({
            id: c.id,
            userId: c.userId,
            lastMessage: c.lastMessage,
            lastTime: c.lastTime,
            needsAdmin: c.needsAdmin
        }));
    res.json(convs);
});

app.post('/api/support/reply', auth, adminOnly, (req, res) => {
    const { convId, text } = req.body;
    if (!global.db.supportChats[convId]) return res.status(404).json({ error: 'Диалог не найден' });

    const message = {
        id: Date.now().toString(),
        text: text.trim(),
        sender: 'admin',
        timestamp: new Date().toISOString()
    };

    global.db.supportChats[convId].messages.push(message);
    global.db.supportChats[convId].needsAdmin = false;
    global.db.supportChats[convId].lastMessage = text;
    global.db.supportChats[convId].lastTime = new Date().toISOString();

    if (global.io) global.io.to(convId).emit('new_support_message', message);
    res.json(message);
});

// ====== WEBSOCKET ======
global.io = io;

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        socket.userId = 'guest_' + Date.now();
        socket.username = 'Гость';
        socket.isAdmin = false;
        return next();
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = global.db.users.find(u => u.id === decoded.userId);
        if (user) {
            socket.userId = user.id;
            socket.username = user.username;
            socket.isAdmin = user.isAdmin;
        }
        next();
    } catch (e) {
        socket.userId = 'guest_' + Date.now();
        socket.username = 'Гость';
        socket.isAdmin = false;
        next();
    }
});

io.on('connection', (socket) => {
    console.log('👤 Подключился:', socket.username);
    socket.emit('messages', global.db.messages);

    socket.on('send_message', (data) => {
        if (!socket.userId || global.db.bannedUsers.has(socket.userId)) {
            socket.emit('error', { message: 'Забанены или не авторизованы' });
            return;
        }
        const message = {
            id: Date.now().toString(),
            text: data.text.trim(),
            userId: socket.userId,
            username: socket.username,
            isAdmin: socket.isAdmin,
            timestamp: new Date().toISOString()
        };
        global.db.messages.push(message);
        if (global.db.messages.length > 500) global.db.messages = global.db.messages.slice(-500);
        io.emit('new_message', message);
    });

    socket.on('join_support', (convId) => {
        socket.join(convId);
        if (global.db.supportChats[convId]) {
            socket.emit('support_messages', global.db.supportChats[convId].messages);
        }
    });

    socket.on('support_message', (data) => {
        const { convId, text } = data;
        if (!global.db.supportChats[convId]) return;
        const message = {
            id: Date.now().toString(),
            text: text.trim(),
            sender: socket.isAdmin ? 'admin' : 'user',
            timestamp: new Date().toISOString()
        };
        global.db.supportChats[convId].messages.push(message);
        global.db.supportChats[convId].needsAdmin = !socket.isAdmin;
        io.to(convId).emit('new_support_message', message);
        if (!socket.isAdmin) {
            io.emit('admin_notification', { convId, message: text });
        }
    });

    socket.on('disconnect', () => {
        console.log('👋 Отключился:', socket.username);
    });
});

// ====== HEALTH CHECK ======
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', users: global.db.users.length, messages: global.db.messages.length });
});

// ====== START ======
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
