const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    adminUsername: { type: String, default: 'admin' },
    adminPassword: { type: String, default: 'admin123' },
    adminPin: { type: String, default: '4422' },
    /** Extra PIN to open/change admin username & password (like delivery site) */
    settingsPin: { type: String, default: '7799' },
    customerUsername: { type: String, default: 'customer' },
    customerPassword: { type: String, default: 'pass1234' },
    customerPin: { type: String, default: '5566' },
    taxCode: { type: String, default: '8659' },
    ticCode: { type: String, default: '7766' },
    /** When true, all customer logins are blocked site-wide */
    loginsBlocked: { type: Boolean, default: false },
}, { timestamps: true });
module.exports = mongoose.model('SiteSettings', schema);
