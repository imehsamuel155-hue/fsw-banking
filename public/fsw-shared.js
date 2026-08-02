
const FSW_API_BASE = 'https://fsw-banking.onrender.com/api';



const FSW_SESSION_KEYS = { userId: 'fsw_user_id', token: 'fsw_token', adminToken: 'fsw_admin_token' };
const FSW_CURRENCIES = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', CAD: 'C$', AUD: 'A$', NGN: '₦', ZAR: 'R', INR: '₹' };

function fswCurrencySymbol(code) { return FSW_CURRENCIES[code] || code || '$'; }
function fswFormatMoney(amount, code) {
    return fswCurrencySymbol(code) + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fswSessionGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function fswSessionSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
function fswSessionRemove(k) { try { localStorage.removeItem(k); } catch (e) { } }
function fswGetToken() { return fswSessionGet(FSW_SESSION_KEYS.token); }
function fswGetAdminToken() { try { return sessionStorage.getItem(FSW_SESSION_KEYS.adminToken); } catch (e) { return null; } }
function fswSetLoggedInUser(userId, token) {
    fswSessionSet(FSW_SESSION_KEYS.userId, userId);
    fswSessionSet(FSW_SESSION_KEYS.token, token);
}
function fswLogout() {
    fswSessionRemove(FSW_SESSION_KEYS.userId);
    fswSessionRemove(FSW_SESSION_KEYS.token);
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
    const res = await fetch(FSW_API_BASE + '/users/demo');
    if (!res.ok) throw new Error('Could not load demo account — is the backend running?');
    return res.json();
}

async function fswGetCurrentUserId() {
    const existing = fswSessionGet(FSW_SESSION_KEYS.userId);
    if (existing && existing !== 'null' && existing !== 'undefined') return existing;
    // Admin board / pre-login pages: fall back to the shared demo customer
    const demo = await fswFetchDemoUser();
    fswSessionSet(FSW_SESSION_KEYS.userId, demo._id);
    return demo._id;
}

async function fswFetchUser(userId) {
    let id = userId;
    if (!id || id === 'null' || id === 'undefined') {
        id = await fswGetCurrentUserId();
    }
    const res = await fetch(FSW_API_BASE + '/users/' + id);
    if (!res.ok) throw new Error((await res.json()).error || 'Could not load user');
    return res.json();
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
async function fswApplyDashboard() {
    try {
        if (!fswRequireAuth()) return;
        const user = await fswFetchUser();
        const nameEl = document.getElementById('welcomeName');
        if (nameEl) nameEl.textContent = 'Welcome Back, ' + (user.name || '').split(' ')[0];
        const balEl = document.getElementById('accountBalance');
        if (balEl) balEl.textContent = Number(user.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const sym = document.getElementById('currencySymbol');
        if (sym) sym.textContent = fswCurrencySymbol(user.currency);
        const acctNumEl = document.getElementById('dashAccountNumber');
        if (acctNumEl) acctNumEl.textContent = 'Acc: ' + user.accountNumber;
        const acctNameEl = document.getElementById('dashAccountName');
        if (acctNameEl) acctNameEl.textContent = user.name;
        fswApplyStatusEl(document.getElementById('dashAccountStatus'), user.status);
        return user;
    } catch (err) {
        if (String(err.message).includes('Not logged in')) window.location.replace('/');
    }
}
async function fswApplyProfile() {
    try {
        if (!fswRequireAuth()) return;
        const user = await fswFetchUser();
        // status colors applied after text map
        const textMap = {
            profileName: 'name', accountNumber: 'accountNumber', email: 'email', phone: 'phone',
            gender: 'gender', dob: 'dob', country: 'nationality', address: 'address',
            accountStatus: 'status', kycStatus: 'kycStatus', accountType: 'accountType',
            branch: 'branch', dateOpened: 'dateOpened',
        };
        Object.keys(textMap).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = user[textMap[id]];
        });
        const currencyEl = document.getElementById('currency');
        if (currencyEl) currencyEl.textContent = user.currency + ' (' + fswCurrencySymbol(user.currency) + ')';
        const balanceEl = document.getElementById('balance');
        if (balanceEl) balanceEl.textContent = fswFormatMoney(user.balance, user.currency);
        const imgEl = document.getElementById('profileImage');
        if (imgEl) imgEl.src = user.profileImage || ('https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(user.name || 'U'));
        fswApplyStatusEl(document.getElementById('accountStatus'), user.status);
        return user;
    } catch (err) {
        if (String(err.message).includes('Not logged in')) window.location.replace('/');
    }
}
async function fswApplyCards() {
    try {
        if (!fswRequireAuth()) return;
        const user = await fswFetchUser();
        document.querySelectorAll('.bank-card').forEach((cardEl, i) => {
            const data = (user.cards || [])[i];
            if (!data) return;
            const numberEl = cardEl.querySelector('h2');
            if (numberEl) numberEl.textContent = data.number;
            const bottomDivs = cardEl.querySelectorAll('.card-bottom > div');
            if (bottomDivs[0]) { const p = bottomDivs[0].querySelector('p'); if (p) p.textContent = data.holder; }
            if (bottomDivs[1]) { const p = bottomDivs[1].querySelector('p'); if (p) p.textContent = data.expiry; }
        });
        return user;
    } catch (err) {
        if (String(err.message).includes('Not logged in')) window.location.replace('/');
    }
}

async function fswGetChat(userId) {
    const id = userId || await fswGetCurrentUserId();
    const res = await fetch(FSW_API_BASE + '/chat/' + id);
    if (!res.ok) throw new Error('Could not load chat');
    return res.json();
}
async function fswSendCustomerMessage(text, image) {
    const id = await fswGetCurrentUserId();
    const res = await fetch(FSW_API_BASE + '/chat/' + id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text || '', image: image || '' }),
    });
    if (!res.ok) throw new Error('Could not send message');
    return res.json();
}
async function fswSendAdminReply(userId, text, image) {
    const res = await fetch(FSW_API_BASE + '/chat/' + userId + '/admin-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fswGetAdminToken() },
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
