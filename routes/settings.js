const express = require('express');
const jwt = require('jsonwebtoken');
const SiteSettings = require('../models/SiteSettings');
const LoginLog = require('../models/LoginLog');
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

async function getS() {
    let s = await SiteSettings.findOne();
    if (!s) s = await SiteSettings.create({});
    return s;
}

/** Public — used by login page (no token) */
router.get('/public-status', async (req, res) => {
    try {
        const s = await getS();
        res.json({ loginsBlocked: !!s.loginsBlocked });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/', adminAuth, async (req, res) => {
    try {
        const s = await getS();
        res.json({
            adminUsername: s.adminUsername,
            adminPassword: s.adminPassword,
            adminPin: s.adminPin,
            customerUsername: s.customerUsername,
            customerPassword: s.customerPassword,
            customerPin: s.customerPin || '5566',
            ticCode: s.ticCode || '7766',
            loginsBlocked: !!s.loginsBlocked,
            settingsPin: s.settingsPin || '7799',
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/', adminAuth, async (req, res) => {
    try {
        const s = await getS();
        ['adminUsername', 'adminPassword', 'adminPin', 'customerUsername', 'customerPassword', 'customerPin', 'ticCode', 'settingsPin'].forEach((k) => {
            if (req.body[k] !== undefined && String(req.body[k]).trim() !== '') s[k] = String(req.body[k]).trim();
        });
        if (req.body.loginsBlocked !== undefined) {
            s.loginsBlocked = req.body.loginsBlocked === true || req.body.loginsBlocked === 'true' || req.body.loginsBlocked === 1;
        }
        if (s.adminPin && String(s.adminPin).length !== 4) return res.status(400).json({ error: 'Admin PIN must be 4 digits' });
        if (s.customerPin && String(s.customerPin).length !== 4) return res.status(400).json({ error: 'Customer PIN must be 4 digits' });
        await s.save();
        res.json({ success: true, ...s.toObject() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/login-logs', adminAuth, async (req, res) => {
    try {
        res.json(await LoginLog.find().sort({ createdAt: -1 }).limit(100));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/login-logs', adminAuth, async (req, res) => {
    try {
        await LoginLog.deleteMany({});
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/login-logs/:id', adminAuth, async (req, res) => {
    try {
        await LoginLog.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
