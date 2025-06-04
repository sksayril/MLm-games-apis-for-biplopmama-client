const mongoose = require('mongoose');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const { ObjectId } = mongoose.Types;

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
        
        // Process referral bonus if the user has a referrer
        if (user.referredBy) {
            // Calculate 10% bonus for the referrer
            const referralBonus = amount * 0.1;
            
            // Find the referring user
            const referrer = await User.findById(user.referredBy).session(session);
            
            if (referrer) {
                // Add bonus to referrer's normal wallet
                referrer.wallet.normal += referralBonus;
                await referrer.save({ session });
                
                // Create transaction record for referral bonus
                const referralTransaction = new Transaction({
                    userId: referrer._id,
                    type: 'referral_bonus',
                    amount: referralBonus,
                    walletType: 'normal',
                    description: `10% referral bonus from ${user.name}'s withdrawal`,
                    status: 'completed',
                    relatedUser: user._id
                });
                
                await referralTransaction.save({ session });
                
                console.log(`Applied referral bonus of ${referralBonus} to user ${referrer._id} from ${user._id}'s withdrawal`);
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
 * @param {string} userId - The ID of the new user
 * @param {string} referrerId - The ID of the referring user
 * @param {number} amount - The amount to give as instant bonus
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
        
        // Add amount to referrer's normal wallet
        referrer.wallet.normal += amount;
        await referrer.save({ session });
        
        // Create transaction record for instant referral bonus
        const referralTransaction = new Transaction({
            userId: referrer._id,
            type: 'instant_referral_bonus',
            amount: amount,
            walletType: 'normal',
            description: `Instant referral bonus for referring a new user`,
            status: 'completed',
            relatedUser: ObjectId(userId)
        });
        
        await referralTransaction.save({ session });
        
        await session.commitTransaction();
        return {
            success: true,
            message: `Instant referral bonus of ${amount} successfully added to referrer's wallet`
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
