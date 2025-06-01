const mongoose = require('mongoose');

const numberGamePlayerSchema = new mongoose.Schema({
    gameRoomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'numberGameRoom',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    numberType: {
        type: String,
        enum: ['big', 'small'],  // big (6-9) or small (1-5)
        required: true
    },
    entryAmount: {
        type: Number,
        required: true
    },
    hasWon: {
        type: Boolean,
        default: false
    },
    paymentDetails: {
        gameWalletDeduction: {
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
numberGamePlayerSchema.index({ gameRoomId: 1, userId: 1 });

module.exports = mongoose.model('numberGamePlayer', numberGamePlayerSchema);
