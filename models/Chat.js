const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sender: { type: String, enum: ['customer', 'admin'], required: true },
    text: { type: String, default: '' },
    image: { type: String, default: '' },
    readByAdmin: { type: Boolean, default: false },
    readByCustomer: { type: Boolean, default: false },
}, { timestamps: true });
module.exports = mongoose.model('Chat', schema);