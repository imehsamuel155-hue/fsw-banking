const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sender: { type: String, enum: ['customer', 'admin'], required: true },
    text: { type: String, default: '' },
    image: { type: String, default: '' },
}, { timestamps: true });
module.exports = mongoose.model('Chat', schema);