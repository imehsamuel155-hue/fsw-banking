const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
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

router.get('/demo', async (req, res) => {
    try {
        let user = await User.findOne({ isDemo: true });
        if (!user) {
            user = await User.create({
                name: 'Feng Harrson', email: 'demo@firstsmartwave.com', isDemo: true,
                accountNumber: '2100000100', balance: 2500, currency: 'EUR',
                cards: [
                    { type: 'Savings', number: '**** **** **** 4587', holder: 'Feng Harrson', expiry: '09/31' },
                    { type: 'Current', number: '**** **** **** 7812', holder: 'Feng Harrson', expiry: '11/31' },
                ],
            });
        }
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/', adminAuth, async (req, res) => {
    try {
        res.json(await User.find().sort({ createdAt: -1 }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', adminAuth, async (req, res) => {
    try {
        const allowed = [
            'name', 'accountNumber', 'email', 'phone', 'gender', 'dob', 'nationality', 'address',
            'balance', 'currency', 'status', 'kycStatus', 'accountType', 'branch', 'dateOpened',
            'profileImage', 'cards', 'autoReplyOn', 'goals',
        ];
        const updates = {};
        allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
