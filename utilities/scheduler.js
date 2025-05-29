const cron = require('node-cron');
const User = require('../models/user.model');
const Deposit = require('../models/deposit.model');
const Transaction = require('../models/transaction.model');
const mongoose = require('mongoose');

// Function to calculate and apply daily growth to user wallets
const calculateDailyGrowth = async () => {
    console.log('Running daily wallet growth calculation:', new Date());
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Find all active deposits
        const activeDeposits = await Deposit.find({
            isActive: true,
            daysGrown: { $lt: 200 } // Only process deposits that haven't reached 200 days
        }).session(session);
        
        console.log(`Processing ${activeDeposits.length} active deposits`);
        
        for (const deposit of activeDeposits) {
            // Find the user
            const user = await User.findById(deposit.userId).session(session);
            
            if (!user) {
                console.log(`User not found for deposit ${deposit._id}`);
                continue;
            }
            
            // Calculate daily growth for normal wallet
            const normalGrowthAmount = deposit.amount * deposit.normalGrowthRate;
            
            // Calculate daily growth for benefit wallet
            const benefitGrowthAmount = deposit.amount * deposit.benefitGrowthRate;
            
            // Update user's wallets
            user.wallet.normal += normalGrowthAmount;
            user.wallet.benefit += benefitGrowthAmount;
            
            // Update deposit record
            deposit.daysGrown += 1;
            deposit.totalNormalGrowth += normalGrowthAmount;
            deposit.totalBenefitGrowth += benefitGrowthAmount;
            deposit.lastGrowthDate = new Date();
            
            // Check if deposit has reached 200 days
            if (deposit.daysGrown >= 200) {
                deposit.isActive = false;
            }
            
            // Save changes
            await user.save({ session });
            await deposit.save({ session });
            
            // Create transaction records for growth
            const normalTransaction = new Transaction({
                userId: user._id,
                type: 'bonus',
                amount: normalGrowthAmount,
                walletType: 'normal',
                description: `Daily growth (5%) for deposit #${deposit._id}`,
                status: 'completed'
            });
            
            const benefitTransaction = new Transaction({
                userId: user._id,
                type: 'bonus',
                amount: benefitGrowthAmount,
                walletType: 'benefit',
                description: `Daily growth (10%) for deposit #${deposit._id}`,
                status: 'completed'
            });
            
            await normalTransaction.save({ session });
            await benefitTransaction.save({ session });
            
            console.log(`Processed growth for user ${user._id}: Normal +${normalGrowthAmount}, Benefit +${benefitGrowthAmount}`);
        }
        
        await session.commitTransaction();
        console.log('Daily growth calculation completed successfully');
    } catch (error) {
        await session.abortTransaction();
        console.error('Error calculating daily growth:', error);
    } finally {
        session.endSession();
    }
};

// Schedule daily growth calculation to run at midnight every day
const startDailyGrowthScheduler = () => {
    // Run at midnight (00:00) every day
    cron.schedule('0 0 * * *', () => {
        calculateDailyGrowth();
    });
    
    console.log('Daily growth scheduler started');
};

// Function to manually trigger growth calculation (for testing or catch-up)
const triggerGrowthCalculation = async () => {
    await calculateDailyGrowth();
};

module.exports = {
    startDailyGrowthScheduler,
    triggerGrowthCalculation
};
