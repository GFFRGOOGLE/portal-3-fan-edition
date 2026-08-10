const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

module.exports = (io) => {
    global.io = io; // Сохраняем для использования в routes
    
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
        
        // Общий чат
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
        
        // Поддержка
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
};
