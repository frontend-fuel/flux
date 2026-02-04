const state = {
    user: null,
    token: localStorage.getItem('token'),
    socket: null,
    currentChatUserId: null,
    onlineUsers: new Set()
};

const views = {
    auth: document.getElementById('auth-view'),
    admin: document.getElementById('admin-view'),
    user: document.getElementById('user-view')
};

const api = {
    async request(method, endpoint, body = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);
        try {
            const res = await fetch(`/api${endpoint}`, config);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Something went wrong');
            return data;
        } catch (err) {
            showToast(err.message, 'error');
            throw err;
        }
    }
};

async function init() {
    if (state.token) {
        try {
            const user = await api.request('GET', '/auth/me');
            handleLoginSuccess(user, state.token, false);
        } catch (err) {
            state.token = null;
            localStorage.removeItem('token');
            switchView('auth');
        }
    } else {
        switchView('auth');
    }
}

function switchView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    const target = views[viewName];
    if (target) {
        target.classList.remove('hidden');
    }
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    toast.style.background = '#323232';
    toast.style.color = 'white';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.marginBottom = '20px';
    toast.style.fontSize = '0.9rem';
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 2000);
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
        const res = await api.request('POST', '/auth/login', { username, password });
        handleLoginSuccess(res, res.token);
    } catch (err) { }
});

function handleLoginSuccess(user, token, save = true) {
    state.user = user;
    if (save && token) {
        state.token = token;
        localStorage.setItem('token', token);
    }
    initSocket();
    if (user.role === 'ADMIN') {
        switchView('admin');
        loadUsers();
    } else {
        switchView('user');
        loadUserMessages();
    }
    initEmojiPicker();
}

function logout() {
    state.user = null;
    state.token = null;
    localStorage.removeItem('token');
    if (state.socket) state.socket.disconnect();
    switchView('auth');
}

if (document.getElementById('admin-logout-trigger')) {
    document.getElementById('admin-logout-trigger').addEventListener('click', logout);
}
if (document.getElementById('logout-btn-user')) {
    document.getElementById('logout-btn-user').addEventListener('click', logout);
}

// User Management Listeners
if (document.getElementById('open-create-user')) {
    document.getElementById('open-create-user').addEventListener('click', () => {
        document.getElementById('tab-users').classList.add('hidden');
        document.getElementById('tab-create-user').classList.remove('hidden');
    });
}
if (document.getElementById('cancel-create-user')) {
    document.getElementById('cancel-create-user').addEventListener('click', () => {
        document.getElementById('tab-create-user').classList.add('hidden');
        document.getElementById('tab-users').classList.remove('hidden');
    });
}
if (document.getElementById('create-user-form')) {
    document.getElementById('create-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        try {
            await api.request('POST', '/admin/users', { username, password });
            showToast('User created successfully', 'success');
            document.getElementById('create-user-form').reset();
            document.getElementById('tab-create-user').classList.add('hidden');
            document.getElementById('tab-users').classList.remove('hidden');
            loadUsers();
        } catch (err) { }
    });
}

function initSocket() {
    state.socket = io('/', { auth: { token: state.token } });
    window.appState = state;

    state.socket.on('message:new', (msg) => {
        if (state.user.role === 'USER') {
            appendMessage(msg, 'user-messages-area', true);
        } else {
            if (state.currentChatUserId === msg.senderId || (msg.senderRole === 'ADMIN' && msg.receiverId === state.currentChatUserId)) {
                appendMessage(msg, 'admin-messages-area', false);
            } else {
                showToast(`New message from ${msg.senderUsername || 'User'}`, 'info');
                loadUsers();
            }
        }
    });

    // --- WebRTC Signaling Listeners ---
    state.socket.on('call:incoming', (data) => {
        if (typeof receiveCall === 'function') receiveCall(data);
    });
    state.socket.on('call:response', (data) => {
        if (typeof handleCallResponse === 'function') handleCallResponse(data);
    });
    state.socket.on('webrtc:offer', (data) => {
        if (typeof handleWebRTCOffer === 'function') handleWebRTCOffer(data);
    });
    state.socket.on('webrtc:answer', (data) => {
        if (typeof handleWebRTCAnswer === 'function') handleWebRTCAnswer(data);
    });
    state.socket.on('webrtc:ice', (data) => {
        if (typeof handleWebRTCIce === 'function') handleWebRTCIce(data);
    });

    state.socket.on('user:status', (data) => {
        if (state.user.role === 'ADMIN') {
            if (data.status === 'online') state.onlineUsers.add(data.userId);
            else state.onlineUsers.delete(data.userId);
            loadUsers();
            if (state.currentChatUserId === data.userId) {
                updateChatHeaderStatus(data.status, data.lastSeen);
            }
        }
    });

    state.socket.on('admin:status', (data) => {
        if (state.user.role === 'USER') {
            updateChatHeaderStatus(data.status, data.lastSeen, 'admin-status-text');
        }
    });
}

function updateChatHeaderStatus(status, lastSeen, elementId = 'admin-chat-status') {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (status === 'online') {
        el.textContent = 'online';
        el.style.color = '#fff';
        el.style.opacity = '1';
    } else {
        const time = lastSeen ? formatLastSeen(lastSeen) : 'recently';
        el.textContent = `last seen ${time}`;
        el.style.opacity = '0.7';
        el.style.color = '#fff';
    }
}

function formatLastSeen(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return isToday ? `today at ${time}` : `on ${date.toLocaleDateString()} at ${time}`;
}

async function loadUsers() {
    try {
        const users = await api.request('GET', '/admin/users');
        const list = document.getElementById('user-list');
        list.innerHTML = '';
        users.forEach(u => {
            const isOnline = state.onlineUsers.has(u._id) || u.status === 'online';
            const item = document.createElement('div');
            item.className = 'user-item';
            item.onclick = () => openAdminChat(u._id, u.username);

            const time = u.lastSeen ? formatLastSeen(u.lastSeen) : 'recently';

            item.innerHTML = `
                <div class="user-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="user-info">
                    <div class="user-info-row">
                        <h4>${u.username}</h4>
                        <span class="time">${u.lastSeen ? new Date(u.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <div class="user-info-row">
                        <p>${isOnline ? '<span style="color:#25d366">Online</span>' : 'Last seen ' + time}</p>
                    </div>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (err) { }
}

async function openAdminChat(userId, username) {
    state.currentChatUserId = userId;
    document.getElementById('chat-with-username').textContent = username;
    document.getElementById('tab-chat-admin').classList.remove('hidden');

    const isOnline = state.onlineUsers.has(userId);
    try {
        const users = await api.request('GET', '/admin/users');
        const u = users.find(x => x._id === userId);
        updateChatHeaderStatus(isOnline ? 'online' : 'offline', u?.lastSeen);
    } catch (e) { }

    try {
        const msgs = await api.request('GET', `/admin/conversations/${userId}/messages`);
        const area = document.getElementById('admin-messages-area');
        area.innerHTML = '';
        msgs.forEach(m => appendMessage(m, 'admin-messages-area', false));
        scrollToBottom('admin-messages-area');
    } catch (err) { }
}

if (document.getElementById('back-to-users')) {
    document.getElementById('back-to-users').addEventListener('click', () => {
        state.currentChatUserId = null;
        document.getElementById('tab-chat-admin').classList.add('hidden');
        loadUsers();
    });
}

document.getElementById('admin-send-btn').addEventListener('click', async () => {
    const input = document.getElementById('admin-message-input');
    const text = input.value.trim();
    if (!text || !state.currentChatUserId) return;
    try {
        const msg = await api.request('POST', `/admin/messages/${state.currentChatUserId}`, { text });
        appendMessage(msg, 'admin-messages-area', false);
        input.value = '';
        document.getElementById('admin-emoji-picker-container').classList.add('hidden');
    } catch (err) { }
});

async function loadUserMessages() {
    try {
        const msgs = await api.request('GET', '/me/messages');
        const area = document.getElementById('user-messages-area');
        area.innerHTML = '';
        msgs.forEach(m => appendMessage(m, 'user-messages-area', true));
        scrollToBottom('user-messages-area');
    } catch (err) { }
}

document.getElementById('user-send-btn').addEventListener('click', async () => {
    const input = document.getElementById('user-message-input');
    const text = input.value.trim();
    if (!text) return;
    try {
        const msg = await api.request('POST', '/me/messages', { text });
        appendMessage(msg, 'user-messages-area', true);
        input.value = '';
        document.getElementById('emoji-picker-container').classList.add('hidden');
    } catch (err) { }
});

function appendMessage(msg, containerId, isUserView) {
    const container = document.getElementById(containerId);
    const wrapper = document.createElement('div');
    const type = isUserView ? (msg.senderRole === 'USER' ? 'sent' : 'received') : (msg.senderRole === 'ADMIN' ? 'sent' : 'received');
    wrapper.className = `msg-wrapper ${type}`;
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${type}`;
    const time = new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `
        <div class="msg-text">${msg.text}</div>
        <div class="msg-footer">
            <span class="msg-time">${time}</span>
            ${type === 'sent' ? '<span class="msg-status"><i class="fas fa-check-double"></i></span>' : ''}
        </div>
    `;
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    scrollToBottom(containerId);
}

function scrollToBottom(id) {
    const el = document.getElementById(id);
    if (el) el.scrollTop = el.scrollHeight;
}

// --- EMOJI PICKER ---
function initEmojiPicker() {
    const emojis = ['😊', '😂', '🔥', '❤️', '👍', '🙏', '💯', '✨', '😎', '😢', '🙌', '🎉', '👋', '✅', '❌', '🤔', '👀', '💡', '🚀', '⭐', '🤝', '📞', '💬', '🔒', '🤡', '💀', '🤖', '👻'];

    // User Side
    const userGrid = document.getElementById('emoji-grid');
    if (userGrid) {
        userGrid.innerHTML = '';
        emojis.forEach(e => {
            const span = document.createElement('span');
            span.textContent = e;
            span.onclick = () => { document.getElementById('user-message-input').value += e; };
            userGrid.appendChild(span);
        });
        document.getElementById('emoji-trigger').onclick = () => {
            document.getElementById('emoji-picker-container').classList.toggle('hidden');
        };
    }

    // Admin Side
    const adminGrid = document.getElementById('admin-emoji-grid');
    if (adminGrid) {
        adminGrid.innerHTML = '';
        emojis.forEach(e => {
            const span = document.createElement('span');
            span.textContent = e;
            span.onclick = () => { document.getElementById('admin-message-input').value += e; };
            adminGrid.appendChild(span);
        });
        document.getElementById('admin-emoji-trigger').onclick = () => {
            document.getElementById('admin-emoji-picker-container').classList.toggle('hidden');
        };
    }
}

init();
