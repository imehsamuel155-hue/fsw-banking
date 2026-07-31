require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const PUBLIC = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Block direct access to protected HTML files
const blocked = new Set([
    'dashboard.html', 'dashboard.html', 'pin.html', 'pin.html',
    'view-profile.html', 'bank-cards.html', 'local-transfer.html',
    'international-transfer.html', 'tic-code.html', 'transaction-receipt.html',
    'deposit.html', 'deposit-history.html', 'account-settings.html',
    'transaction-statement.html', 'Transaction-Statement.html',
    'login.html', 'register.html', 'transfer.html',
]);

app.use((req, res, next) => {
    const base = path.basename(req.path);
    if (blocked.has(base)) return res.redirect('/');
    next();
});

app.use(express.static(PUBLIC, { index: false }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/deposits', require('./routes/deposits'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/visits', require('./routes/visits'));
app.use('/api/settings', require('./routes/settings'));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Public
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(PUBLIC, 'signup.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));

// Protected clean URLs (client still checks session)
const pages = {
    '/dashboard': 'dashboard.html',
    '/pin': 'pin.html',
    '/profile': 'view-profile.html',
    '/cards': 'bank-cards.html',
    '/local-transfer': 'local-transfer.html',
    '/international-transfer': 'international-transfer.html',
    '/tic-code': 'tic-code.html',
    '/receipt': 'transaction-receipt.html',
    '/deposit': 'deposit.html',
    '/deposit-history': 'deposit-history.html',
    '/settings': 'account-settings.html',
    '/statement': 'transaction-statement.html',
};
Object.entries(pages).forEach(([route, file]) => {
    app.get(route, (req, res) => {
        const full = path.join(PUBLIC, file);
        if (!fs.existsSync(full)) return res.redirect('/');
        res.sendFile(full);
    });
});

app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.redirect('/');
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/firstsmartwave')
    .then(() => {
        console.log('MongoDB connected');
        app.listen(PORT, () => {
            console.log('http://localhost:' + PORT);
            console.log('Customer: customer / pass1234');
            console.log('Admin:    admin / admin123  | PIN 4422');
        });
    })
    .catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
