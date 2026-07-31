const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    method: String,
    amount: Number,
    currency: { type: String, default: 'USD' },
    status: { type: String, default: 'pending' },
}, { timestamps: true });
module.exports = mongoose.model('Deposit', schema);