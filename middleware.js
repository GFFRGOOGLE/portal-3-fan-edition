const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'portal3-secret-key-2026-super-secure';

module.exports = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Нет токена' });
    
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        res.status(401).json({ error: 'Неверный токен' });
    }
};

module.exports.adminOnly = (req, res, next) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Нет прав администратора' });
    next();
};

module.exports.JWT_SECRET = JWT_SECRET;
