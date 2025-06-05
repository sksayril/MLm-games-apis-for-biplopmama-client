const mongoose = require('mongoose');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const { ObjectId } = mongoose.Types;
const { processMLMReferralBonus } = require('./mlmHandler');

/**
 * Process a withdrawal and apply 10% referral bonus to the referring user
 * @param {string} userId - The ID of the user making the withdrawal
 * @param {number} amount - The amount being withdrawn
 * @param {string} walletType - The wallet type to withdraw from (usually 'withdrawal')
 * @returns {Object} - The result of the withdrawal operation
 */
const processWithdrawal = async (userId, amount, walletType = 'withdrawal') => {
    // Start a MongoDB session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Find the user requesting withdrawal
        const user = await User.findById(userId).session(session);
        
        if (!user) {
            await session.abortTransaction();
            return { success: false, message: 'User not found' };
        }
        
        // Check if user has sufficient balance
        if (!user.wallet[walletType] || user.wallet[walletType] < amount) {
            await session.abortTransaction();
            return { success: false, message: 'Insufficient balance in wallet' };
        }
        
        // Deduct amount from user's wallet
        user.wallet[walletType] -= amount;
        await user.save({ session });
        
        // Create withdrawal transaction record
        const withdrawalTransaction = new Transaction({
            userId: user._id,
            type: 'withdrawal',
            amount: amount,
            walletType: walletType,
            description: `Withdrawal from ${walletType} wallet`,
            status: 'processing' // Initially set as processing, will be updated when completed
        });
        
        await withdrawalTransaction.save({ session });
        
        // Process MLM referral bonuses to all ancestors (up to 10 levels)
        if (user.ancestors && user.ancestors.length > 0) {
            // Process the MLM referral bonuses
            const mlmResult = await processMLMReferralBonus(userId, amount, 'withdrawal');
            
            if (!mlmResult.success) {
                console.error('Error during MLM bonus processing:', mlmResult.message);
                // Continue with withdrawal even if MLM bonus processing fails
            } else {
                console.log(`MLM bonuses distributed: ${mlmResult.bonusTransactions?.length || 0} transactions created`);
            }
        }
        
        await session.commitTransaction();
        return { 
            success: true, 
            message: 'Withdrawal processed successfully',
            transactionId: withdrawalTransaction._id
        };
    } catch (error) {
        await session.abortTransaction();
        console.error('Error processing withdrawal:', error);
        return { success: false, message: 'Error processing withdrawal', error: error.message };
    } finally {
        session.endSession();
    }
};

/**
 * Function to handle instant referral bonus when a user joins through a referral link
 * Note: For new registrations, we now use the MLM system to distribute bonuses across all levels
 * @param {string} userId - The ID of the new user
 * @param {string} referrerId - The ID of the referring user
 * @param {number} amount - The amount to give as instant signup bonus
 */
const processInstantReferralBonus = async (userId, referrerId, amount) => {
    // Start MongoDB session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Find the referrer
        const referrer = await User.findById(referrerId).session(session);
        
        if (!referrer) {
            await session.abortTransaction();
            return { success: false, message: 'Referrer not found' };
        }
        
        // Find the newly registered user
        const user = await User.findById(userId).session(session);
        if (!user) {
            await session.abortTransaction();
            return { success: false, message: 'New user not found' };
        }
        
        // Add initial bonus to direct referrer's benefit wallet
        referrer.wallet.benefit += amount;
        await referrer.save({ session });
        
        // Create transaction record for instant referral bonus
        const referralTransaction = new Transaction({
            userId: referrer._id,
            type: 'instant_referral_bonus',
            amount: amount,
            walletType: 'benefit',
            description: `Instant referral bonus for referring a new user`,
            status: 'completed',
            relatedUser: ObjectId(userId),
            transactionDate: new Date()
        });
        
        await referralTransaction.save({ session });
        
        // Process MLM bonuses if applicable
        // We'll assign a smaller amount for the MLM distribution since the direct referrer already got a bonus
        if (user.ancestors && user.ancestors.length > 0) {
            const mlmBonusAmount = amount * 0.5; // 50% of the signup bonus for MLM distribution
            const mlmResult = await processMLMReferralBonus(userId, mlmBonusAmount, 'signup');
            
            if (!mlmResult.success) {
                console.error('Error during MLM bonus processing for signup:', mlmResult.message);
                // Continue with transaction even if MLM bonus processing fails
            }
        }
        
        await session.commitTransaction();
        return {
            success: true,
            message: `Referral bonuses successfully distributed for new user registration`
        };
    } catch (error) {
        await session.abortTransaction();
        console.error('Error processing instant referral bonus:', error);
        return { success: false, message: 'Error processing referral bonus', error: error.message };
    } finally {
        session.endSession();
    }
};

module.exports = {
    processWithdrawal,
    processInstantReferralBonus
};
