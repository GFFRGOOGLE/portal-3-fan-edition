const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/messages', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(global.db.messages.slice(-limit));
});

router.post('/messages', auth, (req, res) => {
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
    
    // Отправляем через WebSocket всем подключённым
    if (global.io) global.io.emit('new_message', message);
    
    res.json(message);
});

router.delete('/messages', auth, auth.adminOnly, (req, res) => {
    global.db.messages = [];
    if (global.io) global.io.emit('messages_cleared');
    res.json({ success: true });
});

router.post('/ban', auth, auth.adminOnly, (req, res) => {
    global.db.bannedUsers.add(req.body.userId);
    res.json({ success: true });
});

module.exports = router;
