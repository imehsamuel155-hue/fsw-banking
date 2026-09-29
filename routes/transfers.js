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

function dropTextBlocked(user) {
    if (!user) return null;
    const on = user.dropTextEnabled === true || user.dropTextEnabled === 'true';
    if (!on) return null;
    const msg = (user.dropTextMessage && String(user.dropTextMessage).trim())
        ? String(user.dropTextMessage).trim()
        : 'Your account has been disabled due to suspicious activities from an unknown location. Please visit any of our branches for further assistance on how to resolve this issue.';
    return msg;
}

function resolveNextGate(user) {
    const pinOn = user.transferPinEnabled !== false && user.transferPinEnabled !== 'false';
    const taxOn = user.taxCodeEnabled === true || user.taxCodeEnabled === 'true';
    if (taxOn && !pinOn) return 'tax';
    if (pinOn && taxOn) return 'tic';
    if (pinOn) return 'tic';
    return 'receipt';
}

async function completeTransfer(t, user) {
    if (t.status === 'completed') {
        return { transfer: t, newBalance: user.balance, already: true };
    }
    const amt = Number(t.amount);
    if (Number(user.balance) < amt) {
        const err = new Error('Insufficient funds. Try again when you have funds.');
        err.status = 400;
        throw err;
    }
    user.balance = Number(user.balance) - amt;
    user.completedTransfers = Number(user.completedTransfers || 0) + 1;
    await user.save();
    t.status = 'completed';
    await t.save();
    return {
        transfer: t,
        newBalance: user.balance,
        completedTransfers: user.completedTransfers,
        nextGate: 'receipt',
    };
}

router.post('/', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const amt = Number(amount);
        if (!userId) return res.status(400).json({ error: 'User required' });
        if (!amt || amt <= 0) return res.status(400).json({ error: 'Enter a valid amount' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const dropMsg = dropTextBlocked(user);
        if (dropMsg) {
            return res.status(403).json({ error: dropMsg, dropTextBlocked: true, dropTextMessage: dropMsg });
        }

        if (Number(user.balance) < amt) {
            return res.status(400).json({ error: 'Insufficient funds. Try again when you have funds.' });
        }

        const t = await Transfer.create({
            ...req.body,
            amount: amt,
            status: 'pending',
            pinVerified: false,
        });
        const nextGate = resolveNextGate(user);

        if (nextGate === 'receipt') {
            const result = await completeTransfer(t, user);
            const obj = result.transfer.toObject();
            obj.nextGate = 'receipt';
            obj.newBalance = result.newBalance;
            obj.completedTransfers = result.completedTransfers;
            return res.status(201).json(obj);
        }

        const obj = t.toObject();
        obj.nextGate = nextGate;
        obj.completedTransfers = Number(user.completedTransfers || 0);
        obj.transferPinEnabled = user.transferPinEnabled !== false;
        obj.taxCodeEnabled = !!user.taxCodeEnabled;
        res.status(201).json(obj);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/:id/verify-tic', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Transfer not found' });
        if (t.status === 'completed') return res.json({ transfer: t, nextGate: 'receipt' });

        const user = await User.findById(t.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const dropMsg = dropTextBlocked(user);
        if (dropMsg) return res.status(403).json({ error: dropMsg, dropTextBlocked: true, dropTextMessage: dropMsg });

        const code = String(req.body.ticCode || req.body.pin || '').trim();
        const expectedPin = String(user.transferPin || '7766').trim();
        if (code !== expectedPin) {
            return res.status(400).json({ error: 'Invalid transfer pin. Transfer not completed.' });
        }

        const taxOn = user.taxCodeEnabled === true || user.taxCodeEnabled === 'true';
        t.pinVerified = true;
        await t.save();

        if (taxOn) {
            return res.json({
                transfer: t,
                nextGate: 'tax',
                message: 'Transfer pin OK. Enter tax code.',
            });
        }

        const result = await completeTransfer(t, user);
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/:id/verify-tax', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Transfer not found' });
        if (t.status === 'completed') return res.json({ transfer: t, nextGate: 'receipt' });

        const user = await User.findById(t.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const dropMsg = dropTextBlocked(user);
        if (dropMsg) return res.status(403).json({ error: dropMsg, dropTextBlocked: true, dropTextMessage: dropMsg });

        const code = String(req.body.taxCode || '').trim();
        const expectedTax = String(user.taxCodePin || '8659').trim();
        if (code !== expectedTax) {
            return res.status(400).json({ error: 'Invalid Tax code. Transfer not completed.' });
        }

        const pinOn = user.transferPinEnabled !== false && user.transferPinEnabled !== 'false';
        if (pinOn && !t.pinVerified) {
            return res.status(400).json({ error: 'Enter transfer pin first.' });
        }

        const result = await completeTransfer(t, user);
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/:id/complete', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Transfer not found' });
        const user = await User.findById(t.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const result = await completeTransfer(t, user);
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
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

router.get('/single/:id', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Not found' });
        if (t.status !== 'completed') {
            return res.status(403).json({ error: 'Receipt only available after a completed transfer.' });
        }
        res.json(t);
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