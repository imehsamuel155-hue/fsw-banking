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

        // Real accounts only — match username OR email
        const allUsers = await User.find({ isDemo: { $ne: true } });
        const key = username.toLowerCase();
        const user = allUsers.find((u) => {
            const un = String(u.username || '').toLowerCase();
            const em = String(u.email || '').toLowerCase();
            return un === key || (em && em === key);
        });
        if (user && String(user.password) === password) {
            if (!user.approved) {
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
// Customer login PIN — per account (default 5566)
router.post('/verify-pin', async (req, res) => {
    try {
        const pin = String(req.body.pin || '').trim();
        const userId = req.body.userId || req.body.loginTicket;
        let expected = '5566';
        if (userId) {
            const User = require('../models/User');
            const user = await User.findById(userId);
            if (user && user.loginPin) expected = String(user.loginPin).trim();
        }
        if (pin !== expected) {
            return res.status(401).json({ valid: false, error: 'Incorrect PIN' });
        }
        res.json({ valid: true, ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/set-pin', (req, res) => {
    res.status(403).json({ error: 'PIN is managed by the bank. Use your assigned PIN (default 5566).' });
});


router.post('/forgot-password', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Enter a valid email address' });
        }
        const User = require('../models/User');
        const user = await User.findOne({
            email: { $regex: new RegExp('^' + email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
            isDemo: { $ne: true },
        });
        // Always same message (don't reveal if email exists)
        if (!user) {
            return res.json({ ok: true, message: 'If this email is registered, a 6-digit code was sent.' });
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        user.resetCode = code;
        user.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
        await user.save();
        console.log('[FSW reset code]', email, code);
        // No SMTP configured: code is logged on server. Client still follows normal flow.
        res.json({
            ok: true,
            message: 'If this email is registered, a 6-digit code was sent.',
            // Exposed so you can test without email until SMTP is added
            debugCode: code,
        });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to send code' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const code = String(req.body.code || '').trim();
        const newPassword = String(req.body.newPassword || req.body.password || '');
        if (!email || !code || code.length !== 6) {
            return res.status(400).json({ error: 'Email and 6-digit code required' });
        }
        if (newPassword.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }
        const User = require('../models/User');
        const user = await User.findOne({
            email: { $regex: new RegExp('^' + email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
            isDemo: { $ne: true },
        });
        if (!user || !user.resetCode || String(user.resetCode) !== code) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }
        if (user.resetCodeExpires && new Date(user.resetCodeExpires) < new Date()) {
            return res.status(400).json({ error: 'Code expired. Request a new one.' });
        }
        user.password = newPassword;
        user.resetCode = '';
        user.resetCodeExpires = null;
        await user.save();
        res.json({ ok: true, message: 'Password updated. You can sign in now.' });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Reset failed' });
    }
});


module.exports = router;
