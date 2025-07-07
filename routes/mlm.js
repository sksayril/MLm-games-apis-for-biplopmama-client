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
    
    // Get all users in the downline with their level information
    const downlineUsers = await User.aggregate([
      { $match: { 'ancestors.userId': userId } },
      { $unwind: '$ancestors' },
      { $match: { 'ancestors.userId': userId } },
      { $project: {
        _id: 1,
        name: 1,
        mobile: 1,
        referralCode: 1,
        level: '$ancestors.level',
        createdAt: 1
      }},
      { $sort: { level: 1, createdAt: 1 } }
    ]);
    
    // Group users by level
    const usersByLevel = {};
    for (let level = 1; level <= 10; level++) {
      usersByLevel[level] = downlineUsers.filter(user => user.level === level);
    }
    
    // Create a structured representation of the MLM levels with user details
    const mlmLevels = [];
    for (let level = 1; level <= 10; level++) {
      const usersAtLevel = usersByLevel[level] || [];
      
      mlmLevels.push({
        level,
        rate: MLM_BONUS_RATES[level],
        referralsCount: usersAtLevel.length,
        potentialEarnings: `${MLM_BONUS_RATES[level]}% of transactions`,
        users: usersAtLevel.map(user => ({
          name: user.name,
          mobile: user.mobile,
          referralCode: user.referralCode,
          joinedAt: user.createdAt
        }))
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
        totalNetworkSize: downlineUsers.length,
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
