const express = require('express');
const Transfer = require('../models/Transfer');
const SiteSettings = require('../models/SiteSettings');
const router = express.Router();

async function settings() {
    let s = await SiteSettings.findOne();
    if (!s) s = await SiteSettings.create({});
    if (!s.ticCode) { s.ticCode = '7766'; await s.save(); }
    return s;
}

router.post('/', async (req, res) => {
    try {
        const t = await Transfer.create(req.body);
        res.status(201).json(t);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:id/verify-tic', async (req, res) => {
    try {
        const t = await Transfer.findById(req.params.id);
        if (!t) return res.status(404).json({ error: 'Transfer not found' });
        const s = await settings();
        const code = String(req.body.ticCode || '').trim();
        if (code !== String(s.ticCode || '7766')) {
            return res.status(400).json({ error: 'Invalid TIC code. Transfer not completed.' });
        }
        t.status = 'completed';
        await t.save();
        res.json(t);
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
