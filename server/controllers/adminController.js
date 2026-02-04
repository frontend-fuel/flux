const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const bcrypt = require('bcrypt');

// @desc    Create a new user
// @route   POST /api/admin/users
// @access  Private/Admin
const createUser = async (req, res) => {
    const { username, password } = req.body;

    try {
        const userExists = await User.findOne({ username });

        if (userExists) {
            console.log(`Failed to create user: ${username} already exists`);
            return res.status(400).json({ message: `User '${username}' already exists` });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const user = await User.create({
            username,
            passwordHash,
            role: 'USER'
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                username: user.username,
                role: user.role
            });

            // Emit socket event to admins
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('user:updated', { type: 'create', user });
            }
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 'USER' }).select('-passwordHash').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update user (disable/reset password)
// @route   PATCH /api/admin/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
    const { active, password } = req.body;
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (typeof active !== 'undefined') {
            user.active = active;
        }

        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.passwordHash = await bcrypt.hash(password, salt);
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            username: updatedUser.username,
            active: updatedUser.active
        });

        // Emit socket event to admins
        const io = req.app.get('io');
        if (io) {
            io.to('admins').emit('user:updated', { type: 'update', user: updatedUser });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get messages for a specific user (Admin View)
// @route   GET /api/admin/conversations/:userId/messages
// @access  Private/Admin
const getUserMessages = async (req, res) => {
    try {
        let conversation = await Conversation.findOne({ userId: req.params.userId });

        if (!conversation) {
            return res.json([]);
        }

        const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
        res.json(messages);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Send message to a user (Admin View)
// @route   POST /api/admin/messages/:userId
// @access  Private/Admin
const sendMessageToUser = async (req, res) => {
    const { text } = req.body;
    const userId = req.params.userId;
    const adminId = req.user._id;

    try {
        let conversation = await Conversation.findOne({ userId, adminId });

        if (!conversation) {
            conversation = await Conversation.create({
                userId,
                adminId,
                lastMessageAt: Date.now()
            });
        } else {
            conversation.lastMessageAt = Date.now();
            await conversation.save();
        }

        const message = await Message.create({
            conversationId: conversation._id,
            senderId: adminId,
            senderRole: 'ADMIN',
            text
        });

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(userId).emit('message:new', message);
        }

        res.status(201).json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};


module.exports = {
    createUser,
    getUsers,
    updateUser,
    getUserMessages,
    sendMessageToUser
};
