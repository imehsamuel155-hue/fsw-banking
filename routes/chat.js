const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
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
        req.admin = d;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid admin token' });
    }
}

function optionalCustomerAuth(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return next();
    try {
        const d = jwt.verify(token, JWT_SECRET);
        if (d.role === 'customer' && d.id) req.customerId = String(d.id);
    } catch (_) { }
    next();
}

function toOid(id) {
    try {
        if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
    } catch (_) { }
    return null;
}

// Admin clear
router.post('/admin/clear', adminAuth, async (req, res) => {
    try {
        const ids = req.body.userIds;
        if (!ids || ids === 'all') {
            await Chat.deleteMany({});
            return res.json({ ok: true, cleared: 'all' });
        }
        if (Array.isArray(ids) && ids.length) {
            const oids = ids.map(toOid).filter(Boolean);
            await Chat.deleteMany({ userId: { $in: oids } });
            return res.json({ ok: true, cleared: oids.length });
        }
        res.json({ ok: true, cleared: 0 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET messages for ONE user only.
 * - Customer JWT: can ONLY read their own userId (ignores path if mismatch)
 * - Admin JWT: can read the path userId
 * - No token: denied
 */
router.get('/:userId', optionalCustomerAuth, async (req, res) => {
    try {
        const h = req.headers.authorization || '';
        const token = h.startsWith('Bearer ') ? h.slice(7) : null;
        let isAdmin = false;
        let customerId = req.customerId || null;
        if (token) {
            try {
                const d = jwt.verify(token, JWT_SECRET);
                if (d.role === 'admin') isAdmin = true;
                if (d.role === 'customer' && d.id) customerId = String(d.id);
            } catch (_) { }
        }

        let target = String(req.params.userId || '');
        if (!isAdmin) {
            if (!customerId) return res.status(401).json({ error: 'Login required for chat' });
            // Force own thread only — never another customer's
            target = customerId;
        }
        const oid = toOid(target);
        if (!oid) return res.status(400).json({ error: 'Invalid user' });

        const msgs = await Chat.find({ userId: oid }).sort({ createdAt: 1 }).lean();
        res.json(msgs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:userId/mark-read', adminAuth, async (req, res) => {
    try {
        const oid = toOid(req.params.userId);
        if (!oid) return res.status(400).json({ error: 'Invalid user' });
        await Chat.updateMany(
            { userId: oid, sender: 'customer', readByAdmin: { $ne: true } },
            { $set: { readByAdmin: true } }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Customer posts ONLY into their own thread (JWT id) */
router.post('/:userId', optionalCustomerAuth, async (req, res) => {
    try {
        const h = req.headers.authorization || '';
        const token = h.startsWith('Bearer ') ? h.slice(7) : null;
        let customerId = req.customerId;
        if (token && !customerId) {
            try {
                const d = jwt.verify(token, JWT_SECRET);
                if (d.role === 'customer' && d.id) customerId = String(d.id);
            } catch (_) { }
        }
        // Prefer JWT over path — path is ignored for security
        const id = customerId || String(req.params.userId || '');
        const oid = toOid(id);
        if (!oid) return res.status(400).json({ error: 'Invalid user' });
        if (!customerId) return res.status(401).json({ error: 'Login required to chat' });

        const msg = await Chat.create({
            userId: oid,
            sender: 'customer',
            text: req.body.text || '',
            image: req.body.image || '',
            readByAdmin: false,
        });

        const user = await User.findById(oid);
        if (user && user.autoReplyOn !== false) {
            setTimeout(async () => {
                try {
                    const u2 = await User.findById(oid);
                    if (!u2 || u2.autoReplyOn === false) return;
                    await Chat.create({
                        userId: oid,
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

/** Admin reply ONLY to the userId in the path (must be selected conversation) */
router.post('/:userId/admin-reply', adminAuth, async (req, res) => {
    try {
        const oid = toOid(req.params.userId);
        if (!oid) return res.status(400).json({ error: 'Invalid user' });
        await User.findByIdAndUpdate(oid, { autoReplyOn: false });
        const msg = await Chat.create({
            userId: oid,
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
        const oid = toOid(req.params.userId);
        if (!oid) return res.status(400).json({ error: 'Invalid user' });
        await Chat.deleteMany({ userId: oid });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
