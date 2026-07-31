const express = require('express');
const Deposit = require('../models/Deposit');
const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const d = await Deposit.create(req.body);
        res.status(201).json(d);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:userId', async (req, res) => {
    try {
        res.json(await Deposit.find({ userId: req.params.userId }).sort({ createdAt: -1 }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
