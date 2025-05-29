const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        // Set default to 200 days from now
        default: function() {
            const date = new Date();
            date.setDate(date.getDate() + 200);
            return date;
        }
    },
    daysGrown: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    normalGrowthRate: {
        type: Number,
        default: 0.05 // 5% daily growth
    },
    benefitGrowthRate: {
        type: Number,
        default: 0.10 // 10% daily growth
    },
    totalNormalGrowth: {
        type: Number,
        default: 0
    },
    totalBenefitGrowth: {
        type: Number,
        default: 0
    },
    lastGrowthDate: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('deposit', depositSchema);
