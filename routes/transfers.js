const express = require('express');
const Transfer = require('../models/Transfer');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const router = express.Router();

async function settings() {
    let s = await SiteSettings.findOne();
    if (!s) s = await SiteSettings.create({});
    let changed = false;
    if (!s.ticCode) { s.ticCode = '7766'; changed = true; }
    if (!s.taxCode) { s.taxCode = '8659'; changed = true; }
    if (changed) await s.save();
    return s;
}

/**
 * Per-account (MongoDB — all devices):
 * - Tax OFF + Pin ON  → Transfer pin → receipt
 * - Tax OFF + Pin OFF → receipt (no codes)
 * - Tax ON (Pin ON or OFF) → Transfer pin → Tax → receipt
 *   (when tax is on, pin step is always required first)
 */
function resolveNextGate(user) {
    const pinOn = user.transferPinEnabled !== false;
    const taxOn = user.taxCodeEnabled === true;

    if (taxOn) return 'tic';           // pin first, then tax after verify-tic
    if (pinOn) return 'tic';           // pin only → receipt
    return 'receipt';
}

router.post('/', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const amt = Number(amount);
        if (!userId) return res.status(400).json({ error: 'User required' });
        if (!amt || amt <= 0) return res.status(400).json({ error: 'Enter a valid amount' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (Number(user.balance) < amt) {
            return res.status(400).json({ error: 'Insufficient funds. Try again when you have funds.' });
        }

        const t = await Transfer.create({ ...req.body, amount: amt, status: 'pending' });
        const nextGate = resolveNextGate(user);
        const obj = t.toObject();
        obj.nextGate = nextGate;
        obj.completedTransfers = Number(user.completedTransfers || 0);
        obj.transferPinEnabled = user.transferPinEnabled !== false;
        obj.taxCodeEnabled = user.taxCodeEnabled === true;
        res.status(201).json(obj);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Transfer pin (tic-code.html) — code 7766
router.post('/:id/verify-tic', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Transfer not found' });
        if (t.status === 'completed') return res.json({ transfer: t });

        const code = String(req.body.ticCode || req.body.transferPin || '').trim();
        if (code !== '7766') {
            return res.status(400).json({ error: 'Invalid Transfer pin. Transfer not completed.' });
        }

        const user = await User.findById(t.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const taxOn = user.taxCodeEnabled === true;

        // Tax ON → after correct pin, go to tax (do NOT complete yet)
        if (taxOn) {
            return res.json({
                ok: true,
                needTax: true,
                nextGate: 'tax',
                message: 'Transfer pin correct. Enter Tax code next.',
            });
        }

        // Tax OFF → complete and print receipt
        if (Number(user.balance) < Number(t.amount)) {
            return res.status(400).json({ error: 'Insufficient funds. Try again when you have funds.' });
        }
        user.balance = Number(user.balance) - Number(t.amount);
        user.completedTransfers = Number(user.completedTransfers || 0) + 1;
        await user.save();
        t.status = 'completed';
        await t.save();

        res.json({
            transfer: t,
            newBalance: user.balance,
            completedTransfers: user.completedTransfers,
            nextGate: 'receipt',
            needTax: false,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tax code — 8659
router.post('/:id/verify-tax', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Transfer not found' });
        if (t.status === 'completed') return res.json({ transfer: t });

        const code = String(req.body.taxCode || '').trim();
        if (code !== '8659') {
            return res.status(400).json({ error: 'Invalid Tax code. Transfer not completed.' });
        }

        const user = await User.findById(t.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (Number(user.balance) < Number(t.amount)) {
            return res.status(400).json({ error: 'Insufficient funds. Try again when you have funds.' });
        }
        user.balance = Number(user.balance) - Number(t.amount);
        user.completedTransfers = Number(user.completedTransfers || 0) + 1;
        await user.save();
        t.status = 'completed';
        await t.save();

        res.json({
            transfer: t,
            newBalance: user.balance,
            completedTransfers: user.completedTransfers,
            nextGate: 'receipt',
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/user/:userId', async (req, res) => {
    try {
        const list = await Transfer.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Not found' });
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
