const mongoose = require('mongoose');

const gamePlayerSchema = new mongoose.Schema({
    gameRoomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'gameRoom',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    colorSelected: {
        type: String,
        enum: ['red', 'green', 'blue', 'yellow'],
        required: true
    },
    hasWon: {
        type: Boolean,
        default: false
    },
    paymentDetails: {
        normalWalletDeduction: {
            type: Number,
            default: 0
        },
        benefitWalletDeduction: {
            type: Number,
            default: 0
        },
        totalPaid: {
            type: Number,
            default: 0
        }
    },
    amountWon: {
        type: Number,
        default: 0
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Regular index for query performance without uniqueness constraint
// This allows a user to join a game room multiple times
gamePlayerSchema.index({ gameRoomId: 1, userId: 1 });

module.exports = mongoose.model('gamePlayer', gamePlayerSchema);
