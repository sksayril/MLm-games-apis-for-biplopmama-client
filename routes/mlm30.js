const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const MLMLevel = require('../models/mlmLevel.model');
const ProfitShare = require('../models/profitShare.model');
const { authenticateUser } = require('../middleware/auth');
const { 
    MLM_30_LEVEL_STRUCTURE,
    DAILY_PROFIT_SHARE_CONFIG,
    LEVEL_BASED_PROFIT_SHARE_CONFIG,
    buildMLMAncestorChain,
    processDailyProfitSharing,
    processLevelBasedProfitSharing,
    getMLMStatistics
} = require('../utilities/mlm30Handler');
const mlmScheduler = require('../utilities/mlmScheduler');

/**
 * Get 30-level MLM structure and configuration
 */
router.get('/structure', authenticateUser, async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            mlmStructure: MLM_30_LEVEL_STRUCTURE,
            dailyProfitShare: DAILY_PROFIT_SHARE_CONFIG,
            levelBasedProfitShare: LEVEL_BASED_PROFIT_SHARE_CONFIG,
            totalLevels: 30,
            totalPercentage: Object.values(MLM_30_LEVEL_STRUCTURE).reduce((sum, level) => sum + level.percentage, 0)
        });
    } catch (error) {
        console.error('Error fetching MLM structure:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Get comprehensive MLM statistics for authenticated user
 */
router.get('/stats', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const result = await getMLMStatistics(userId);
        
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error fetching MLM stats:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Get MLM downline by level
 */
router.get('/downline/:level?', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const level = parseInt(req.params.level) || null;
        
        let query = { 'mlmAncestors.userId': userId };
        if (level) {
            query['mlmAncestors.level'] = level;
        }
        
        const downlineUsers = await User.find(query)
            .select('name mobile referralCode mlmLevel createdAt wallet')
            .sort({ 'mlmAncestors.level': 1, createdAt: 1 });
        
        // Group by level
        const downlineByLevel = {};
        for (let i = 1; i <= 30; i++) {
            downlineByLevel[i] = downlineUsers.filter(user => 
                user.mlmAncestors.some(ancestor => 
                    ancestor.userId.toString() === userId.toString() && ancestor.level === i
                )
            );
        }
        
        res.status(200).json({
            success: true,
            downlineByLevel,
            totalDownline: downlineUsers.length,
            level: level || 'all'
        });
    } catch (error) {
        console.error('Error fetching MLM downline:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Get profit share history for authenticated user
 */
router.get('/profit-history', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const profitShares = await ProfitShare.find({ userId: userId })
            .populate('relatedUserId', 'name mobile')
            .sort({ shareDate: -1 })
            .skip(skip)
            .limit(limit);
        
        const totalCount = await ProfitShare.countDocuments({ userId: userId });
        
        res.status(200).json({
            success: true,
            profitShares,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
                hasNext: page < Math.ceil(totalCount / limit),
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching profit history:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Get earnings summary by type
 */
router.get('/earnings-summary', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        
        const earningsByType = await ProfitShare.aggregate([
            { $match: { userId: mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: '$shareType',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    lastShare: { $max: '$shareDate' }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);
        
        const monthlyEarnings = await ProfitShare.aggregate([
            { $match: { userId: mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: {
                        year: { $year: '$shareDate' },
                        month: { $month: '$shareDate' }
                    },
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 }
        ]);
        
        res.status(200).json({
            success: true,
            earningsByType,
            monthlyEarnings
        });
    } catch (error) {
        console.error('Error fetching earnings summary:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Rebuild MLM ancestor chain for current user
 */
router.post('/rebuild-chain', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const result = await buildMLMAncestorChain(userId);
        
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error rebuilding MLM chain:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Get MLM scheduler status (admin only)
 */
router.get('/scheduler/status', authenticateUser, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        const status = mlmScheduler.getStatus();
        res.status(200).json({
            success: true,
            scheduler: status
        });
    } catch (error) {
        console.error('Error fetching scheduler status:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Start MLM scheduler (admin only)
 */
router.post('/scheduler/start', authenticateUser, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        mlmScheduler.start();
        res.status(200).json({
            success: true,
            message: 'MLM scheduler started successfully'
        });
    } catch (error) {
        console.error('Error starting scheduler:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Stop MLM scheduler (admin only)
 */
router.post('/scheduler/stop', authenticateUser, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        mlmScheduler.stop();
        res.status(200).json({
            success: true,
            message: 'MLM scheduler stopped successfully'
        });
    } catch (error) {
        console.error('Error stopping scheduler:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Run daily profit sharing manually (admin only)
 */
router.post('/scheduler/run-daily', authenticateUser, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        const result = await mlmScheduler.runDailyProfitSharingNow();
        res.status(200).json(result);
    } catch (error) {
        console.error('Error running daily profit sharing:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Run level-based profit sharing manually (admin only)
 */
router.post('/scheduler/run-level-based', authenticateUser, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        const result = await mlmScheduler.runLevelBasedProfitSharingNow();
        res.status(200).json(result);
    } catch (error) {
        console.error('Error running level-based profit sharing:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Rebuild all MLM chains (admin only)
 */
router.post('/scheduler/rebuild-all-chains', authenticateUser, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        const result = await mlmScheduler.rebuildAllMLMChains();
        res.status(200).json(result);
    } catch (error) {
        console.error('Error rebuilding all MLM chains:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Get MLM analytics (admin only)
 */
router.get('/analytics', authenticateUser, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        const totalUsers = await User.countDocuments();
        const usersWithMLM = await User.countDocuments({ mlmLevel: { $gt: 0 } });
        
        const levelDistribution = await User.aggregate([
            { $match: { mlmLevel: { $gt: 0 } } },
            {
                $group: {
                    _id: '$mlmLevel',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        const totalProfitShares = await ProfitShare.aggregate([
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalCount: { $sum: 1 }
                }
            }
        ]);
        
        const profitSharesByType = await ProfitShare.aggregate([
            {
                $group: {
                    _id: '$shareType',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);
        
        res.status(200).json({
            success: true,
            analytics: {
                totalUsers,
                usersWithMLM,
                mlmParticipationRate: totalUsers > 0 ? (usersWithMLM / totalUsers * 100).toFixed(2) : 0,
                levelDistribution,
                totalProfitShares: totalProfitShares[0] || { totalAmount: 0, totalCount: 0 },
                profitSharesByType
            }
        });
    } catch (error) {
        console.error('Error fetching MLM analytics:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

module.exports = router;
