let localStream;
let remoteStream;
let peerConnection;
let currentCallUser = null;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// UI Elements
const callModal = document.getElementById('call-modal');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const callStatus = document.getElementById('call-status');
const callUsername = document.getElementById('call-username');

// Button Listeners
if (document.getElementById('btn-start-call')) {
    document.getElementById('btn-start-call').addEventListener('click', () => startCallRequest('audio'));
}
if (document.getElementById('btn-start-video')) {
    document.getElementById('btn-start-video').addEventListener('click', () => startCallRequest('video'));
}

if (document.getElementById('admin-btn-start-call')) {
    document.getElementById('admin-btn-start-call').addEventListener('click', () => {
        if (window.appState.currentChatUserId) startCallRequest('audio', window.appState.currentChatUserId);
    });
}
if (document.getElementById('admin-btn-start-video')) {
    document.getElementById('admin-btn-start-video').addEventListener('click', () => {
        if (window.appState.currentChatUserId) startCallRequest('video', window.appState.currentChatUserId);
    });
}

document.getElementById('btn-answer-call').addEventListener('click', answerCall);
document.getElementById('btn-reject-call').addEventListener('click', rejectCall);
document.getElementById('btn-end-call').addEventListener('click', endCall);

if (document.getElementById('btn-mute-mic')) {
    document.getElementById('btn-mute-mic').addEventListener('click', toggleMute);
}

// --- Functions ---

async function startCallRequest(type, targetUserId = null) {
    let displayUsername = 'Support';
    if (targetUserId) {
        displayUsername = document.getElementById('chat-with-username').textContent || 'User';
        currentCallUser = targetUserId;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === 'video'
        });
        localStream = stream;
        localVideo.srcObject = stream;

        callModal.classList.remove('hidden');
        document.getElementById('video-container').classList.remove('hidden');
        document.getElementById('btn-end-call').classList.remove('hidden');
        document.getElementById('btn-answer-call').classList.add('hidden');
        document.getElementById('btn-reject-call').classList.add('hidden');

        callStatus.textContent = `Calling...`;
        callUsername.textContent = displayUsername;

        const payload = { type };
        if (targetUserId) payload.to = targetUserId;
        window.appState.socket.emit('call:request', payload);

    } catch (err) {
        console.error(err);
        showToast('Camera/Microphone access denied', 'error');
    }
}

function receiveCall(data) {
    currentCallUser = data.from;
    callModal.classList.remove('hidden');
    callUsername.textContent = data.username;
    callStatus.textContent = `Incoming ${data.type} call...`;

    document.getElementById('btn-answer-call').classList.remove('hidden');
    document.getElementById('btn-reject-call').classList.remove('hidden');
    document.getElementById('btn-end-call').classList.add('hidden');
    document.getElementById('video-container').classList.add('hidden');

    window.incomingCallType = data.type;
}

function rejectCall() {
    callModal.classList.add('hidden');
    window.appState.socket.emit('call:respond', { to: currentCallUser, accepted: false });
    cleanupCall();
}

async function answerCall() {
    document.getElementById('btn-answer-call').classList.add('hidden');
    document.getElementById('btn-reject-call').classList.add('hidden');
    document.getElementById('btn-end-call').classList.remove('hidden');
    document.getElementById('video-container').classList.remove('hidden');

    callStatus.textContent = 'Connecting...';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: window.incomingCallType === 'video'
        });
        localStream = stream;
        localVideo.srcObject = stream;

        window.appState.socket.emit('call:respond', { to: currentCallUser, accepted: true });
        createPeerConnection();

    } catch (err) {
        console.error(err);
        showToast('Could not access media', 'error');
        rejectCall();
    }
}

async function handleCallResponse(data) {
    if (data.accepted) {
        callStatus.textContent = 'Connected';
        currentCallUser = data.from;
        createPeerConnection();

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            window.appState.socket.emit('webrtc:offer', { to: currentCallUser, offer });
        } catch (err) { console.error(err); }

    } else {
        showToast('Call declined', 'info');
        cleanupCall();
        callModal.classList.add('hidden');
    }
}

async function handleWebRTCOffer(data) {
    if (!peerConnection) createPeerConnection();
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        window.appState.socket.emit('webrtc:answer', { to: data.from, answer });
    } catch (err) { console.error(err); }
}

async function handleWebRTCAnswer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (err) { console.error(err); }
}

async function handleWebRTCIce(data) {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (err) { console.error(err); }
}

function createPeerConnection() {
    if (peerConnection) return;
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            window.appState.socket.emit('webrtc:ice', { to: currentCallUser, candidate: event.candidate });
        }
    };

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

function endCall() {
    cleanupCall();
    callModal.classList.add('hidden');
}

function cleanupCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
}

function toggleMute() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const enabled = audioTracks[0].enabled;
            audioTracks[0].enabled = !enabled;
            const btn = document.getElementById('btn-mute-mic');
            btn.innerHTML = enabled ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
            btn.style.background = enabled ? 'rgba(239, 68, 68, 0.8)' : 'rgba(255, 255, 255, 0.2)';
        }
    }
}
