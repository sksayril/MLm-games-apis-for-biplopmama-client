const mongoose = require('mongoose');

const depositRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    requestDate: {
        type: Date,
        default: Date.now
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'admin'
    },
    approvedDate: {
        type: Date
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'admin'
    },
    rejectedDate: {
        type: Date
    },
    rejectionReason: {
        type: String
    },
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'transaction'
    },
    notes: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('depositRequest', depositRequestSchema);
