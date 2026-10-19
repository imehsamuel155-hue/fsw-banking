// Production API (Render). Localhost used only when testing on your PC.
const FSW_API_BASE = (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/api'
    : 'https://fsw-banking.onrender.com/api');

const FSW_SESSION_KEYS = { userId: 'fsw_user_id', token: 'fsw_token', adminToken: 'fsw_admin_token' };
const FSW_CURRENCIES = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', NZD: 'NZ$', CHF: 'Fr', JPY: '¥', CNY: '¥', HKD: 'HK$', SGD: 'S$', INR: '₹', PKR: '₨', BDT: '৳', IDR: 'Rp', MYR: 'RM', THB: '฿', PHP: '₱', VND: '₫', KRW: '₩', AED: 'د.إ', SAR: '﷼', QAR: 'ر.ق', KWD: 'د.ك', BHD: '.د.ب', OMR: 'ر.ع.', ILS: '₪', TRY: '₺', RUB: '₽', ZAR: 'R', EGP: 'E£', GHS: 'GH₵', KES: 'KSh', UGX: 'USh', TZS: 'TSh', XOF: 'CFA', XAF: 'FCFA', BRL: 'R$', MXN: 'Mex$', ARS: 'AR$', CLP: 'CL$', COP: 'COL$', PEN: 'S/', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', CZK: 'Kč', HUF: 'Ft', RON: 'lei' };

function fswCurrencySymbol(code) { return FSW_CURRENCIES[code] || code || '$'; }
function fswFormatMoney(amount, code) {
    return fswCurrencySymbol(code) + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fswSessionGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function fswSessionSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
function fswSessionRemove(k) { try { localStorage.removeItem(k); } catch (e) { } }
function fswGetToken() { return fswSessionGet(FSW_SESSION_KEYS.token); }
function fswGetAdminToken() { try { return sessionStorage.getItem(FSW_SESSION_KEYS.adminToken); } catch (e) { return null; } }
function fswSetLoggedInUser(userId, token, username) {
    const id = String(userId == null ? '' : userId).trim();
    if (!id || id === 'null' || id === 'undefined') throw new Error('Invalid login user id');
    const prev = fswSessionGet(FSW_SESSION_KEYS.userId);
    // Only wipe cached profile when switching to a different account
    if (prev && String(prev) !== id) {
        try {
            localStorage.removeItem('fsw_user_name');
            localStorage.removeItem('fsw_user');
            localStorage.removeItem('fsw_balance');
            sessionStorage.removeItem('fsw_user');
            sessionStorage.removeItem('fsw_balance');
            sessionStorage.removeItem('fsw_pin_ok');
        } catch (e) { }
    }
    fswSessionSet(FSW_SESSION_KEYS.userId, id);
    fswSessionSet(FSW_SESSION_KEYS.token, String(token || ''));
    if (username) {
        try { localStorage.setItem('fsw_username', String(username)); } catch (e) { }
    }
}

/** Load full user into cache before dashboard/cards/profile (avoids blank UI) */
async function fswPrefetchAndCache() {
    try {
        const user = await fswFetchUser();
        if (user) fswCacheUser(user);
        return user;
    } catch (e) {
        return fswGetCachedUser();
    }
}

/** Instant paint as soon as this file loads — no wait for page scripts */
function fswEarlyHydrate() {
    try {
        const u = fswGetCachedUser();
        if (!u) return;
        if (document.getElementById('accountBalance') || document.getElementById('dashAccountName')) {
            fswPaintDashboard(u);
        }
        if (document.getElementById('profileImage') || document.getElementById('profileName')) {
            fswPaintProfile(u);
        }
        if (document.querySelector('.bank-card')) {
            fswPaintCards(u);
        }
    } catch (e) { }
}
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fswEarlyHydrate);
    } else {
        fswEarlyHydrate();
    }
}
function fswGetUsername() {
    try { return localStorage.getItem('fsw_username') || ''; } catch (e) { return ''; }
}
function fswLogout() {
    fswSessionRemove(FSW_SESSION_KEYS.userId);
    fswSessionRemove(FSW_SESSION_KEYS.token);
    try {
        localStorage.removeItem('fsw_username');
        localStorage.removeItem('fsw_user_name');
        localStorage.removeItem('fsw_user');
        localStorage.removeItem('fsw_balance');
        sessionStorage.removeItem('fsw_pin_ok');
        sessionStorage.removeItem('fsw_user');
        sessionStorage.removeItem('fsw_balance');
    } catch (e) { }
    window.location.href = '/';
}
function fswIsLoggedIn() {
    return !!(fswSessionGet(FSW_SESSION_KEYS.userId) && fswGetToken());
}
function fswRequireAuth() {
    if (!fswIsLoggedIn()) { window.location.replace('/'); return false; }
    return true;
}

/** Button loading: shows "..." / spinner until page navigates or you call fswBtnStop */
function fswBtnStart(btn, label) {
    if (!btn) return;
    if (!btn.dataset.fswLabel) btn.dataset.fswLabel = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (label || 'Please wait...');
}
function fswBtnStop(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.fswLabel) btn.innerHTML = btn.dataset.fswLabel;
}



async function fswAdminLogin(username, password) {
    try {
        const res = await fetch(FSW_API_BASE + '/auth/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, country: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        try { sessionStorage.setItem(FSW_SESSION_KEYS.adminToken, data.token); } catch (e) { }
        return true;
    } catch (e) { return false; }
}
async function fswAdminVerifyPin(pin) {
    try {
        const res = await fetch(FSW_API_BASE + '/auth/admin-verify-pin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin }),
        });
        const data = await res.json();
        return !!data.valid;
    } catch (e) { return false; }
}
function fswAdminLogout() { try { sessionStorage.removeItem(FSW_SESSION_KEYS.adminToken); } catch (e) { } }

async function fswFetchDemoUser() {
    throw new Error('Demo account removed — log in with an approved profile');
}

async function fswGetCurrentUserId() {
    const existing = fswSessionGet(FSW_SESSION_KEYS.userId);
    if (existing && existing !== 'null' && existing !== 'undefined') return existing;
    throw new Error('Not logged in');
}

/** Cached full profile for instant paint (no blank / dashes while API loads) */
function fswCacheUser(user) {
    if (!user || !user._id) return;
    try {
        const json = JSON.stringify(user);
        localStorage.setItem('fsw_user', json);
        localStorage.setItem('fsw_user_name', user.name || '');
        localStorage.setItem('fsw_balance', String(user.balance != null ? user.balance : ''));
        sessionStorage.setItem('fsw_user', json);
        sessionStorage.setItem('fsw_balance', String(user.balance != null ? user.balance : ''));
    } catch (e) { }
}
function fswGetCachedUser() {
    try {
        const sessionId = fswSessionGet(FSW_SESSION_KEYS.userId);
        if (!sessionId) return null;
        const raw = sessionStorage.getItem('fsw_user') || localStorage.getItem('fsw_user');
        if (!raw) return null;
        const u = JSON.parse(raw);
        if (!u || !u._id) return null;
        // Only use cache if it matches this login
        if (String(u._id) !== String(sessionId)) return null;
        return u;
    } catch (e) {
        return null;
    }
}

async function fswFetchUser(userId) {
    let id = userId;
    if (!id || id === 'null' || id === 'undefined') {
        id = await fswGetCurrentUserId();
    }
    // Never fall back to demo / first account — only the logged-in (or admin-selected) id
    if (!id || id === 'null' || id === 'undefined') {
        throw new Error('Not logged in');
    }
    const res = await fetch(FSW_API_BASE + '/users/' + encodeURIComponent(id) + '?_=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!res.ok) {
        let err = 'Could not load user';
        try { err = (await res.json()).error || err; } catch (_) { }
        // Prefer last good cache over empty UI
        if (!userId) {
            const cached = fswGetCachedUser();
            if (cached) return cached;
        }
        throw new Error(err);
    }
    const user = await res.json();
    // Safety: customer session must match this id (never swap in demo payload)
    try {
        const sessionId = fswSessionGet(FSW_SESSION_KEYS.userId);
        if (sessionId && user && user._id && String(user._id) !== String(sessionId) && !userId) {
            throw new Error('Session mismatch — log in again');
        }
    } catch (e) {
        if (String(e.message).includes('Session mismatch')) throw e;
    }
    if (!userId) fswCacheUser(user);
    return user;
}
async function fswUpdateUser(userId, updates) {
    const res = await fetch(FSW_API_BASE + '/users/' + userId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fswGetAdminToken() },
        body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
    return res.json();
}

function fswStatusClass(status) {
    const s = String(status || 'Active').toLowerCase();
    if (s.includes('suspend') || s.includes('closed') || s.includes('block')) return 'status-suspended';
    if (s.includes('inactive') || s.includes('pending')) return 'status-inactive';
    return 'status-active';
}
function fswApplyStatusEl(el, status) {
    if (!el) return;
    const label = status || 'Active';
    el.textContent = label;
    el.classList.remove('status-active', 'status-inactive', 'status-suspended');
    el.classList.add(fswStatusClass(label));
    // inline colors for reliability
    const s = fswStatusClass(label);
    if (s === 'status-active') { el.style.background = '#dbeafe'; el.style.color = '#1d4ed8'; }
    else if (s === 'status-inactive') { el.style.background = '#fef3c7'; el.style.color = '#b45309'; }
    else { el.style.background = '#fee2e2'; el.style.color = '#b91c1c'; }
}
function fswPaintDashboard(user) {
    if (!user) return;
    const nameEl = document.getElementById('welcomeName');
    if (nameEl) nameEl.textContent = 'Welcome Back, ' + (user.name || '').split(' ')[0];
    const balEl = document.getElementById('accountBalance');
    if (balEl) balEl.textContent = Number(user.balance != null ? user.balance : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sym = document.getElementById('currencySymbol');
    if (sym) sym.textContent = fswCurrencySymbol(user.currency);
    const acctNumEl = document.getElementById('dashAccountNumber');
    if (acctNumEl) acctNumEl.textContent = 'Acc: ' + (user.accountNumber || '');
    const acctNameEl = document.getElementById('dashAccountName');
    if (acctNameEl) acctNameEl.textContent = user.name || '';
    const dashImg = document.getElementById('dashProfileImg');
    if (dashImg) {
        dashImg.alt = '';
        const fallback = 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(user.name || 'U');
        dashImg.onerror = function () { this.onerror = null; this.src = fallback; };
        dashImg.src = user.profileImage || fallback;
    }
    fswApplyStatusEl(document.getElementById('dashAccountStatus'), user.status || 'Active');
    const statusLabel = document.getElementById('dashStatusLabel');
    if (statusLabel) statusLabel.textContent = user.status || 'Active';
}

async function fswApplyDashboard() {
    try {
        if (!fswRequireAuth()) return;
        // Instant paint from last session cache (no blank / dashes)
        const cached = fswGetCachedUser();
        if (cached) fswPaintDashboard(cached);
        const user = await fswFetchUser();
        if (!user) return;
        fswPaintDashboard(user);
        // Goals + bills on dashboard when present
        try {
            const g = user.goals || {};
            const fills = document.querySelectorAll('.progress-bar-fill');
            const footers = document.querySelectorAll('.goal-footer');
            const headers = document.querySelectorAll('.goal-header span');
            const emPct = (g.emergencyPct != null ? g.emergencyPct : 0);
            const invPct = (g.investmentPct != null ? g.investmentPct : 0);
            if (fills[0]) fills[0].style.width = emPct + '%';
            if (fills[1]) fills[1].style.width = invPct + '%';
            if (headers[0]) headers[0].textContent = emPct + '% Target';
            if (headers[1]) headers[1].textContent = invPct + '% Target';
            if (footers[0]) footers[0].innerHTML = '<span>Saved: ' + fswFormatMoney(g.emergencySaved != null ? g.emergencySaved : 0, user.currency) + '</span><span>Goal: ' + fswFormatMoney(g.emergencyTarget != null ? g.emergencyTarget : 0, user.currency) + '</span>';
            if (footers[1]) footers[1].innerHTML = '<span>Saved: ' + fswFormatMoney(g.investmentSaved != null ? g.investmentSaved : 0, user.currency) + '</span><span>Goal: ' + fswFormatMoney(g.investmentTarget != null ? g.investmentTarget : 0, user.currency) + '</span>';
            const bills = user.bills || [];
            if (bills[0]) {
                const t1 = document.getElementById('bill1Title'); if (t1) t1.textContent = bills[0].title || t1.textContent;
                const s1 = document.getElementById('bill1Schedule'); if (s1) s1.textContent = bills[0].schedule || s1.textContent;
                const a1 = document.getElementById('bill1Amount'); if (a1) a1.textContent = fswFormatMoney(bills[0].amount, user.currency);
                const st1 = document.getElementById('bill1Status'); if (st1) st1.textContent = bills[0].status || st1.textContent;
            }
            if (bills[1]) {
                const t2 = document.getElementById('bill2Title'); if (t2) t2.textContent = bills[1].title || t2.textContent;
                const s2 = document.getElementById('bill2Schedule'); if (s2) s2.textContent = bills[1].schedule || s2.textContent;
                const a2 = document.getElementById('bill2Amount'); if (a2) a2.textContent = fswFormatMoney(bills[1].amount, user.currency);
                const st2 = document.getElementById('bill2Status'); if (st2) st2.textContent = bills[1].status || st2.textContent;
            }
        } catch (e) { }
        return user;
    } catch (err) {
        if (String(err.message).includes('Not logged in')) window.location.replace('/');
    }
}
function fswPaintProfile(user) {
    if (!user) return;
    const textMap = {
        profileName: 'name', accountNumber: 'accountNumber', email: 'email', phone: 'phone',
        gender: 'gender', dob: 'dob', country: 'nationality', address: 'address',
        accountType: 'accountType', branch: 'branch', dateOpened: 'dateOpened',
    };
    Object.keys(textMap).forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            const v = user[textMap[id]];
            el.textContent = (v != null && String(v).trim() !== '') ? String(v) : '';
        }
    });
    const currencyEl = document.getElementById('currency');
    if (currencyEl) currencyEl.textContent = (user.currency || 'EUR') + ' (' + fswCurrencySymbol(user.currency) + ')';
    const balanceEl = document.getElementById('balance');
    if (balanceEl) balanceEl.textContent = fswFormatMoney(user.balance != null ? user.balance : 0, user.currency);
    const imgEl = document.getElementById('profileImage');
    if (imgEl) {
        imgEl.alt = '';
        const fallback = 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(user.name || 'U');
        imgEl.onerror = function () { this.onerror = null; this.src = fallback; this.alt = ''; };
        imgEl.src = user.profileImage || fallback;
    }
    fswApplyStatusEl(document.getElementById('accountStatus'), user.status || 'Active');
    const kyc = document.getElementById('kycStatus');
    if (kyc) {
        kyc.textContent = user.kycStatus || 'Verified';
        fswApplyStatusEl(kyc, user.kycStatus === 'Verified' ? 'Active' : (user.kycStatus || 'Pending'));
        kyc.textContent = user.kycStatus || 'Verified';
    }
}

function fswDefaultCards(user) {
    const last4 = String(user.accountNumber || '0000').replace(/\D/g, '').slice(-4) || '0000';
    const name = user.name || '';
    return [
        { type: 'Savings', number: '**** **** **** ' + last4, holder: name, expiry: user.cards && user.cards[0] && user.cards[0].expiry ? user.cards[0].expiry : '12/28' },
        { type: 'Current', number: '**** **** **** ' + last4, holder: name, expiry: user.cards && user.cards[1] && user.cards[1].expiry ? user.cards[1].expiry : '12/28' },
    ];
}

function fswPaintCards(user) {
    if (!user) return;
    const defaults = fswDefaultCards(user);
    const cards = (user.cards && user.cards.length) ? user.cards : defaults;
    const name = user.name || '';
    const last4 = String(user.accountNumber || '').replace(/\D/g, '').slice(-4) || '0000';
    document.querySelectorAll('.bank-card').forEach((cardEl, i) => {
        const data = cards[i] || defaults[i] || defaults[0] || {};
        const numberEl = cardEl.querySelector('h2');
        const bottomDivs = cardEl.querySelectorAll('.card-bottom > div');
        let num = (data.number && String(data.number).replace(/-/g, '').trim()) || '';
        if (!num || /----|\.\.\.|—/.test(num)) num = '**** **** **** ' + last4;
        if (numberEl) numberEl.textContent = num;
        if (bottomDivs[0]) {
            const p = bottomDivs[0].querySelector('p');
            if (p) {
                const h = (data.holder && data.holder !== '—' && data.holder !== '-') ? data.holder : name;
                p.textContent = h || name || '';
            }
        }
        if (bottomDivs[1]) {
            const p = bottomDivs[1].querySelector('p');
            if (p) {
                const exp = (data.expiry && data.expiry !== '—' && data.expiry !== '-') ? data.expiry : (defaults[i] && defaults[i].expiry) || '12/28';
                p.textContent = exp;
            }
        }
        const typeEl = cardEl.querySelector('.card-type, .type, small.card-type, .card-brand span');
        if (typeEl && data.type) typeEl.textContent = data.type;
    });
}

async function fswApplyProfile() {
    try {
        if (!fswRequireAuth()) return;
        const cached = fswGetCachedUser();
        if (cached) fswPaintProfile(cached);
        const user = await fswFetchUser();
        fswPaintProfile(user);
        return user;
    } catch (err) {
        if (String(err.message).includes('Not logged in')) window.location.replace('/');
    }
}
async function fswApplyCards() {
    try {
        if (!fswRequireAuth()) return;
        const cached = fswGetCachedUser();
        if (cached) fswPaintCards(cached);
        const user = await fswFetchUser();
        fswPaintCards(user);
        return user;
    } catch (err) {
        if (String(err.message).includes('Not logged in')) window.location.replace('/');
        throw err;
    }
}

/** Customer chat only — always this login. Never uses admin token. */
async function fswGetChat() {
    const id = await fswGetCurrentUserId();
    const tok = fswGetToken();
    if (!tok) throw new Error('Not logged in');
    const res = await fetch(FSW_API_BASE + '/chat/' + encodeURIComponent(id), {
        headers: { Authorization: 'Bearer ' + tok },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error('Could not load chat');
    return res.json();
}
/** Admin only — messages for one selected customer */
async function fswGetChatAsAdmin(customerUserId) {
    if (!customerUserId) throw new Error('Select a customer first');
    const adminTok = fswGetAdminToken();
    if (!adminTok) throw new Error('Admin login required');
    const res = await fetch(FSW_API_BASE + '/chat/' + encodeURIComponent(customerUserId), {
        headers: { Authorization: 'Bearer ' + adminTok },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error('Could not load chat');
    return res.json();
}
async function fswSendCustomerMessage(text, image) {
    const id = await fswGetCurrentUserId();
    const tok = fswGetToken();
    if (!tok) throw new Error('Not logged in');
    const res = await fetch(FSW_API_BASE + '/chat/' + encodeURIComponent(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ text: text || '', image: image || '' }),
    });
    if (!res.ok) {
        let err = 'Could not send message';
        try { err = (await res.json()).error || err; } catch (e) { }
        throw new Error(err);
    }
    return res.json();
}
async function fswSendAdminReply(userId, text, image) {
    if (!userId) throw new Error('Select a customer conversation first');
    const adminTok = fswGetAdminToken();
    if (!adminTok) throw new Error('Admin login required');
    const res = await fetch(FSW_API_BASE + '/chat/' + encodeURIComponent(userId) + '/admin-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminTok },
        body: JSON.stringify({ text: text || '', image: image || '' }),
    });
    if (!res.ok) throw new Error('Could not send reply');
    return res.json();
}
async function fswClearChat(userId) {
    const res = await fetch(FSW_API_BASE + '/chat/' + userId, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + fswGetAdminToken() },
    });
    if (!res.ok) throw new Error('Could not clear chat');
    return res.json();
}
/** Admin: delete one chat message (no “deleted” placeholder) */
async function fswDeleteChatMessage(userId, msgId) {
    if (!userId || !msgId) throw new Error('Missing message');
    const res = await fetch(
        FSW_API_BASE + '/chat/' + encodeURIComponent(userId) + '/messages/' + encodeURIComponent(msgId),
        { method: 'DELETE', headers: { Authorization: 'Bearer ' + fswGetAdminToken() } }
    );
    if (!res.ok) {
        let err = 'Could not delete message';
        try { err = (await res.json()).error || err; } catch (e) { }
        throw new Error(err);
    }
    return res.json();
}
function fswCopyChatText(text, btn) {
    var t = String(text || '');
    if (!t) return;
    function done() {
        if (btn) {
            var prev = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(function () { btn.textContent = prev || 'Copy'; }, 1200);
        }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(done).catch(function () {
            try {
                var ta = document.createElement('textarea');
                ta.value = t;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                done();
            } catch (e) { }
        });
    } else {
        try {
            var ta = document.createElement('textarea');
            ta.value = t;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
        } catch (e) { }
    }
}
window.fswCopyChatText = fswCopyChatText;
window.fswDeleteChatMessage = fswDeleteChatMessage;

function fswInitChatWidget(ids) {
    const icon = document.getElementById(ids.icon);
    const popup = document.getElementById(ids.popup);
    const messagesEl = document.getElementById(ids.messages);
    const input = document.getElementById(ids.input);
    const sendBtn = document.getElementById(ids.send);
    const closeBtn = document.getElementById(ids.close);
    if (!icon || !popup) return;
    async function render() {
        if (!messagesEl) return;
        if (!fswIsLoggedIn()) {
            messagesEl.innerHTML = '<div class="message support">Please sign in to chat with support.</div>';
            return;
        }
        let msgs = [];
        try { msgs = await fswGetChat(); } catch (e) { return; }
        if (!msgs.length) {
            messagesEl.innerHTML = '<div class="message support">Hello 👋<br>Welcome to First Smart Wave Banking.</div><div class="message support">How may we assist you today?</div>';
            return;
        }
        messagesEl.innerHTML = '';
        msgs.forEach((m) => {
            const div = document.createElement('div');
            div.className = 'message ' + (m.sender === 'admin' ? 'support' : 'user');
            if (m.image) div.innerHTML = (m.text ? m.text + '<br>' : '') + '<img src="' + m.image + '" class="fsw-chat-img" style="max-width:160px;border-radius:8px;margin-top:4px;cursor:pointer;">';
            else div.textContent = m.text;
            messagesEl.appendChild(div);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    icon.addEventListener('click', () => { popup.style.display = ids.openDisplay || 'flex'; render(); });
    if (closeBtn) closeBtn.addEventListener('click', () => { popup.style.display = 'none'; });
    async function send() {
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        try { await fswSendCustomerMessage(text); } catch (e) { }
        render();
    }
    if (sendBtn) sendBtn.addEventListener('click', send);
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    window.sendCustomerImage = async function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function (ev) {
            try { await fswSendCustomerMessage('', ev.target.result); } catch (err) { }
            render();
        };
        reader.readAsDataURL(file);
    };
    setInterval(async () => {
        if (popup.style.display === 'none' || popup.style.display === '') return;
        try { await render(); } catch (e) { }
    }, 2500);
}

async function fswLogVisit(pageName) {
    try {
        await fetch(FSW_API_BASE + '/visits', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: pageName || document.title, country: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        });
    } catch (e) { }
}
async function fswFetchVisits() {
    const res = await fetch(FSW_API_BASE + '/visits', { headers: { Authorization: 'Bearer ' + fswGetAdminToken() } });
    if (!res.ok) throw new Error('Could not load visits');
    return res.json();
}
async function fswFetchSettings() {
    const res = await fetch(FSW_API_BASE + '/settings', { headers: { Authorization: 'Bearer ' + fswGetAdminToken() } });
    if (!res.ok) throw new Error('Could not load settings');
    return res.json();
}
async function fswUpdateSettings(body) {
    const res = await fetch(FSW_API_BASE + '/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fswGetAdminToken() },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
    return res.json();
}
async function fswFetchLoginLogs() {
    const res = await fetch(FSW_API_BASE + '/settings/login-logs', { headers: { Authorization: 'Bearer ' + fswGetAdminToken() } });
    if (!res.ok) throw new Error('Could not load logs');
    return res.json();
}

async function fswDeleteLoginLogs() {
    const res = await fetch(FSW_API_BASE + '/settings/login-logs', {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + fswGetAdminToken() },
    });
    if (!res.ok) throw new Error('Could not clear logs');
    return res.json();
}
async function fswDeleteLoginLog(id) {
    const res = await fetch(FSW_API_BASE + '/settings/login-logs/' + id, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + fswGetAdminToken() },
    });
    if (!res.ok) throw new Error('Could not delete log');
    return res.json();
}


/** Transfer security gate: 1st,3rd,5th… → TIC | 2nd,4th,6th… → Tax code */
function fswTransferCountKey() {
    try {
        const id = fswSessionGet(FSW_SESSION_KEYS.userId) || 'guest';
        return 'fsw_completed_transfers_' + id;
    } catch (e) { return 'fsw_completed_transfers_guest'; }
}
function fswGetCompletedTransferCount() {
    return Number(localStorage.getItem(fswTransferCountKey()) || 0) || 0;
}
function fswBumpCompletedTransfers() {
    const n = fswGetCompletedTransferCount() + 1;
    localStorage.setItem(fswTransferCountKey(), String(n));
    return n;
}
/** Returns 'tic' or 'tax' for the NEXT transfer after Continue */
function fswNextTransferGate() {
    const next = fswGetCompletedTransferCount() + 1;
    return (next % 2 === 1) ? 'tic' : 'tax';
}

function fswSetCachedBalance(n) {
    try {
        sessionStorage.setItem('fsw_balance', String(n));
        var u = JSON.parse(sessionStorage.getItem('fsw_user') || localStorage.getItem('fsw_user') || 'null');
        if (u) {
            u.balance = Number(n);
            sessionStorage.setItem('fsw_user', JSON.stringify(u));
            try { localStorage.setItem('fsw_user', JSON.stringify(u)); } catch (e) { }
        }
    } catch (e) { }
}
