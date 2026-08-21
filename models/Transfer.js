const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['local', 'international'], default: 'local' },
    recipientName: String,
    recipientBank: String,
    recipientAccountNumber: String,
    iban: String,
    swift: String,
    country: String,
    currency: String,
    amount: Number,
    purpose: String,
    description: String,
    ticCode: { type: String, default: () => String(Math.floor(100000 + Math.random() * 900000)) },
    status: { type: String, default: 'pending' },
    pinVerified: { type: Boolean, default: false },
    reference: { type: String, default: () => 'FSW' + Date.now() },
}, { timestamps: true });
module.exports = mongoose.model('Transfer', schema);
