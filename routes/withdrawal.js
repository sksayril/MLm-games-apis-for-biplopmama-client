const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const auth = require('../middleware/auth');
const { processWithdrawal, processInstantReferralBonus } = require('../utilities/withdrawalHandler');

// Get withdrawal wallet balance
router.get('/balance', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            balance: user.wallet.withdrawal,
            daysGrown: user.wallet.withdrawalDaysGrown,
            remainingDays: Math.max(0, 400 - user.wallet.withdrawalDaysGrown)
        });
    } catch (error) {
        console.error('Error fetching withdrawal balance:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Process a withdrawal request
router.post('/request', auth, async (req, res) => {
    try {
        const { amount } = req.body;
        
        // Validate amount
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
        }
        
        const result = await processWithdrawal(req.user.id, amount, 'withdrawal');
        res.json(result);
    } catch (error) {
        console.error('Error processing withdrawal request:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get withdrawal history for a user
router.get('/history', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({
            userId: req.user.id,
            type: 'withdrawal'
        }).sort({ createdAt: -1 });
        
        res.json({ success: true, transactions });
    } catch (error) {
        console.error('Error fetching withdrawal history:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Admin route - Process a withdrawal request
router.post('/admin/process/:id', auth, async (req, res) => {
    try {
        // Check if user is admin
        const user = await User.findById(req.user.id);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        
        const { id } = req.params;
        const { status, remarks } = req.body;
        
        // Validate status
        if (status !== 'completed' && status !== 'rejected') {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        
        // Find and update the transaction
        const transaction = await Transaction.findById(id);
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }
        
        transaction.status = status;
        if (remarks) {
            transaction.remarks = remarks;
        }
        
        await transaction.save();
        
        res.json({ success: true, message: 'Withdrawal request updated', transaction });
    } catch (error) {
        console.error('Error processing admin withdrawal update:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
