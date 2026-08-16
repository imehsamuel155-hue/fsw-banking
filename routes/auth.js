const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const LoginLog = require('../models/LoginLog');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fsw_secret_change_me_in_production';

const DEFAULT_CUSTOMER_PIN = '5566';
const DEFAULT_TIC = '7766';
const DEFAULT_ADMIN_PIN = '4422';

async function settings() {
    let s = await SiteSettings.findOne();
    if (!s) {
        s = await SiteSettings.create({
            adminUsername: 'admin',
            adminPassword: 'admin123',
            adminPin: DEFAULT_ADMIN_PIN,
            customerUsername: 'customer',
            customerPassword: 'pass1234',
            customerPin: DEFAULT_CUSTOMER_PIN,
            ticCode: DEFAULT_TIC,
        });
        return s;
    }
    let changed = false;
    if (!s.customerPin || String(s.customerPin).trim() === '') {
        s.customerPin = DEFAULT_CUSTOMER_PIN;
        changed = true;
    }
    if (!s.ticCode || String(s.ticCode).trim() === '') {
        s.ticCode = DEFAULT_TIC;
        changed = true;
    }
    if (!s.adminPin || String(s.adminPin).trim() === '') {
        s.adminPin = DEFAULT_ADMIN_PIN;
        changed = true;
    }
    if (!s.settingsPin || String(s.settingsPin).trim() === '') {
        s.settingsPin = '7799';
        changed = true;
    }
    if (changed) await s.save();
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
            approved: true,
            approvalStatus: 'approved',
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
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');
        const s = await settings();
        const m = meta(req);

        // Global kill switch from admin — blocks ALL customer logins
        if (s.loginsBlocked) {
            await LoginLog.create({ type: 'customer', username: username || '—', success: false, ...m });
            return res.status(403).json({
                error: 'ACCOUNT SUSPENDED DUE TO LOGIN FROM UNAPPROVED LOCATION',
                code: 'LOGINS_BLOCKED',
            });
        }

        // 1) Global / demo credentials from SiteSettings
        if (username === String(s.customerUsername) && password === String(s.customerPassword)) {
            await LoginLog.create({ type: 'customer', username, success: true, ...m });
            const user = await ensureDemo(s);
            if (!user.approved) {
                user.approved = true;
                user.approvalStatus = 'approved';
                await user.save();
            }
            const token = jwt.sign({ id: user._id, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ userId: String(user._id), token, name: user.name, username: user.username || username });
        }

        // 2) Profile created via /addmoreprofile (must be approved)
        const allUsers = await User.find({ isDemo: { $ne: true } });
        const user = allUsers.find(u => String(u.username || '').toLowerCase() === username.toLowerCase());
        if (user && String(user.password) === password) {
            if (!user.approved && !user.isDemo) {
                await LoginLog.create({ type: 'customer', username, success: false, ...m });
                return res.status(403).json({ error: 'Account pending admin approval. Please wait.' });
            }
            if (user.loginLocked) {
                await LoginLog.create({ type: 'customer', username, success: false, ...m });
                return res.status(403).json({
                    error: 'ACCOUNT SUSPENDED DUE TO LOGIN FROM UNAPPROVED LOCATION',
                    code: 'ACCOUNT_LOCKED',
                });
            }
            await LoginLog.create({ type: 'customer', username, success: true, ...m });
            const token = jwt.sign({ id: user._id, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ userId: String(user._id), token, name: user.name, username: user.username || username });
        }

        await LoginLog.create({ type: 'customer', username, success: false, ...m });
        return res.status(401).json({ error: 'Invalid username or password' });
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
        const ok = String(username).trim() === String(s.adminUsername) && String(password) === String(s.adminPassword);
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
        const entered = String(req.body.pin || '').trim();
        const expected = String(s.adminPin || DEFAULT_ADMIN_PIN).trim();
        res.json({ valid: entered === expected });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Customer PIN — always 5566 unless changed in Admin → Security
router.post('/verify-pin', async (req, res) => {
    try {
        const entered = String(req.body.pin || '').trim();
        if (!entered || entered.length !== 4) {
            return res.json({ valid: false, error: 'Enter a 4-digit PIN' });
        }
        const s = await settings();
        const expected = String(s.customerPin || DEFAULT_CUSTOMER_PIN).trim();
        const valid = entered === expected;
        console.log('[PIN check] entered:', entered, 'expected:', expected, 'valid:', valid);
        res.json({ valid });
    } catch (e) {
        console.error('[PIN]', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/set-pin', (req, res) => {
    res.status(403).json({ error: 'PIN is managed by the bank. Use your assigned PIN (default 5566).' });
});

module.exports = router;
