const express = require('express');
const jwt = require('jsonwebtoken');
const Chat = require('../models/Chat');
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

// Broadcast (only when admin explicitly chooses — do not use for normal replies)
router.post('/admin/broadcast', adminAuth, async (req, res) => {
    try {
        const users = await User.find({ $or: [{ approved: true }, { isDemo: true }] });
        const created = [];
        for (const u of users) {
            const msg = await Chat.create({
                userId: u._id,
                sender: 'admin',
                text: req.body.text || '',
                image: req.body.image || '',
                readByCustomer: false,
            });
            created.push(msg);
            await User.findByIdAndUpdate(u._id, { autoReplyOn: false });
        }
        res.status(201).json({ ok: true, count: created.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/admin/clear', adminAuth, async (req, res) => {
    try {
        const ids = req.body.userIds;
        if (!ids || ids === 'all') {
            await Chat.deleteMany({});
            return res.json({ ok: true, cleared: 'all' });
        }
        if (Array.isArray(ids) && ids.length) {
            await Chat.deleteMany({ userId: { $in: ids } });
            return res.json({ ok: true, cleared: ids.length });
        }
        res.json({ ok: true, cleared: 0 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Messages for ONE user only — never mixed with other accounts */
router.get('/:userId', async (req, res) => {
    try {
        res.json(await Chat.find({ userId: req.params.userId }).sort({ createdAt: 1 }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin opens a conversation → clear unread (1) for that user only */
router.post('/:userId/mark-read', adminAuth, async (req, res) => {
    try {
        await Chat.updateMany(
            { userId: req.params.userId, sender: 'customer', readByAdmin: { $ne: true } },
            { $set: { readByAdmin: true } }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:userId', async (req, res) => {
    try {
        const msg = await Chat.create({
            userId: req.params.userId,
            sender: 'customer',
            text: req.body.text || '',
            image: req.body.image || '',
            readByAdmin: false,
        });
        const user = await User.findById(req.params.userId);
        if (user && user.autoReplyOn !== false) {
            setTimeout(async () => {
                try {
                    const u2 = await User.findById(req.params.userId);
                    if (!u2 || u2.autoReplyOn === false) return;
                    await Chat.create({
                        userId: req.params.userId,
                        sender: 'admin',
                        text: 'Thanks for your message. A support agent will assist you shortly.',
                        readByCustomer: false,
                    });
                } catch (_) { }
            }, 1200);
        }
        res.status(201).json(msg);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin reply goes ONLY to this userId */
router.post('/:userId/admin-reply', adminAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { autoReplyOn: false });
        const msg = await Chat.create({
            userId: req.params.userId,
            sender: 'admin',
            text: req.body.text || '',
            image: req.body.image || '',
            readByCustomer: false,
        });
        res.status(201).json(msg);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:userId', adminAuth, async (req, res) => {
    try {
        await Chat.deleteMany({ userId: req.params.userId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
