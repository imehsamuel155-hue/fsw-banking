const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    type: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    username: String,
    success: Boolean,
    ip: String,
    country: { type: String, default: 'Unknown' },
    city: String,
    userAgent: String,
}, { timestamps: true });
module.exports = mongoose.model('LoginLog', schema);