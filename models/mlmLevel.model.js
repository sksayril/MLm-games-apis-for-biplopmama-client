const mongoose = require('mongoose');

const mlmLevelSchema = new mongoose.Schema({
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
    directReferrals: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    }],
    totalReferrals: {
        type: Number,
        default: 0
    },
    profitSharePercentage: {
        type: Number,
        required: true
    },
    dailyProfitShare: {
        type: Number,
        default: 0
    },
    totalEarnings: {
        type: Number,
        default: 0
    },
    lastProfitShareDate: {
        type: Date,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Index for efficient queries
mlmLevelSchema.index({ userId: 1, level: 1 }, { unique: true });
mlmLevelSchema.index({ level: 1 });
mlmLevelSchema.index({ isActive: 1 });

module.exports = mongoose.model('mlmLevel', mlmLevelSchema);
