const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const { authenticateUser } = require('../middleware/auth');
const { MLM_BONUS_RATES } = require('../utilities/mlmHandler');

/**
 * Get MLM referral stats for the authenticated user
 * Shows their earnings potential per level based on the MLM structure
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get user data with populated ancestors
    const user = await User.findById(userId)
      .populate({
        path: 'ancestors.userId',
        select: 'name mobile'
      });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Get direct referrals (users who have the current user as their referrer)
    const directReferrals = await User.find({ referredBy: userId })
      .select('name mobile referralCode level createdAt');
    
    // Count users at each level in the downline
    const levelCounts = await User.aggregate([
      { $match: { 'ancestors.userId': userId } },
      { $unwind: '$ancestors' },
      { $match: { 'ancestors.userId': userId } },
      { $group: { 
        _id: '$ancestors.level',
        count: { $sum: 1 }
      }}
    ]);
    
    // Create a structured representation of the MLM levels
    const mlmLevels = [];
    for (let level = 1; level <= 10; level++) {
      const levelData = levelCounts.find(l => l._id === level);
      const count = levelData ? levelData.count : 0;
      
      mlmLevels.push({
        level,
        rate: MLM_BONUS_RATES[level],
        referralsCount: count,
        potentialEarnings: `${MLM_BONUS_RATES[level]}% of transactions`
      });
    }
    
    // Get last 5 MLM bonus transactions received
    const recentBonuses = await Transaction.find({
      userId: userId,
      type: 'mlm_bonus'
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('amount walletType description transactionDate');
    
    res.status(200).json({
      success: true,
      user: {
        name: user.name,
        mobile: user.mobile,
        referralCode: user.referralCode,
        level: user.level
      },
      mlmStats: {
        directReferrals: directReferrals.length,
        totalNetworkSize: levelCounts.reduce((sum, level) => sum + level.count, 0),
        levels: mlmLevels
      },
      directReferrals,
      recentBonuses
    });
  } catch (error) {
    console.error('Error fetching MLM stats:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;
