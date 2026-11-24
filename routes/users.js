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

/** Demo accounts removed — do not create or return Feng / demo data */
router.get('/demo', async (req, res) => {
    res.status(404).json({ error: 'Demo account removed. Use a real approved profile.' });
});

/** One-shot: permanently delete all isDemo users from the database */
router.post('/purge-demo', adminAuth, async (req, res) => {
    try {
        const demos = await User.find({ isDemo: true }).select('_id');
        const ids = demos.map((d) => d._id);
        if (ids.length) {
            await Chat.deleteMany({ userId: { $in: ids } });
            await User.deleteMany({ isDemo: true });
        }
        res.json({ ok: true, deleted: ids.length });
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
            email: String(b.email || '').trim().toLowerCase(),
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
        // Never send profileImage / cards blobs in list — that made admin dropdown/switch hang
        const list = await User.find({ isDemo: { $ne: true } })
            .sort({ createdAt: -1 })
            .select('-profileImage -cards -goals -bills -password')
            .lean();
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
        // One aggregation instead of 3 queries per user (was very slow with many accounts)
        const Chat = require('../models/Chat');
        const rows = await Chat.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$userId',
                    messageCount: { $sum: 1 },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ['$sender', 'customer'] }, { $ne: ['$readByAdmin', true] }] },
                                1,
                                0,
                            ],
                        },
                    },
                    lastText: { $first: '$text' },
                    lastImage: { $first: '$image' },
                    lastSender: { $first: '$sender' },
                    lastAt: { $first: '$createdAt' },
                },
            },
            { $sort: { lastAt: -1 } },
            { $limit: 300 },
        ]);

        const ids = rows.map((r) => r._id).filter(Boolean);
        const users = await User.find({
            $or: [
                { _id: { $in: ids } },
                { approved: true },
                { isDemo: true },
            ],
        })
            .select('name username accountNumber isDemo approved approvalStatus')
            .lean();

        const byId = new Map(users.map((x) => [String(x._id), x]));
        const chatBy = new Map(rows.map((r) => [String(r._id), r]));
        const out = [];
        const seen = new Set();

        for (const r of rows) {
            const id = String(r._id);
            const u = byId.get(id);
            if (!u) continue;
            seen.add(id);
            const lastMessage = (r.lastText && String(r.lastText).trim())
                ? String(r.lastText).slice(0, 120)
                : (r.lastImage ? '[Photo]' : '');
            out.push({
                userId: u._id,
                name: u.name || 'Customer',
                username: u.username || '',
                accountNumber: u.accountNumber || '',
                isDemo: !!u.isDemo,
                approved: !!u.approved,
                messageCount: r.messageCount || 0,
                unreadCount: r.unreadCount || 0,
                lastMessage,
                lastSender: r.lastSender || '',
                lastAt: r.lastAt || null,
                unreadHint: r.lastSender === 'customer',
            });
        }
        // Approved/demo with no messages yet still appear at the end
        for (const u of users) {
            const id = String(u._id);
            if (seen.has(id)) continue;
            if (!(u.approved || u.isDemo)) continue;
            out.push({
                userId: u._id,
                name: u.name || 'Customer',
                username: u.username || '',
                accountNumber: u.accountNumber || '',
                isDemo: !!u.isDemo,
                approved: !!u.approved,
                messageCount: 0,
                unreadCount: 0,
                lastMessage: '',
                lastSender: '',
                lastAt: null,
                unreadHint: false,
            });
        }
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
        await Chat.deleteMany({ userId: user._id });
        await User.findByIdAndDelete(req.params.id);
        res.json({ ok: true, deleted: req.params.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        // ?light=1 skips huge profileImage base64 (fast account switch / chat header)
        const light = String(req.query.light || '') === '1';
        let q = User.findById(req.params.id);
        if (light) q = q.select('-profileImage');
        const user = await q.lean();
        if (!user) return res.status(404).json({ error: 'User not found' });

        const obj = user;
        if (!obj.isDemo && Array.isArray(obj.cards) && obj.name) {
            obj.cards = obj.cards.map((c, i) => {
                const card = c && typeof c === 'object' ? { ...c } : {};
                if (!card.holder || card.holder === 'Feng Harrson') {
                    card.holder = obj.name;
                }
                if (!card.type) card.type = i === 0 ? 'Savings' : 'Current';
                return card;
            });
        }
        res.json(obj);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/', adminAuth, async (req, res) => {
    try {
        res.json(
            await User.find()
                .sort({ createdAt: -1 })
                .select('-profileImage -cards -goals -bills -password')
                .lean()
        );
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
        if (updates.email !== undefined) updates.email = String(updates.email || '').trim().toLowerCase();
        const existingU = await User.findById(req.params.id);
        if (existingU) {
            // Username stays permanent; password can be updated by admin
            delete updates.username;
            if (updates.password !== undefined) {
                const p = String(updates.password || '');
                if (!p) delete updates.password;
                else if (p.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
            }
        }
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
            .select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        const obj = user.toObject ? user.toObject() : user;
        // If client did not send a new image, omit huge base64 from response to speed admin saves
        if (updates.profileImage === undefined && obj.profileImage && String(obj.profileImage).length > 5000) {
            obj.profileImage = '[stored]';
        }
        res.json(obj);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
