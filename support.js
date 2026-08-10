const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/conversation', auth, (req, res) => {
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

router.post('/message', auth, (req, res) => {
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
    
    // Уведомить админов
    if (global.io) global.io.emit('support_update', { convId, needsAdmin: true });
    
    res.json(message);
});

router.get('/conversations', auth, auth.adminOnly, (req, res) => {
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

router.post('/reply', auth, auth.adminOnly, (req, res) => {
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
    
    // Отправить в комнату диалога
    if (global.io) global.io.to(convId).emit('new_support_message', message);
    
    res.json(message);
});

module.exports = router;
