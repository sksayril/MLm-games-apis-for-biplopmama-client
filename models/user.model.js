let mongoose = require('mongoose')

let schema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    wallet: {
        normal: {
            type: Number,
            default: 0
        },
        benefit: {
            type: Number,
            default: 0
        },
        game: {
            type: Number,
            default: 0
        }
    },
    referralCode: {
        type: String,
        unique: true
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        default: null
    },
    level: {
        type: Number,
        default: 0
    },
    ancestors: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user'
        },
        level: Number
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true })

module.exports = mongoose.model('user', schema)