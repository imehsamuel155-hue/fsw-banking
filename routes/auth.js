const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const LoginLog = require('../models/LoginLog');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fsw_secret_change_me_in_production';

async function settings() {
    let s = await SiteSettings.findOne();
    if (!s) s = await SiteSettings.create({});
    // ensure new fields exist on old docs
    if (!s.customerPin) s.customerPin = '5566';
    if (!s.ticCode) s.ticCode = '7766';
    await s.save();
    return s;
}

function meta(req) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    return {
        ip,
        userAgent: req.headers['user-agent'] || '',
        country: req.body.country || req.headers['cf-ipcountry'] || 'Unknown',
        city: req.body.city || '',
    };
}

async function ensureDemo(s) {
    let user = await User.findOne({ isDemo: true });
    if (!user) {
        user = await User.create({
            name: 'Feng Harrson',
            email: 'demo@firstsmartwave.com',
            username: s.customerUsername,
            password: s.customerPassword,
            accountNumber: '2100000100',
            balance: 2500,
            currency: 'EUR',
            isDemo: true,
            phone: '+1 202 555 0123',
            gender: 'Male',
            dob: '12 January 1994',
            nationality: 'United States',
            address: '24 Wall Street, New York, USA',
            cards: [
                { type: 'Savings', number: '**** **** **** 4587', holder: 'Feng Harrson', expiry: '09/31' },
                { type: 'Current', number: '**** **** **** 7812', holder: 'Feng Harrson', expiry: '11/31' },
            ],
        });
    }
    return user;
}

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const s = await settings();
        const m = meta(req);
        const ok = username === s.customerUsername && password === s.customerPassword;
        await LoginLog.create({ type: 'customer', username: username || '', success: !!ok, ...m });
        if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
        const user = await ensureDemo(s);
        const token = jwt.sign({ id: user._id, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ userId: user._id, token, name: user.name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/signup', (req, res) => {
    res.status(503).json({ error: 'Server busy, try again later.' });
});

router.post('/admin-login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const s = await settings();
        const m = meta(req);
        const ok = username === s.adminUsername && password === s.adminPassword;
        await LoginLog.create({ type: 'admin', username: username || '', success: !!ok, ...m });
        if (!ok) return res.status(401).json({ error: 'Incorrect username or password' });
        const token = jwt.sign({ id: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/admin-verify-pin', async (req, res) => {
    try {
        const s = await settings();
        res.json({ valid: String(req.body.pin) === String(s.adminPin) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Customer PIN fixed from SiteSettings (default 5566)
router.post('/verify-pin', async (req, res) => {
    try {
        const { userId, pin } = req.body;
        if (!userId) return res.status(400).json({ error: 'User required' });
        const s = await settings();
        const valid = String(pin) === String(s.customerPin || '5566');
        if (!valid) return res.json({ valid: false });
        res.json({ valid: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/set-pin', async (req, res) => {
    // Disallow free PIN set — only admin can change customerPin via settings
    res.status(403).json({ error: 'PIN is managed by the bank. Use your assigned PIN.' });
});

module.exports = router;
