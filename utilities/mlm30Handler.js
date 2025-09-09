const mongoose = require('mongoose');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const MLMLevel = require('../models/mlmLevel.model');
const ProfitShare = require('../models/profitShare.model');

/**
 * 30-Level MLM Structure with Profit Sharing Percentages
 * Based on the requirements:
 * Level 1: 15%, Level 2: 10%, Level 3: 5%, Level 4: 3%, Level 5: 4%
 * Levels 5-10: 15%, Levels 11-20: 25%, Levels 21-30: 45-50%
 */
const MLM_30_LEVEL_STRUCTURE = {
    // Individual levels (1-5)
    1: { percentage: 15.0, description: "Level 1 - Direct Referral" },
    2: { percentage: 10.0, description: "Level 2 - Second Level" },
    3: { percentage: 5.0, description: "Level 3 - Third Level" },
    4: { percentage: 3.0, description: "Level 4 - Fourth Level" },
    5: { percentage: 4.0, description: "Level 5 - Fifth Level" },
    
    // Grouped levels (6-10): 15% total
    6: { percentage: 3.0, description: "Level 6 - Group 1" },
    7: { percentage: 3.0, description: "Level 7 - Group 1" },
    8: { percentage: 3.0, description: "Level 8 - Group 1" },
    9: { percentage: 3.0, description: "Level 9 - Group 1" },
    10: { percentage: 3.0, description: "Level 10 - Group 1" },
    
    // Grouped levels (11-20): 25% total
    11: { percentage: 2.5, description: "Level 11 - Group 2" },
    12: { percentage: 2.5, description: "Level 12 - Group 2" },
    13: { percentage: 2.5, description: "Level 13 - Group 2" },
    14: { percentage: 2.5, description: "Level 14 - Group 2" },
    15: { percentage: 2.5, description: "Level 15 - Group 2" },
    16: { percentage: 2.5, description: "Level 16 - Group 2" },
    17: { percentage: 2.5, description: "Level 17 - Group 2" },
    18: { percentage: 2.5, description: "Level 18 - Group 2" },
    19: { percentage: 2.5, description: "Level 19 - Group 2" },
    20: { percentage: 2.5, description: "Level 20 - Group 2" },
    
    // Grouped levels (21-30): 45% total
    21: { percentage: 4.5, description: "Level 21 - Group 3" },
    22: { percentage: 4.5, description: "Level 22 - Group 3" },
    23: { percentage: 4.5, description: "Level 23 - Group 3" },
    24: { percentage: 4.5, description: "Level 24 - Group 3" },
    25: { percentage: 4.5, description: "Level 25 - Group 3" },
    26: { percentage: 4.5, description: "Level 26 - Group 3" },
    27: { percentage: 4.5, description: "Level 27 - Group 3" },
    28: { percentage: 4.5, description: "Level 28 - Group 3" },
    29: { percentage: 4.5, description: "Level 29 - Group 3" },
    30: { percentage: 4.5, description: "Level 30 - Group 3" }
};

/**
 * Daily Profit Sharing Configuration
 * 1% from benefit wallet distributed daily
 */
const DAILY_PROFIT_SHARE_CONFIG = {
    percentage: 1.0, // 1% of benefit wallet
    description: "Daily 1% profit share from benefit wallet"
};

/**
 * Level-based Profit Sharing Configuration
 * 0.5% per level for each user based on their MLM level
 */
const LEVEL_BASED_PROFIT_SHARE_CONFIG = {
    percentagePerLevel: 0.5, // 0.5% per level
    description: "Level-based profit sharing (0.5% per level)"
};

/**
 * Build MLM ancestor chain for a user (up to 30 levels)
 * @param {string} userId - The user ID to build ancestors for
 * @param {Object} session - MongoDB session
 * @returns {Object} - Result of building ancestor chain
 */
const buildMLMAncestorChain = async (userId, session = null) => {
    try {
        const user = await User.findById(userId).session(session);
        if (!user) {
            return { success: false, message: 'User not found' };
        }

        const mlmAncestors = [];
        let currentUser = user;
        let level = 1;

        // Build ancestor chain up to 30 levels
        while (currentUser.referredBy && level <= 30) {
            const ancestor = await User.findById(currentUser.referredBy).session(session);
            if (!ancestor) break;

            mlmAncestors.push({
                userId: ancestor._id,
                level: level,
                profitSharePercentage: MLM_30_LEVEL_STRUCTURE[level]?.percentage || 0
            });

            currentUser = ancestor;
            level++;
        }

        // Update user's MLM ancestors
        user.mlmAncestors = mlmAncestors;
        user.mlmLevel = level - 1; // Current user's MLM level
        await user.save({ session });

        return { 
            success: true, 
            message: 'MLM ancestor chain built successfully',
            ancestors: mlmAncestors,
            userLevel: level - 1
        };
    } catch (error) {
        console.error('Error building MLM ancestor chain:', error);
        return { 
            success: false, 
            message: 'Error building MLM ancestor chain', 
            error: error.message 
        };
    }
};

/**
 * Process daily profit sharing (1% from benefit wallet)
 * @param {Object} session - MongoDB session
 * @returns {Object} - Result of daily profit sharing
 */
const processDailyProfitSharing = async (session = null) => {
    const mongoSession = session || await mongoose.startSession();
    if (!session) mongoSession.startTransaction();

    try {
        // Get all users with benefit wallet balance > 0
        const usersWithBenefit = await User.find({
            'wallet.benefit': { $gt: 0 }
        }).session(mongoSession);

        const profitShareResults = [];

        for (const user of usersWithBenefit) {
            const benefitAmount = user.wallet.benefit;
            const shareAmount = (benefitAmount * DAILY_PROFIT_SHARE_CONFIG.percentage) / 100;

            if (shareAmount > 0) {
                // Distribute to user's MLM ancestors
                const distributionResult = await distributeProfitToAncestors(
                    user._id,
                    shareAmount,
                    'daily_benefit',
                    mongoSession
                );

                if (distributionResult.success) {
                    profitShareResults.push({
                        userId: user._id,
                        benefitAmount,
                        shareAmount,
                        distributions: distributionResult.distributions
                    });
                }
            }
        }

        if (!session) await mongoSession.commitTransaction();
        
        return {
            success: true,
            message: 'Daily profit sharing completed successfully',
            totalUsers: usersWithBenefit.length,
            distributions: profitShareResults
        };
    } catch (error) {
        if (!session) await mongoSession.abortTransaction();
        console.error('Error processing daily profit sharing:', error);
        return {
            success: false,
            message: 'Error processing daily profit sharing',
            error: error.message
        };
    } finally {
        if (!session) mongoSession.endSession();
    }
};

/**
 * Process level-based profit sharing (0.5% per level)
 * @param {Object} session - MongoDB session
 * @returns {Object} - Result of level-based profit sharing
 */
const processLevelBasedProfitSharing = async (session = null) => {
    const mongoSession = session || await mongoose.startSession();
    if (!session) mongoSession.startTransaction();

    try {
        // Get all users with MLM level > 0
        const usersWithLevels = await User.find({
            mlmLevel: { $gt: 0 }
        }).session(mongoSession);

        const profitShareResults = [];

        for (const user of usersWithLevels) {
            const levelPercentage = user.mlmLevel * LEVEL_BASED_PROFIT_SHARE_CONFIG.percentagePerLevel;
            const benefitAmount = user.wallet.benefit;
            const shareAmount = (benefitAmount * levelPercentage) / 100;

            if (shareAmount > 0) {
                // Distribute to user's MLM ancestors
                const distributionResult = await distributeProfitToAncestors(
                    user._id,
                    shareAmount,
                    'level_based',
                    mongoSession
                );

                if (distributionResult.success) {
                    profitShareResults.push({
                        userId: user._id,
                        mlmLevel: user.mlmLevel,
                        levelPercentage,
                        benefitAmount,
                        shareAmount,
                        distributions: distributionResult.distributions
                    });
                }
            }
        }

        if (!session) await mongoSession.commitTransaction();
        
        return {
            success: true,
            message: 'Level-based profit sharing completed successfully',
            totalUsers: usersWithLevels.length,
            distributions: profitShareResults
        };
    } catch (error) {
        if (!session) await mongoSession.abortTransaction();
        console.error('Error processing level-based profit sharing:', error);
        return {
            success: false,
            message: 'Error processing level-based profit sharing',
            error: error.message
        };
    } finally {
        if (!session) mongoSession.endSession();
    }
};

/**
 * Distribute profit to user's MLM ancestors
 * @param {string} userId - User ID whose ancestors will receive profit
 * @param {number} totalAmount - Total amount to distribute
 * @param {string} shareType - Type of profit sharing
 * @param {Object} session - MongoDB session
 * @returns {Object} - Distribution result
 */
const distributeProfitToAncestors = async (userId, totalAmount, shareType, session) => {
    try {
        const user = await User.findById(userId).session(session);
        if (!user || !user.mlmAncestors || user.mlmAncestors.length === 0) {
            return { success: true, message: 'No ancestors to distribute to', distributions: [] };
        }

        const distributions = [];
        let totalDistributed = 0;

        for (const ancestor of user.mlmAncestors) {
            const ancestorLevel = ancestor.level;
            const percentage = ancestor.profitSharePercentage;
            const shareAmount = (totalAmount * percentage) / 100;

            if (shareAmount > 0) {
                // Update ancestor's wallet
                const ancestorUser = await User.findById(ancestor.userId).session(session);
                if (ancestorUser) {
                    ancestorUser.wallet.withdrawal += shareAmount;
                    ancestorUser.mlmEarnings.total += shareAmount;
                    
                    if (shareType === 'daily_benefit') {
                        ancestorUser.mlmEarnings.daily += shareAmount;
                    } else if (shareType === 'level_based') {
                        ancestorUser.mlmEarnings.levelBased += shareAmount;
                    }
                    
                    await ancestorUser.save({ session });

                    // Create profit share record
                    const profitShare = new ProfitShare({
                        userId: ancestorUser._id,
                        level: ancestorLevel,
                        shareType: shareType,
                        amount: shareAmount,
                        percentage: percentage,
                        sourceAmount: totalAmount,
                        walletType: 'withdrawal',
                        status: 'completed',
                        description: `${percentage}% ${shareType} profit share from level ${ancestorLevel}`,
                        relatedUserId: userId
                    });
                    await profitShare.save({ session });

                    // Create transaction record
                    const transaction = new Transaction({
                        userId: ancestorUser._id,
                        type: 'mlm_profit_share',
                        amount: shareAmount,
                        walletType: 'withdrawal',
                        description: `${percentage}% ${shareType} profit share from level ${ancestorLevel}`,
                        status: 'completed',
                        relatedUser: userId,
                        transactionDate: new Date()
                    });
                    await transaction.save({ session });

                    distributions.push({
                        ancestorId: ancestorUser._id,
                        level: ancestorLevel,
                        percentage: percentage,
                        amount: shareAmount
                    });

                    totalDistributed += shareAmount;
                }
            }
        }

        return {
            success: true,
            message: 'Profit distributed successfully',
            totalDistributed,
            distributions
        };
    } catch (error) {
        console.error('Error distributing profit to ancestors:', error);
        return {
            success: false,
            message: 'Error distributing profit to ancestors',
            error: error.message
        };
    }
};

/**
 * Get MLM statistics for a user
 * @param {string} userId - User ID
 * @returns {Object} - MLM statistics
 */
const getMLMStatistics = async (userId) => {
    try {
        const user = await User.findById(userId)
            .populate('mlmAncestors.userId', 'name mobile referralCode');

        if (!user) {
            return { success: false, message: 'User not found' };
        }

        // Get direct referrals
        const directReferrals = await User.find({ referredBy: userId })
            .select('name mobile referralCode mlmLevel createdAt');

        // Get all downline users
        const downlineUsers = await User.find({
            'mlmAncestors.userId': userId
        }).select('name mobile referralCode mlmLevel createdAt');

        // Get profit share history
        const profitShares = await ProfitShare.find({ userId: userId })
            .sort({ shareDate: -1 })
            .limit(10);

        // Calculate earnings by type
        const earningsByType = await ProfitShare.aggregate([
            { $match: { userId: mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: '$shareType',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        return {
            success: true,
            user: {
                name: user.name,
                mobile: user.mobile,
                referralCode: user.referralCode,
                mlmLevel: user.mlmLevel,
                mlmEarnings: user.mlmEarnings
            },
            statistics: {
                directReferrals: directReferrals.length,
                totalDownline: downlineUsers.length,
                earningsByType,
                recentProfitShares: profitShares
            },
            directReferrals,
            downlineUsers: downlineUsers.slice(0, 20) // Limit for performance
        };
    } catch (error) {
        console.error('Error getting MLM statistics:', error);
        return {
            success: false,
            message: 'Error getting MLM statistics',
            error: error.message
        };
    }
};

module.exports = {
    MLM_30_LEVEL_STRUCTURE,
    DAILY_PROFIT_SHARE_CONFIG,
    LEVEL_BASED_PROFIT_SHARE_CONFIG,
    buildMLMAncestorChain,
    processDailyProfitSharing,
    processLevelBasedProfitSharing,
    distributeProfitToAncestors,
    getMLMStatistics
};
