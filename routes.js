const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

const ADMIN_EMAILS = ['gffrgoogle.com@gmail.com', 'portal3.fanedition.support@gmail.com'];

router.post('/register', async (req, res) => {
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

router.post('/login', async (req, res) => {
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

router.get('/me', (req, res) => {
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

module.exports = router;
