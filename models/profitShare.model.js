const mongoose = require('mongoose');

const profitShareSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    level: {
        type: Number,
        required: true,
        min: 1,
        max: 30
    },
    shareType: {
        type: String,
        enum: ['daily_benefit', 'level_based', 'deposit_bonus'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    percentage: {
        type: Number,
        required: true
    },
    sourceAmount: {
        type: Number,
        required: true
    },
    walletType: {
        type: String,
        enum: ['benefit', 'withdrawal', 'normal'],
        default: 'withdrawal'
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    },
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'transaction'
    },
    relatedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    },
    description: {
        type: String,
        required: true
    },
    shareDate: {
        type: Date,
        default: Date.now
    },
    processedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Indexes for efficient queries
profitShareSchema.index({ userId: 1, shareDate: -1 });
profitShareSchema.index({ shareType: 1, shareDate: -1 });
profitShareSchema.index({ level: 1, shareDate: -1 });
profitShareSchema.index({ status: 1 });

module.exports = mongoose.model('profitShare', profitShareSchema);
