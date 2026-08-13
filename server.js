// ============================================================
// PORTAL 3: FAN EDITION — БЕЗОПАСНЫЙ БЭКЕНД
// Иерархия: AUTHOR > SUPER_ADMIN > ADMIN > SPONSOR > USER
// ============================================================

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const fs = require('fs').promises;
const path = require('path');

// ============================================================
// 1. РОЛИ (5 уровней)
// ============================================================

const ROLES = {
    AUTHOR: 5,
    SUPER_ADMIN: 4,
    ADMIN: 3,
    SPONSOR: 2,
    USER: 1
};

const ROLE_NAMES = {
    [ROLES.AUTHOR]: 'author',
    [ROLES.SUPER_ADMIN]: 'super_admin',
    [ROLES.ADMIN]: 'admin',
    [ROLES.SPONSOR]: 'sponsor',
    [ROLES.USER]: 'user'
};

const ROLE_IDS = {
    'author': ROLES.AUTHOR,
    'super_admin': ROLES.SUPER_ADMIN,
    'admin': ROLES.ADMIN,
    'sponsor': ROLES.SPONSOR,
    'user': ROLES.USER
};

// Хардкод ролей по email
const ROLE_MAP = {
    'gffrgogle.com@gmail.com': ROLES.AUTHOR,
    'gffrfor@gmail.com': ROLES.SUPER_ADMIN,
    'portal3.fanedition.support@gmail.com': ROLES.ADMIN
};

// ============================================================
// 2. КОНФИГУРАЦИЯ
// ============================================================

if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET не задан в .env');
    process.exit(1);
}

const CONFIG = {
    PORT: parseInt(process.env.PORT) || 9000,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',
    MONGODB_URI: process.env.MONGODB_URI || '',
    DB_TYPE: process.env.DB_TYPE || 'json',
    CORS_ORIGIN: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['https://gffrgoogle.github.io'],
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    CHAT_MAX_MESSAGES: parseInt(process.env.CHAT_MAX_MESSAGES) || 500,
    CHAT_MAX_LENGTH: parseInt(process.env.CHAT_MAX_LENGTH) || 1000,
    PASSWORD_MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH) || 6,
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    DB_FILE: path.join(__dirname, 'data', 'db.json')
};

// ============================================================
// 3. БАЗА ДАННЫХ
// ============================================================

class Database {
    constructor() {
        this.users = [];
        this.messages = [];
        this.supportChats = {};
        this.bannedUsers = new Set();
        this.initialized = false;
    }

    async init() {
        if (CONFIG.DB_TYPE === 'mongodb' && CONFIG.MONGODB_URI) {
            return this.initMongoDB();
        }
        return this.initJSON();
    }

    async initJSON() {
        try {
            await fs.mkdir(path.dirname(CONFIG.DB_FILE), { recursive: true });
            const data = await fs.readFile(CONFIG.DB_FILE, 'utf8').catch(() => null);
            if (data) {
                const parsed = JSON.parse(data);
                this.users = parsed.users || [];
                this.messages = parsed.messages || [];
                this.supportChats = parsed.supportChats || {};
                this.bannedUsers = new Set(parsed.bannedUsers || []);
            }
            this.initialized = true;
            console.log('✅ JSON БД загружена');
        } catch (e) {
            console.error('❌ Ошибка загрузки JSON БД:', e.message);
            this.initialized = true;
        }
    }

    async initMongoDB() {
        try {
            const { MongoClient } = require('mongodb');
            this.mongoClient = new MongoClient(CONFIG.MONGODB_URI);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db('portal3');
            this.usersCollection = this.db.collection('users');
            this.messagesCollection = this.db.collection('messages');
            this.supportCollection = this.db.collection('support');
            this.bannedCollection = this.db.collection('banned');

            await this.usersCollection.createIndex({ email: 1 }, { unique: true });
            await this.messagesCollection.createIndex({ timestamp: -1 });
            await this.supportCollection.createIndex({ userId: 1 });

            this.initialized = true;
            console.log('✅ MongoDB подключена');
        } catch (e) {
            console.error('❌ MongoDB недоступна, переключение на JSON:', e.message);
            CONFIG.DB_TYPE = 'json';
            return this.initJSON();
        }
    }

    async save() {
        if (CONFIG.DB_TYPE === 'json') {
            const data = {
                users: this.users,
                messages: this.messages,
                supportChats: this.supportChats,
                bannedUsers: [...this.bannedUsers]
            };
            await fs.writeFile(CONFIG.DB_FILE, JSON.stringify(data, null, 2));
        }
    }

    async findUserByEmail(email) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            return await this.usersCollection.findOne({ email: email.toLowerCase() });
        }
        return this.users.find(u => u.email === email.toLowerCase());
    }

    async findUserById(id) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            const { ObjectId } = require('mongodb');
            return await this.usersCollection.findOne({ _id: new ObjectId(id) });
        }
        return this.users.find(u => u.id === id);
    }

    async createUser(userData) {
        const user = { ...userData, email: userData.email.toLowerCase() };
        if (CONFIG.DB_TYPE === 'mongodb') {
            const result = await this.usersCollection.insertOne(user);
            user._id = result.insertedId;
            return user;
        }
        this.users.push(user);
        await this.save();
        return user;
    }

    async updateUser(id, updates) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            const { ObjectId } = require('mongodb');
            await this.usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
            return await this.findUserById(id);
        }
        const idx = this.users.findIndex(u => u.id === id);
        if (idx !== -1) {
            this.users[idx] = { ...this.users[idx], ...updates };
            await this.save();
            return this.users[idx];
        }
        return null;
    }

    async deleteUser(id) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            const { ObjectId } = require('mongodb');
            await this.usersCollection.deleteOne({ _id: new ObjectId(id) });
            return;
        }
        this.users = this.users.filter(u => u.id !== id);
        await this.save();
    }

    async getMessages(limit = 50) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            return await this.messagesCollection.find().sort({ timestamp: -1 }).limit(limit).toArray();
        }
        return this.messages.slice(-limit);
    }

    async addMessage(msg) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            await this.messagesCollection.insertOne(msg);
            const count = await this.messagesCollection.countDocuments();
            if (count > CONFIG.CHAT_MAX_MESSAGES) {
                const oldest = await this.messagesCollection.find().sort({ timestamp: 1 }).limit(count - CONFIG.CHAT_MAX_MESSAGES).toArray();
                await this.messagesCollection.deleteMany({ _id: { $in: oldest.map(m => m._id) } });
            }
            return msg;
        }
        this.messages.push(msg);
        if (this.messages.length > CONFIG.CHAT_MAX_MESSAGES) {
            this.messages = this.messages.slice(-CONFIG.CHAT_MAX_MESSAGES);
        }
        await this.save();
        return msg;
    }

    async clearMessages() {
        if (CONFIG.DB_TYPE === 'mongodb') {
            await this.messagesCollection.deleteMany({});
            return;
        }
        this.messages = [];
        await this.save();
    }

    async getSupportChat(convId) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            return await this.supportCollection.findOne({ convId });
        }
        return this.supportChats[convId] || null;
    }

    async createSupportChat(convId, userId) {
        const chat = {
            convId, userId, messages: [],
            needsAdmin: false,
            createdAt: new Date().toISOString(),
            lastTime: new Date().toISOString()
        };
        if (CONFIG.DB_TYPE === 'mongodb') {
            await this.supportCollection.insertOne(chat);
            return chat;
        }
        this.supportChats[convId] = chat;
        await this.save();
        return chat;
    }

    async addSupportMessage(convId, message) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            await this.supportCollection.updateOne(
                { convId },
                {
                    $push: { messages: message },
                    $set: {
                        lastMessage: message.text,
                        lastTime: message.timestamp,
                        needsAdmin: message.sender === 'user'
                    }
                }
            );
            return;
        }
        if (!this.supportChats[convId]) return;
        this.supportChats[convId].messages.push(message);
        this.supportChats[convId].needsAdmin = message.sender === 'user';
        this.supportChats[convId].lastMessage = message.text;
        this.supportChats[convId].lastTime = message.timestamp;
        await this.save();
    }

    async getAllSupportChats() {
        if (CONFIG.DB_TYPE === 'mongodb') {
            return await this.supportCollection.find().sort({ lastTime: -1 }).toArray();
        }
        return Object.values(this.supportChats).sort((a, b) => (b.lastTime || 0) > (a.lastTime || 0) ? 1 : -1);
    }

    async isBanned(userId) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            return !!(await this.bannedCollection.findOne({ userId }));
        }
        return this.bannedUsers.has(userId);
    }

    async banUser(userId) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            await this.bannedCollection.updateOne(
                { userId },
                { $set: { userId, bannedAt: new Date().toISOString() } },
                { upsert: true }
            );
            return;
        }
        this.bannedUsers.add(userId);
        await this.save();
    }

    async unbanUser(userId) {
        if (CONFIG.DB_TYPE === 'mongodb') {
            await this.bannedCollection.deleteOne({ userId });
            return;
        }
        this.bannedUsers.delete(userId);
        await this.save();
    }
}

// ============================================================
// 4. ИНИЦИАЛИЗАЦИЯ
// ============================================================

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: CONFIG.CORS_ORIGIN, methods: ['GET', 'POST'], credentials: true },
    transports: ['websocket', 'polling']
});

const db = new Database();

// ============================================================
// 5. MIDDLEWARE БЕЗОПАСНОСТИ
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

app.use(cors({ origin: CONFIG.CORS_ORIGIN, credentials: true }));

app.use('/api/', rateLimit({
    windowMs: CONFIG.RATE_LIMIT_WINDOW * 60 * 1000,
    max: CONFIG.RATE_LIMIT_MAX,
    message: { error: 'Слишком много запросов' }
}));

app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Слишком много попыток входа' } }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// ============================================================
// 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return validator.escape(text.trim()).substring(0, CONFIG.CHAT_MAX_LENGTH);
}

function validateEmail(email) {
    return email && validator.isEmail(email) && validator.isLength(email, { max: 254 });
}

function validateUsername(username) {
    return username && validator.isLength(username, { min: 2, max: 30 }) &&
           validator.matches(username, /^[a-zA-Z0-9_\-\u0400-\u04FF]+$/);
}

function validatePassword(password) {
    return password && typeof password === 'string' &&
           password.length >= CONFIG.PASSWORD_MIN_LENGTH && password.length <= 128;
}

function getRoleByEmail(email) {
    return ROLE_MAP[email.toLowerCase().trim()] || ROLES.USER;
}

// ⭐ УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (бан/удаление)
// AUTHOR может управлять ВСЕМИ
// SUPER_ADMIN может управлять ADMIN и USER (но не SPONSOR, SUPER_ADMIN, AUTHOR)
// ADMIN может управлять только USER
function canManageUser(actorRole, targetRole) {
    if (actorRole === ROLES.AUTHOR) return true;
    if (actorRole === ROLES.SUPER_ADMIN) return targetRole <= ROLES.ADMIN;
    if (actorRole === ROLES.ADMIN) return targetRole <= ROLES.USER;
    return false;
}

// ⭐ НАЗНАЧЕНИЕ РОЛЕЙ
// AUTHOR может назначать SUPER_ADMIN, ADMIN, SPONSOR, USER
// SUPER_ADMIN может назначать ADMIN, USER (но не SPONSOR)
function canAssignRole(actorRole, newRole) {
    if (actorRole === ROLES.AUTHOR) return newRole < ROLES.AUTHOR;
    if (actorRole === ROLES.SUPER_ADMIN) return newRole <= ROLES.ADMIN;
    return false;
}

// ⭐ ПРОСМОТР ПАРОЛЕЙ
// Только AUTHOR и SUPER_ADMIN
function canViewPassword(actorRole, targetRole) {
    if (actorRole === ROLES.AUTHOR) return true;
    if (actorRole === ROLES.SUPER_ADMIN) return targetRole <= ROLES.ADMIN;
    return false;
}

// ⭐ ОЧИСТКА ЧАТА
function canClearChat(role) {
    return role >= ROLES.SPONSOR;
}

// ⭐ ПРОСМОТР СПИСКА ПОЛЬЗОВАТЕЛЕЙ
function canViewUserList(role) {
    return role >= ROLES.SPONSOR;
}

// ⭐ ФИЛЬТРАЦИЯ СПИСКА
// AUTHOR видит ВСЕХ
// SUPER_ADMIN видит ADMIN, SPONSOR, USER (без AUTHOR и SUPER_ADMIN)
// ADMIN видит только USER
// SPONSOR видит ВСЕХ (как просили)
function filterUsersByViewerRole(users, viewerRole) {
    if (viewerRole === ROLES.AUTHOR) return users;
    if (viewerRole === ROLES.SUPER_ADMIN) return users.filter(u => u.role <= ROLES.ADMIN);
    if (viewerRole === ROLES.ADMIN) return users.filter(u => u.role <= ROLES.USER);
    if (viewerRole === ROLES.SPONSOR) return users; // SPONSOR видит ВСЕХ
    return users.filter(u => u.role === ROLES.USER);
}

// ⭐ ПРОВЕРКА ВИДИМОСТИ ПОЛЬЗОВАТЕЛЯ (для GET /api/users/:id)
// AUTHOR видит ВСЕХ
// SUPER_ADMIN не видит AUTHOR и SUPER_ADMIN
// ADMIN видит только USER
// SPONSOR видит ВСЕХ (как просили)
function canViewUserDetail(actorRole, targetRole) {
    if (actorRole === ROLES.AUTHOR) return true;
    if (actorRole === ROLES.SUPER_ADMIN) return targetRole <= ROLES.ADMIN;
    if (actorRole === ROLES.ADMIN) return targetRole <= ROLES.USER;
    if (actorRole === ROLES.SPONSOR) return true; // SPONSOR видит ВСЕХ
    return targetRole === ROLES.USER;
}

function generateToken(user) {
    return jwt.sign(
        { userId: user.id || user._id?.toString(), role: user.role },
        CONFIG.JWT_SECRET,
        { expiresIn: CONFIG.JWT_EXPIRES }
    );
}

function verifyToken(token) {
    try { return jwt.verify(token, CONFIG.JWT_SECRET); }
    catch (e) { return null; }
}

// ============================================================
// 7. AUTH MIDDLEWARE
// ============================================================

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Неверный или просроченный токен' });
    }

    const user = await db.findUserById(decoded.userId);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (await db.isBanned(decoded.userId)) {
        return res.status(403).json({ error: 'Вы забанены' });
    }

    req.user = {
        userId: decoded.userId,
        role: user.role,
        username: user.username,
        email: user.email
    };
    next();
}

function requireRole(minRole) {
    return (req, res, next) => {
        if (!req.user || req.user.role < minRole) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }
        next();
    };
}

// ============================================================
// 8. SOCKET.IO
// ============================================================

io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        socket.userId = 'guest_' + uuidv4();
        socket.username = 'Гость';
        socket.role = ROLES.USER;
        return next();
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        socket.userId = 'guest_' + uuidv4();
        socket.username = 'Гость';
        socket.role = ROLES.USER;
        return next();
    }

    const user = await db.findUserById(decoded.userId);
    if (!user || await db.isBanned(decoded.userId)) {
        socket.userId = 'guest_' + uuidv4();
        socket.username = 'Гость';
        socket.role = ROLES.USER;
        return next();
    }

    socket.userId = decoded.userId;
    socket.username = user.username;
    socket.role = user.role;
    next();
});

io.on('connection', (socket) => {
    console.log(`👤 Подключился: ${socket.username} (${ROLE_NAMES[socket.role]})`);

    db.getMessages(50).then(messages => socket.emit('messages', messages.reverse()));

    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId || socket.userId.startsWith('guest_')) {
                return socket.emit('error', { message: 'Требуется авторизация' });
            }
            if (await db.isBanned(socket.userId)) {
                return socket.emit('error', { message: 'Вы забанены' });
            }

            const text = sanitizeText(data?.text);
            if (!text) return socket.emit('error', { message: 'Пустое сообщение' });

            const message = {
                id: uuidv4(), text,
                userId: socket.userId,
                username: socket.username,
                role: socket.role,
                timestamp: new Date().toISOString()
            };

            await db.addMessage(message);
            io.emit('new_message', message);
        } catch (e) {
            socket.emit('error', { message: 'Ошибка отправки' });
        }
    });

    socket.on('join_support', async (convId) => {
        socket.join(convId);
        const chat = await db.getSupportChat(convId);
        if (chat) socket.emit('support_messages', chat.messages);
    });

    socket.on('support_message', async (data) => {
        try {
            const { convId, text } = data || {};
            if (!convId || !text) return;
            const cleanText = sanitizeText(text);
            if (!cleanText) return;

            const message = {
                id: uuidv4(), text: cleanText,
                sender: socket.role >= ROLES.ADMIN ? 'admin' : 'user',
                timestamp: new Date().toISOString()
            };

            await db.addSupportMessage(convId, message);
            io.to(convId).emit('new_support_message', message);
            if (socket.role < ROLES.ADMIN) {
                io.emit('admin_notification', { convId, message: cleanText });
            }
        } catch (e) {
            console.error('Support message error:', e);
        }
    });

    socket.on('disconnect', () => {
        console.log(`👋 Отключился: ${socket.username}`);
    });
});

// ============================================================
// 9. API — AUTH
// ============================================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body || {};

        if (!validateUsername(username)) {
            return res.status(400).json({ error: 'Имя: 2-30 символов, буквы/цифры/_-' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Неверный email' });
        }
        if (!validatePassword(password)) {
            return res.status(400).json({ error: `Пароль: минимум ${CONFIG.PASSWORD_MIN_LENGTH} символов` });
        }

        const existing = await db.findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email уже используется' });
        }

        const role = getRoleByEmail(email);
        const hashedPassword = await bcrypt.hash(password, CONFIG.BCRYPT_ROUNDS);

        const user = await db.createUser({
            id: uuidv4(),
            username: sanitizeText(username),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: role,
            createdAt: new Date().toISOString()
        });

        const token = generateToken(user);

        res.status(201).json({
            token,
            user: {
                id: user.id || user._id,
                username: user.username,
                email: user.email,
                role: ROLE_NAMES[user.role]
            }
        });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'Email и пароль обязательны' });
        }

        const user = await db.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        if (await db.isBanned(user.id || user._id?.toString())) {
            return res.status(403).json({ error: 'Вы забанены' });
        }

        const token = generateToken(user);

        res.json({
            token,
            user: {
                id: user.id || user._id,
                username: user.username,
                email: user.email,
                role: ROLE_NAMES[user.role]
            }
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    res.json({
        id: req.user.userId,
        username: req.user.username,
        email: req.user.email,
        role: ROLE_NAMES[req.user.role]
    });
});

app.delete('/api/auth/delete-account', authMiddleware, async (req, res) => {
    try {
        await db.deleteUser(req.user.userId);
        res.json({ success: true, message: 'Аккаунт удалён' });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка удаления аккаунта' });
    }
});

// ============================================================
// 10. API — УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ И РОЛЯМИ
// ============================================================

// Получить список пользователей
app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const viewerRole = req.user.role;

        if (!canViewUserList(viewerRole)) {
            return res.status(403).json({ error: 'Нет доступа к списку пользователей' });
        }

        let users;
        if (CONFIG.DB_TYPE === 'mongodb') {
            users = await db.usersCollection.find().toArray();
        } else {
            users = db.users;
        }

        const filtered = filterUsersByViewerRole(users, viewerRole);

        const result = filtered.map(u => ({
            id: u.id || u._id,
            username: u.username,
            email: u.email,
            role: ROLE_NAMES[u.role],
            roleLevel: u.role,
            createdAt: u.createdAt,
            isBanned: db.bannedUsers.has(u.id) || false
        }));

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: 'Ошибка загрузки пользователей' });
    }
});

// Получить детали пользователя
app.get('/api/users/:id', authMiddleware, async (req, res) => {
    try {
        const targetUser = await db.findUserById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const actorRole = req.user.role;
        const targetRole = targetUser.role;

        // ⭐ Проверка видимости через canViewUserDetail
        if (!canViewUserDetail(actorRole, targetRole)) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        const response = {
            id: targetUser.id || targetUser._id,
            username: targetUser.username,
            email: targetUser.email,
            role: ROLE_NAMES[targetRole],
            roleLevel: targetRole,
            createdAt: targetUser.createdAt
        };

        // Пароль
        if (canViewPassword(actorRole, targetRole)) {
            response.passwordHash = targetUser.password;
        }

        res.json(response);
    } catch (e) {
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

// Назначить / изменить роль
app.patch('/api/users/:id/role', authMiddleware, async (req, res) => {
    try {
        const { role: newRoleName } = req.body || {};
        const targetUser = await db.findUserById(req.params.id);

        if (!targetUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const actorRole = req.user.role;
        const targetRole = targetUser.role;
        const newRole = ROLE_IDS[newRoleName];

        if (!newRole) {
            return res.status(400).json({
                error: 'Неверная роль',
                available: Object.keys(ROLE_IDS)
            });
        }

        if (targetRole === ROLES.AUTHOR) {
            return res.status(403).json({ error: 'Нельзя изменить роль автора' });
        }

        if (!canAssignRole(actorRole, newRole)) {
            return res.status(403).json({
                error: 'Нельзя назначить эту роль',
                yourRole: ROLE_NAMES[actorRole],
                maxAssignable: ROLE_NAMES[actorRole === ROLES.AUTHOR ? ROLES.SUPER_ADMIN : ROLES.ADMIN]
            });
        }

        if (actorRole !== ROLES.AUTHOR && targetRole >= actorRole) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        const updated = await db.updateUser(req.params.id, { role: newRole });
        res.json({
            success: true,
            user: {
                id: updated.id || updated._id,
                username: updated.username,
                email: updated.email,
                oldRole: ROLE_NAMES[targetRole],
                newRole: ROLE_NAMES[newRole]
            }
        });
    } catch (e) {
        console.error('Role change error:', e);
        res.status(500).json({ error: 'Ошибка изменения роли' });
    }
});

// Удалить пользователя
app.delete('/api/users/:id', authMiddleware, async (req, res) => {
    try {
        const targetUser = await db.findUserById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const actorRole = req.user.role;
        const targetRole = targetUser.role;

        // ⭐ SPONSOR может удалить только себя
        // AUTHOR может удалить ВСЕХ
        // SUPER_ADMIN может удалить ADMIN и USER (но не SPONSOR, SUPER_ADMIN, AUTHOR)
        // ADMIN может удалить только USER
        if (actorRole !== ROLES.AUTHOR) {
            if (!canManageUser(actorRole, targetRole)) {
                return res.status(403).json({ error: 'Недостаточно прав' });
            }
        }

        if (req.params.id === req.user.userId) {
            return res.status(400).json({ error: 'Используйте /api/auth/delete-account' });
        }

        await db.deleteUser(req.params.id);
        res.json({ success: true, message: 'Пользователь удалён' });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// Бан / разбан
app.post('/api/users/:id/ban', authMiddleware, async (req, res) => {
    try {
        const targetUser = await db.findUserById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const actorRole = req.user.role;
        const targetRole = targetUser.role;

        // ⭐ SPONSOR нельзя забанить (только AUTHOR может)
        if (targetRole === ROLES.SPONSOR && actorRole !== ROLES.AUTHOR) {
            return res.status(403).json({ error: 'Недостаточно прав для бана спонсора' });
        }

        if (!canManageUser(actorRole, targetRole)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        await db.banUser(req.params.id);
        res.json({ success: true, message: 'Пользователь забанен' });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.post('/api/users/:id/unban', authMiddleware, async (req, res) => {
    try {
        const targetUser = await db.findUserById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const actorRole = req.user.role;
        const targetRole = targetUser.role;

        // ⭐ SPONSOR нельзя разбанить (только AUTHOR может)
        if (targetRole === ROLES.SPONSOR && actorRole !== ROLES.AUTHOR) {
            return res.status(403).json({ error: 'Недостаточно прав для разбана спонсора' });
        }

        if (!canManageUser(actorRole, targetRole)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        await db.unbanUser(req.params.id);
        res.json({ success: true, message: 'Пользователь разбанен' });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// ============================================================
// 11. API — CHAT
// ============================================================

app.get('/api/chat/messages', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const messages = await db.getMessages(limit);
        res.json(messages);
    } catch (e) {
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

app.post('/api/chat/messages', authMiddleware, async (req, res) => {
    try {
        const text = sanitizeText(req.body?.text);
        if (!text) return res.status(400).json({ error: 'Пустое сообщение' });

        const message = {
            id: uuidv4(), text,
            userId: req.user.userId,
            username: req.user.username,
            role: req.user.role,
            timestamp: new Date().toISOString()
        };

        await db.addMessage(message);
        io.emit('new_message', message);
        res.status(201).json(message);
    } catch (e) {
        res.status(500).json({ error: 'Ошибка отправки' });
    }
});

app.delete('/api/chat/messages', authMiddleware, async (req, res) => {
    try {
        if (!canClearChat(req.user.role)) {
            return res.status(403).json({ error: 'Недостаточно прав для очистки чата' });
        }

        await db.clearMessages();
        io.emit('messages_cleared');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка очистки' });
    }
});

// ============================================================
// 12. API — SUPPORT
// ============================================================

app.get('/api/support/conversation', authMiddleware, async (req, res) => {
    try {
        const convId = 'conv_' + req.user.userId;
        let chat = await db.getSupportChat(convId);
        if (!chat) chat = await db.createSupportChat(convId, req.user.userId);
        res.json(chat);
    } catch (e) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.post('/api/support/message', authMiddleware, async (req, res) => {
    try {
        const text = sanitizeText(req.body?.text);
        if (!text) return res.status(400).json({ error: 'Пустое сообщение' });

        const convId = 'conv_' + req.user.userId;
        let chat = await db.getSupportChat(convId);
        if (!chat) chat = await db.createSupportChat(convId, req.user.userId);

        const message = {
            id: uuidv4(), text,
            sender: 'user',
            timestamp: new Date().toISOString()
        };

        await db.addSupportMessage(convId, message);
        io.emit('support_update', { convId, needsAdmin: true });
        res.status(201).json(message);
    } catch (e) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.get('/api/support/conversations', authMiddleware, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        let convs = await db.getAllSupportChats();
        if (req.user.role === ROLES.ADMIN) {
            convs = convs.filter(c => c.needsAdmin);
        }
        res.json(convs.map(c => ({
            id: c.convId,
            userId: c.userId,
            lastMessage: c.lastMessage,
            lastTime: c.lastTime,
            needsAdmin: c.needsAdmin
        })));
    } catch (e) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.post('/api/support/reply', authMiddleware, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const { convId, text } = req.body || {};
        if (!convId || !text) return res.status(400).json({ error: 'convId и text обязательны' });

        const cleanText = sanitizeText(text);
        if (!cleanText) return res.status(400).json({ error: 'Пустое сообщение' });

        const chat = await db.getSupportChat(convId);
        if (!chat) return res.status(404).json({ error: 'Диалог не найден' });

        const message = {
            id: uuidv4(), text: cleanText,
            sender: 'admin',
            timestamp: new Date().toISOString()
        };

        await db.addSupportMessage(convId, message);
        io.to(convId).emit('new_support_message', message);
        res.json(message);
    } catch (e) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// ============================================================
// 13. СЕРВИСНЫЕ РОУТЫ
// ============================================================

app.get('/api/health', async (req, res) => {
    const users = CONFIG.DB_TYPE === 'mongodb'
        ? await db.usersCollection?.countDocuments() || 0
        : db.users.length;
    const messages = CONFIG.DB_TYPE === 'mongodb'
        ? await db.messagesCollection?.countDocuments() || 0
        : db.messages.length;

    res.json({
        status: 'ok', db: CONFIG.DB_TYPE,
        users, messages, uptime: process.uptime()
    });
});

app.get('/api/config/public', (req, res) => {
    res.json({
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || null,
        features: { chat: true, support: true, registration: true }
    });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
});

app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ============================================================
// 14. ЗАПУСК
// ============================================================

async function start() {
    await db.init();

    server.listen(CONFIG.PORT, () => {
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🚀 Portal 3 Backend — ROLE SYSTEM           ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  👑 AUTHOR       → gffrgogle.com@gmail.com   ║`);
        console.log(`║  🔴 SUPER_ADMIN  → gffrfor@gmail.com         ║`);
        console.log(`║  🔵 ADMIN        → portal3.fanedition...     ║`);
        console.log(`║  💎 SPONSOR      → назначается AUTHOR        ║`);
        console.log(`║  📡 Порт:        ${CONFIG.PORT.toString().padEnd(29)}║`);
        console.log(`║  🗄️  База:       ${CONFIG.DB_TYPE.padEnd(29)}║`);
        console.log('╚══════════════════════════════════════════════╝');
    });
}

start().catch(e => {
    console.error('❌ Критическая ошибка:', e);
    process.exit(1);
});
