const mongoose = require('mongoose');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');

/**
 * MLM referral bonus rates per level (in percentage)
 * Total is 10% distributed across 10 levels
 */
const MLM_BONUS_RATES = {
    1: 4.00,  // Level 1 - 4.00%
    2: 2.00,  // Level 2 - 2.00%
    3: 1.00,  // Level 3 - 1.00%
    4: 0.50,  // Level 4 - 0.50%
    5: 0.40,  // Level 5 - 0.40%
    6: 0.30,  // Level 6 - 0.30%
    7: 0.30,  // Level 7 - 0.30%
    8: 0.40,  // Level 8 - 0.40%
    9: 0.50,  // Level 9 - 0.50%
    10: 0.60  // Level 10 - 0.60%
};

/**
 * Process MLM referral bonus distribution across 10 levels
 * @param {string} userId - The ID of the user making the transaction
 * @param {number} amount - The amount being transacted
 * @param {string} transactionType - Type of transaction (e.g., 'withdrawal', 'deposit')
 * @returns {Object} - The result of the MLM bonus operation
 */
const processMLMReferralBonus = async (userId, amount, transactionType) => {
    // Start a MongoDB session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Find the user making the transaction
        const user = await User.findById(userId)
            .populate({
                path: 'ancestors.userId',
                select: 'name wallet'
            })
            .session(session);
        
        if (!user) {
            await session.abortTransaction();
            return { success: false, message: 'User not found' };
        }
        
        // If user has no ancestors, no bonuses to distribute
        if (!user.ancestors || user.ancestors.length === 0) {
            await session.commitTransaction();
            return { success: true, message: 'No ancestors to distribute bonus to' };
        }
        
        const bonusTransactions = [];
        
        // Distribute bonuses to each ancestor based on their level
        for (const ancestor of user.ancestors) {
            const ancestorLevel = ancestor.level;
            
            // Only process if level is within our MLM structure (1-10)
            if (ancestorLevel >= 1 && ancestorLevel <= 10) {
                const bonusRate = MLM_BONUS_RATES[ancestorLevel];
                const bonusAmount = (amount * bonusRate) / 100; // Convert percentage to amount
                
                if (bonusAmount > 0) {
                    // Find the ancestor user to update their wallet
                    const ancestorUser = await User.findById(ancestor.userId._id).session(session);
                    
                    if (ancestorUser) {
                        // Add bonus to ancestor's withdrawal wallet
                        // This is the key change - bonuses go to withdrawal wallet instead of benefit wallet
                        ancestorUser.wallet.withdrawal += bonusAmount;
                        await ancestorUser.save({ session });
                        
                        // Create transaction record for the MLM bonus
                        const transaction = new Transaction({
                            userId: ancestorUser._id,
                            type: 'mlm_bonus',
                            amount: bonusAmount,
                            walletType: 'withdrawal', // Changed from 'benefit' to 'withdrawal'
                            description: `${bonusRate}% MLM bonus from level ${ancestorLevel} referral transaction`,
                            status: 'completed',
                            relatedUser: userId,
                            transactionDate: new Date()
                        });
                        
                        await transaction.save({ session });
                        bonusTransactions.push({
                            level: ancestorLevel,
                            userId: ancestorUser._id,
                            amount: bonusAmount,
                            rate: bonusRate
                        });
                    }
                }
            }
        }
        
        await session.commitTransaction();
        return { 
            success: true, 
            message: 'MLM bonuses distributed successfully',
            bonusTransactions
        };
    } catch (error) {
        await session.abortTransaction();
        console.error('Error processing MLM referral bonuses:', error);
        return { 
            success: false, 
            message: 'Error processing MLM referral bonuses', 
            error: error.message 
        };
    } finally {
        session.endSession();
    }
};

module.exports = {
    processMLMReferralBonus,
    MLM_BONUS_RATES
};
