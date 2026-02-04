const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Simple in-memory storage for online user status
const onlineUsers = new Map(); // userId -> { role, status: 'online' }

const socketHandler = (io) => {
    io.use(async (socket, next) => {
        let token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication error: Token required'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-passwordHash');
            if (!user) return next(new Error('Authentication error: User not found'));
            socket.user = user;
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.user._id.toString();
        console.log(`User connected: ${socket.user.username} (${socket.user.role})`);

        // Track and notify
        onlineUsers.set(userId, { role: socket.user.role, username: socket.user.username });

        socket.join(userId);
        if (socket.user.role === 'ADMIN') {
            socket.join('admins');
            // Notify all users admin is online
            io.emit('admin:status', { status: 'online' });
        } else {
            // Notify admins user is online
            io.to('admins').emit('user:status', { userId, status: 'online' });

            // Send current Admin status to JUST this user
            const isAdminOnline = [...onlineUsers.values()].some(u => u.role === 'ADMIN');
            if (isAdminOnline) {
                socket.emit('admin:status', { status: 'online' });
            } else {
                // Might want to fetch lastKnown Admin from DB? For now default offline.
            }
        }

        // --- WebRTC Signaling ---
        socket.on('call:request', (data) => {
            if (socket.user.role === 'USER') {
                io.to('admins').emit('call:incoming', {
                    from: socket.user._id,
                    username: socket.user.username,
                    type: data.type
                });
            } else if (socket.user.role === 'ADMIN' && data.to) {
                io.to(data.to).emit('call:incoming', {
                    from: socket.user._id,
                    username: 'Admin',
                    type: data.type
                });
            }
        });

        socket.on('call:respond', (data) => {
            io.to(data.to).emit('call:response', {
                accepted: data.accepted,
                from: socket.user._id
            });
        });

        socket.on('webrtc:offer', (data) => {
            io.to(data.to).emit('webrtc:offer', { from: socket.user._id, offer: data.offer });
        });

        socket.on('webrtc:answer', (data) => {
            io.to(data.to).emit('webrtc:answer', { from: socket.user._id, answer: data.answer });
        });

        socket.on('webrtc:ice', (data) => {
            io.to(data.to).emit('webrtc:ice', { from: socket.user._id, candidate: data.candidate });
        });

        socket.on('disconnect', async () => {
            console.log('User disconnected');
            onlineUsers.delete(userId);

            try {
                const lastSeen = Date.now();
                await User.findByIdAndUpdate(userId, { lastSeen });

                if (socket.user.role === 'USER') {
                    io.to('admins').emit('user:status', { userId, status: 'offline', lastSeen });
                } else if (socket.user.role === 'ADMIN') {
                    // Only broadcast offline if NO other admin is online
                    const anyAdmin = [...onlineUsers.values()].some(u => u.role === 'ADMIN');
                    if (!anyAdmin) {
                        io.emit('admin:status', { status: 'offline', lastSeen });
                    }
                }
            } catch (err) {
                console.error('Error updating lastSeen:', err);
            }
        });
    });
};

module.exports = socketHandler;
