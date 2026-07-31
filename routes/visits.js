const express = require('express');
const jwt = require('jsonwebtoken');
const Visit = require('../models/Visit');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fsw_secret_change_me_in_production';

function adminAuth(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Admin token required' });
    try {
        const d = jwt.verify(token, JWT_SECRET);
        if (d.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid admin token' });
    }
}

router.post('/', async (req, res) => {
    try {
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
        const v = await Visit.create({
            page: req.body.page || 'Unknown',
            ip,
            country: req.body.country || req.headers['cf-ipcountry'] || 'Unknown',
            city: req.body.city || '',
            userAgent: req.headers['user-agent'] || '',
        });
        res.status(201).json(v);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/', adminAuth, async (req, res) => {
    try {
        res.json(await Visit.find().sort({ createdAt: -1 }).limit(100));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
