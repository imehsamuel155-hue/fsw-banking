const mongoose = require('mongoose');

// Defaults must be EMPTY / neutral — never demo "Feng Harrson" data.
// Each addmoreprofile account only stores what was saved for that user.
const userSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    username: String,
    password: String,
    loginPin: { type: String, default: '5566' },
    transferPin: { type: String, default: '7766' },
    taxCodePin: { type: String, default: '8659' },
    pin: { type: String, select: false },
    accountNumber: { type: String, default: '' },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'EUR' },
    phone: { type: String, default: '' },
    gender: { type: String, default: '' },
    dob: { type: String, default: '' },
    nationality: { type: String, default: '' },
    address: { type: String, default: '' },
    status: { type: String, default: 'Active' },
    kycStatus: { type: String, default: 'Verified' },
    accountType: { type: String, default: 'Savings Account' },
    branch: { type: String, default: '' },
    dateOpened: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    isDemo: { type: Boolean, default: false },
    approved: { type: Boolean, default: false },
    /** Per-account login block (not site-wide) */
    loginLocked: { type: Boolean, default: false },
    resetCode: { type: String, default: '' },
    resetCodeExpires: { type: Date, default: null },
    approvalStatus: { type: String, default: 'pending' }, // pending | approved | rejected
    autoReplyOn: { type: Boolean, default: true },
    completedTransfers: { type: Number, default: 0 },
    transferMode: { type: String, default: 'tic_then_tax' },
    transferPinEnabled: { type: Boolean, default: true },
    taxCodeEnabled: { type: Boolean, default: false },
    dropTextEnabled: { type: Boolean, default: false },
    dropTextMessage: {
        type: String,
        default: 'Your account has been disabled due to suspicious activities from an unknown location. Please visit any of our branches for further assistance on how to resolve this issue.',
    },

    bills: {
        type: [{
            title: String,
            schedule: String,
            amount: Number,
            status: { type: String, default: 'Auto-Pay Enabled' },
            icon: { type: String, default: 'bolt' },
        }],
        default: () => [],
    },
    goals: {
        emergencySaved: { type: Number, default: 0 },
        emergencyTarget: { type: Number, default: 0 },
        emergencyPct: { type: Number, default: 0 },
        investmentSaved: { type: Number, default: 0 },
        investmentTarget: { type: Number, default: 0 },
        investmentPct: { type: Number, default: 0 },
    },
    cards: {
        type: [{
            type: { type: String, default: 'Savings' },
            number: String,
            holder: String,
            expiry: String,
        }],
        default: () => [],
    },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
