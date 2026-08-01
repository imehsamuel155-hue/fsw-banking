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

// Create pending transfer — check balance first
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
        res.status(201).json(t);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Verify TIC only — does NOT complete transfer yet
router.post('/:id/verify-tic', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Transfer not found' });
        if (t.status === 'completed') return res.json(t);

        const s = await settings();
        const code = String(req.body.ticCode || '').trim();
        if (code !== String(s.ticCode || '7766')) {
            return res.status(400).json({ error: 'Invalid TIC code. Transfer not completed.' });
        }
        t.status = 'tic_verified';
        await t.save();
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Verify Tax code — then deduct balance and complete
router.post('/:id/verify-tax', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Transfer not found' });
        if (t.status === 'completed') return res.json(t);

        const s = await settings();
        const code = String(req.body.taxCode || '').trim();
        if (code !== String(s.taxCode || '8659')) {
            return res.status(400).json({ error: 'Invalid Tax code. Transfer not completed.' });
        }

        const user = await User.findById(t.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (Number(user.balance) < Number(t.amount)) {
            t.status = 'failed';
            await t.save();
            return res.status(400).json({ error: 'Insufficient funds. Try again when you have funds.' });
        }

        user.balance = Number(user.balance) - Number(t.amount);
        await user.save();

        t.status = 'completed';
        await t.save();
        res.json({ transfer: t, newBalance: user.balance });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/single/:id', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Not found' });
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
