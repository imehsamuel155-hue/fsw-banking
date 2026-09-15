const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
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
                approved: true, approvalStatus: 'approved',
                accountNumber: '2100000100', balance: 2500, currency: 'EUR',
                cards: [
                    { type: 'Savings', number: '**** **** **** 1457', holder: 'Feng Harrson', expiry: '09/31' },
                    { type: 'Current', number: '**** **** **** 8976', holder: 'Feng Harrson', expiry: '11/31' },
                ],
            });
        } else if (!user.approved) {
            user.approved = true;
            user.approvalStatus = 'approved';
            await user.save();
        }
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/register-profile', async (req, res) => {
    try {
        const b = req.body || {};
        const username = String(b.username || '').trim();
        const password = String(b.password || '');
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
        if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

        // Case-insensitive: jamesfeng === Jamesfeng === JAMESFENG
        const unameLower = username.toLowerCase();
        const clash = await User.findOne({
            username: { $regex: new RegExp('^' + unameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
        });
        if (clash) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        // Also block the global customer login username from SiteSettings
        try {
            const SiteSettings = require('../models/SiteSettings');
            const s = await SiteSettings.findOne();
            if (s && String(s.customerUsername || '').toLowerCase() === unameLower) {
                return res.status(400).json({ error: 'Username already taken' });
            }
        } catch (_) { }

        const accNum = b.accountNumber || ('21' + String(Date.now()).slice(-8));
        const holder = b.cardHolder || b.name || 'Customer';
        function fmtExpiry(ym) {
            if (!ym) return '12/30';
            const s = String(ym).trim();
            if (/^\d{2}\/\d{2}$/.test(s)) return s;
            const p = s.split('-');
            if (p.length >= 2) return p[1] + '/' + String(p[0]).slice(-2);
            return s;
        }
        function last4(v) {
            const d = String(v || '').replace(/\D/g, '').slice(-4);
            return d.padStart(4, '0');
        }
        // Prefer full cards[] from client; else last-4 fields; else cardNumber1/2
        let cards;
        if (Array.isArray(b.cards) && b.cards.length >= 1) {
            cards = b.cards.slice(0, 2).map((c, i) => ({
                type: (c && c.type) || (i === 0 ? 'Savings' : 'Current'),
                number: (c && c.number) || ('**** **** **** ' + last4(b['cardLast4_' + (i + 1)] || b['cardNumber' + (i + 1)])),
                holder: (c && c.holder) || holder,
                expiry: fmtExpiry((c && c.expiry) || b['cardExpiry' + (i + 1)]),
            }));
            while (cards.length < 2) {
                const i = cards.length;
                cards.push({
                    type: i === 0 ? 'Savings' : 'Current',
                    number: '**** **** **** ' + last4(b['cardLast4_' + (i + 1)]),
                    holder,
                    expiry: fmtExpiry(b['cardExpiry' + (i + 1)]),
                });
            }
        } else {
            cards = [
                {
                    type: 'Savings',
                    number: b.cardNumber1 || ('**** **** **** ' + last4(b.cardLast4_1)),
                    holder,
                    expiry: fmtExpiry(b.cardExpiry1),
                },
                {
                    type: 'Current',
                    number: b.cardNumber2 || ('**** **** **** ' + last4(b.cardLast4_2)),
                    holder,
                    expiry: fmtExpiry(b.cardExpiry2),
                },
            ];
        }
        const user = await User.create({
            name: b.name || 'New Customer',
            email: b.email || '',
            username,
            password,
            phone: b.phone || '',
            gender: b.gender || '',
            dob: b.dob || '',
            nationality: b.nationality || '',
            address: b.address || '',
            accountNumber: accNum,
            balance: Number(b.balance) || 0,
            currency: b.currency || 'EUR',
            status: b.status || 'Active',
            kycStatus: b.kycStatus || 'Verified',
            accountType: b.accountType || 'Savings Account',
            branch: b.branch || '',
            dateOpened: b.dateOpened || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
            cards,
            bills: Array.isArray(b.bills) && b.bills.length ? b.bills : undefined,
            goals: (b.goals && typeof b.goals === 'object') ? {
                emergencySaved: Number(b.goals.emergencySaved) || Number(b.emergencySaved) || 0,
                emergencyTarget: Number(b.goals.emergencyTarget) || Number(b.emergencyTarget) || 0,
                emergencyPct: Number(b.goals.emergencyPct) || Number(b.emergencyPct) || 0,
                investmentSaved: Number(b.goals.investmentSaved) || Number(b.investmentSaved) || 0,
                investmentTarget: Number(b.goals.investmentTarget) || Number(b.investmentTarget) || 0,
                investmentPct: Number(b.goals.investmentPct) || Number(b.investmentPct) || 0,
            } : {
                emergencySaved: Number(b.emergencySaved) || 0,
                emergencyTarget: Number(b.emergencyTarget) || 0,
                emergencyPct: Number(b.emergencyPct) || 0,
                investmentSaved: Number(b.investmentSaved) || 0,
                investmentTarget: Number(b.investmentTarget) || 0,
                investmentPct: Number(b.investmentPct) || 0,
            },
            isDemo: false,
            approved: false,
            loginPin: String(b.loginPin || '5566').trim().slice(0, 8) || '5566',
            transferPin: String(b.transferPin || '7766').trim().slice(0, 8) || '7766',
            taxCodePin: String(b.taxCodePin || '8659').trim().slice(0, 8) || '8659',
            approvalStatus: 'pending',
            profileImage: b.profileImage || '',
            autoReplyOn: true,
        });
        res.status(201).json({
            message: 'Profile submitted. Waiting for admin approval before login works.',
            userId: user._id,
            username: user.username,
            approvalStatus: user.approvalStatus,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/pending/list', adminAuth, async (req, res) => {
    try {
        const list = await User.find({
            isDemo: { $ne: true },
            $or: [{ approvalStatus: 'pending' }, { approved: false }],
        }).sort({ createdAt: -1 });
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


router.get('/admin/manage-list', adminAuth, async (req, res) => {
    try {
        const list = await User.find({ isDemo: { $ne: true } }).sort({ createdAt: -1 });
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/admin/all-customers', adminAuth, async (req, res) => {
    try {
        const list = await User.find({})
            .sort({ createdAt: -1 })
            .select('name username accountNumber balance currency approved approvalStatus isDemo status createdAt loginPin transferPin taxCodePin');
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Conversations summary for admin chat switcher
router.get('/admin/conversations', adminAuth, async (req, res) => {
    try {
        const users = await User.find({}).select('name username accountNumber isDemo approved approvalStatus');
        const out = [];
        for (const u of users) {
            const count = await Chat.countDocuments({ userId: u._id });
            const unread = await Chat.countDocuments({ userId: u._id, sender: 'customer', readByAdmin: { $ne: true } });
            const last = await Chat.findOne({ userId: u._id }).sort({ createdAt: -1 });
            // Always show if they have messages OR are approved/demo
            if (count === 0 && !(u.approved || u.isDemo)) continue;
            out.push({
                userId: u._id,
                name: u.name || 'Customer',
                username: u.username || '',
                accountNumber: u.accountNumber || '',
                isDemo: !!u.isDemo,
                approved: !!u.approved,
                messageCount: count,
                unreadCount: unread,
                lastMessage: last ? (last.text || (last.image ? '[Photo]' : '')) : '',
                lastSender: last ? last.sender : '',
                lastAt: last ? last.createdAt : null,
                unreadHint: !!(last && last.sender === 'customer'),
            });
        }
        out.sort((a, b) => {
            const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
            const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
            return tb - ta;
        });
        res.json(out);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


router.post('/:id/approve', adminAuth, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { approved: true, approvalStatus: 'approved', status: 'Active' },
            { new: true }
        );
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.isDemo) return res.status(400).json({ error: 'Cannot delete the demo account' });
        await Chat.deleteMany({ userId: user._id });
        await User.findByIdAndDelete(req.params.id);
        res.json({ ok: true, deleted: req.params.id });
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
            'profileImage', 'cards', 'autoReplyOn', 'goals', 'bills', 'username', 'password', 'transferMode', 'completedTransfers', 'loginPin', 'transferPin', 'taxCodePin', 'transferPinEnabled', 'taxCodeEnabled', 'dropTextEnabled', 'dropTextMessage', 'autoReplyOn',
            'approved', 'approvalStatus', 'loginLocked',
        ];
        const updates = {};
        allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
        const existingU = await User.findById(req.params.id);
        if (existingU) {
            // Permanent credentials — never change username/password after create
            delete updates.username;
            delete updates.password;
        }
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
