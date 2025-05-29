const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['waiting', 'in_progress', 'completed'],
        default: 'waiting'
    },
    entryFee: {
        type: Number,
        default: 50 // Default 50 Rs per user
    },
    benefitFeeMultiplier: {
        type: Number,
        default: 2 // How much more is taken from benefit wallet (2 = double)
    },
    winningAmount: {
        type: Number,
        default: 100 // Default 100 Rs winning amount
    },
    maxPlayers: {
        type: Number,
        default: 20
    },
    currentPlayers: {
        type: Number,
        default: 0
    },
    availableColors: [{
        type: String,
        enum: ['red', 'green', 'blue', 'yellow']
    }],
    winningColor: {
        type: String,
        enum: ['red', 'green', 'blue', 'yellow']
    },
    colorCounts: {
        red: { type: Number, default: 0 },
        green: { type: Number, default: 0 },
        blue: { type: Number, default: 0 },
        yellow: { type: Number, default: 0 }
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'admin'
    },
    startTime: {
        type: Date
    },
    endTime: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Default available colors if none specified
gameRoomSchema.pre('save', function(next) {
    if (!this.availableColors || this.availableColors.length === 0) {
        this.availableColors = ['red', 'green', 'blue', 'yellow'];
    }
    next();
});

module.exports = mongoose.model('gameRoom', gameRoomSchema);
