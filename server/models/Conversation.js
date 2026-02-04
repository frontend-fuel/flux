const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Ensure unique conversation per user-admin pair (effectively one per user since there is only one admin usually, but good for data integrity)
conversationSchema.index({ userId: 1, adminId: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);
