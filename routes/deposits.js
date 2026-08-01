const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
    res.status(403).json({ error: 'Deposits are temporarily restricted to protect your account.' });
});

router.get('/:userId', (req, res) => {
    res.status(403).json({ error: 'Deposit history is blocked to protect user privacy.' });
});

module.exports = router;
