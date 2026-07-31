const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    page: String,
    ip: String,
    country: { type: String, default: 'Unknown' },
    city: String,
    userAgent: String,
}, { timestamps: true });
module.exports = mongoose.model('Visit', schema);