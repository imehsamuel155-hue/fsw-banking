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


// Broadcast admin message to ALL customers (when no conversation selected)
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
            });
            created.push(msg);
            await User.findByIdAndUpdate(u._id, { autoReplyOn: false });
        }
        res.status(201).json({ ok: true, count: created.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Clear chats: body.userIds = [] for all, or list of ids
router.post('/admin/clear', adminAuth, async (req, res) => {
    try {
        const ids = req.body.userIds;
        if (!ids || ids === 'all') {
            await Chat.deleteMany({});
            return res.json({ ok: true, cleared: 'all' });
        }
        const list = Array.isArray(ids) ? ids : [ids];
        await Chat.deleteMany({ userId: { $in: list } });
        res.json({ ok: true, cleared: list });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


router.get('/:userId', async (req, res) => {
    try {
        res.json(await Chat.find({ userId: req.params.userId }).sort({ createdAt: 1 }));
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
        });
        const user = await User.findById(req.params.userId);
        // Auto-reply only if enabled AND no admin message yet in thread (or still on)
        if (user && user.autoReplyOn !== false) {
            const adminCount = await Chat.countDocuments({ userId: req.params.userId, sender: 'admin' });
            // If admin has taken over (sent real replies beyond auto), still respect toggle
            if (user.autoReplyOn) {
                setTimeout(async () => {
                    try {
                        // re-check autoReplyOn
                        const u2 = await User.findById(req.params.userId);
                        if (!u2 || u2.autoReplyOn === false) return;
                        await Chat.create({
                            userId: req.params.userId,
                            sender: 'admin',
                            text: 'Thanks for your message. A support agent will assist you shortly.',
                        });
                    } catch (_) { }
                }, 1200);
            }
        }
        res.status(201).json(msg);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:userId/admin-reply', adminAuth, async (req, res) => {
    try {
        // When admin replies, turn off auto-reply for that user
        await User.findByIdAndUpdate(req.params.userId, { autoReplyOn: false });
        const msg = await Chat.create({
            userId: req.params.userId,
            sender: 'admin',
            text: req.body.text || '',
            image: req.body.image || '',
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
