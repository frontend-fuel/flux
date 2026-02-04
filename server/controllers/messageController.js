const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

// @desc    Get current user's messages
// @route   GET /api/me/messages
// @access  Private
const getMyMessages = async (req, res) => {
    try {
        const conversation = await Conversation.findOne({ userId: req.user._id });

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

// @desc    Send message to Admin
// @route   POST /api/me/messages
// @access  Private
const sendMessageToAdmin = async (req, res) => {
    const { text } = req.body;
    const userId = req.user._id;

    try {
        let conversation = await Conversation.findOne({ userId });

        if (!conversation) {
            // Find an admin to assign
            const admin = await User.findOne({ role: 'ADMIN' });
            if (!admin) {
                return res.status(500).json({ message: 'No admin available to receive message' });
            }

            conversation = await Conversation.create({
                userId,
                adminId: admin._id,
                lastMessageAt: Date.now()
            });
        } else {
            conversation.lastMessageAt = Date.now();
            await conversation.save();
        }

        const message = await Message.create({
            conversationId: conversation._id,
            senderId: userId,
            senderRole: 'USER',
            text
        });

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            // Notify admins
            io.to('admins').emit('message:new', message);
            // Confirm to sender (optional, but consistent)
            // io.to(userId.toString()).emit('message:new', message);
        }

        res.status(201).json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getMyMessages,
    sendMessageToAdmin
};
