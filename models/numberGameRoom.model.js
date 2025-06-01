const mongoose = require('mongoose');

const numberGameRoomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        unique: true
    },
    entryFee: {
        type: Number,
        required: true,
        default: 50
    },
    winningMultiplier: {
        type: Number,
        default: 2
    },
    maxPlayers: {
        type: Number,
        default: 10
    },
    currentPlayers: {
        type: Number,
        default: 0
    },
    // Track players who chose big (6-9)
    bigPlayers: {
        type: Number,
        default: 0
    },
    // Track players who chose small (1-5)
    smallPlayers: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['waiting', 'inProgress', 'completed'],
        default: 'waiting'
    },
    winningType: {
        type: String,
        enum: ['big', 'small', null],
        default: null
    },
    startTime: {
        type: Date
    },
    endTime: {
        type: Date
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    }
}, { timestamps: true });

// Generate a unique roomId before saving if not provided
numberGameRoomSchema.pre('save', function(next) {
    // Only generate a roomId if this is a new document (not an update)
    if (this.isNew && !this.roomId) {
        // Generate a random code with timestamp to ensure uniqueness
        const timestamp = new Date().getTime().toString(36).substring(4);
        const random = Math.random().toString(36).substring(2, 7).toUpperCase();
        this.roomId = `NUM-${random}-${timestamp}`;
    }
    next();
});

module.exports = mongoose.model('numberGameRoom', numberGameRoomSchema);
