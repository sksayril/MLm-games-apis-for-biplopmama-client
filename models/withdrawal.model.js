const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 500
    },
    withdrawalMethod: {
        type: String,
        enum: ['upi', 'bank'],
        required: true
    },
    upiId: {
        type: String,
        required: function() {
            return this.withdrawalMethod === 'upi';
        }
    },
    bankDetails: {
        accountNumber: {
            type: String,
            required: function() {
                return this.withdrawalMethod === 'bank';
            }
        },
        ifscCode: {
            type: String,
            required: function() {
                return this.withdrawalMethod === 'bank';
            }
        },
        accountName: {
            type: String,
            required: function() {
                return this.withdrawalMethod === 'bank';
            }
        }
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    remarks: {
        type: String,
        default: ''
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'admin',
        default: null
    },
    processedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('withdrawal', withdrawalSchema);
