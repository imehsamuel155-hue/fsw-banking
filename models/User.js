const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
    name: { type: String, default: 'Feng Harrson' },
    email: { type: String, default: 'demo@firstsmartwave.com' },
    username: String,
    password: String,
    pin: { type: String, select: false },
    accountNumber: { type: String, default: '2100000100' },
    balance: { type: Number, default: 2500 },
    currency: { type: String, default: 'EUR' },
    phone: { type: String, default: '+1 202 555 0123' },
    gender: { type: String, default: 'Male' },
    dob: { type: String, default: '12 January 1994' },
    nationality: { type: String, default: 'United States' },
    address: { type: String, default: '24 Wall Street, New York, USA' },
    status: { type: String, default: 'Active' },
    kycStatus: { type: String, default: 'Verified' },
    accountType: { type: String, default: 'Savings Account' },
    branch: { type: String, default: 'New York Main Branch' },
    dateOpened: { type: String, default: '18 March 2026' },
    profileImage: { type: String, default: '' },
    isDemo: { type: Boolean, default: false },
    approved: { type: Boolean, default: false },
    approvalStatus: { type: String, default: 'pending' }, // pending | approved | rejected
    autoReplyOn: { type: Boolean, default: true },
    goals: {
        emergencySaved: { type: Number, default: 15000 },
        emergencyTarget: { type: Number, default: 20000 },
        emergencyPct: { type: Number, default: 75 },
        investmentSaved: { type: Number, default: 20000 },
        investmentTarget: { type: Number, default: 50000 },
        investmentPct: { type: Number, default: 40 },
    },
    cards: {
        type: [{
            type: { type: String, default: 'Savings' },
            number: String,
            holder: String,
            expiry: String,
        }],
        default: () => ([
            { type: 'Savings', number: '**** **** **** 4587', holder: 'Feng Harrson', expiry: '09/31' },
            { type: 'Current', number: '**** **** **** 7812', holder: 'Feng Harrson', expiry: '11/31' },
        ]),
    },
}, { timestamps: true });
module.exports = mongoose.model('User', userSchema);
