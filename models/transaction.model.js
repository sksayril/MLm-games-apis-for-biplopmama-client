const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    type: {
        type: String,
        enum: ['recharge', 'bonus', 'withdrawal', 'transfer', 'game', 'referral_bonus'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    walletType: {
        type: String,
        enum: ['normal', 'benefit', 'game'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    },
    description: {
        type: String
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    }
}, { timestamps: true });

module.exports = mongoose.model('transaction', transactionSchema);
