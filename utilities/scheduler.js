const cron = require('node-cron');
const User = require('../models/user.model');
const Deposit = require('../models/deposit.model');
const Transaction = require('../models/transaction.model');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Function to calculate and apply daily growth to user wallets
const calculateDailyGrowth = async () => {
    console.log('Running daily wallet growth calculation:', new Date());
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Find all active deposits
        const activeDeposits = await Deposit.find({
            isActive: true,
            daysGrown: { $lt: 400 } // Only process deposits that haven't reached 400 days
        }).session(session);
        
        console.log(`Processing ${activeDeposits.length} active deposits`);
        
        // Process all users for wallet-based daily growth (independent of deposits)
        const allUsers = await User.find().session(session);
        
        for (const user of allUsers) {
            // Calculate 2% growth for normal wallet based on current balance
            const normalWalletGrowth = user.wallet.normal * 0.02;
            
            // Calculate 4% growth for benefit wallet based on current balance
            const benefitWalletGrowth = user.wallet.benefit * 0.04;
            
            // Calculate daily deductions (0.5% from normal wallet, 1% from benefit wallet)
            const normalWalletDeduction = user.wallet.normal * 0.005;
            const benefitWalletDeduction = user.wallet.benefit * 0.01; // Changed from 0.5% to 1%
            
            // Calculate withdrawal wallet growth (0.5% per day, only if daysGrown < 400)
            let withdrawalWalletGrowth = 0;
            if (user.wallet.withdrawalDaysGrown < 400) {
                withdrawalWalletGrowth = user.wallet.withdrawal * 0.005;
                user.wallet.withdrawalDaysGrown += 1;
            }
            
            // Update user's wallets
            user.wallet.normal += normalWalletGrowth - normalWalletDeduction;
            user.wallet.benefit += benefitWalletGrowth - benefitWalletDeduction;
            // Only add benefit wallet deduction to withdrawal wallet
            user.wallet.withdrawal += benefitWalletDeduction + withdrawalWalletGrowth;
            
            // Save changes
            await user.save({ session });
            
            // Create transaction records for wallet-based growth
            if (normalWalletGrowth > 0) {
                const normalTransaction = new Transaction({
                    userId: user._id,
                    type: 'bonus',
                    amount: normalWalletGrowth,
                    walletType: 'normal',
                    description: `Daily growth (2%) on normal wallet balance`,
                    status: 'completed'
                });
                await normalTransaction.save({ session });
            }
            
            if (benefitWalletGrowth > 0) {
                const benefitTransaction = new Transaction({
                    userId: user._id,
                    type: 'bonus',
                    amount: benefitWalletGrowth,
                    walletType: 'benefit',
                    description: `Daily growth (4%) on benefit wallet balance`,
                    status: 'completed'
                });
                await benefitTransaction.save({ session });
            }
            
            if (normalWalletDeduction > 0) {
                const normalDeductionTransaction = new Transaction({
                    userId: user._id,
                    type: 'deduction',
                    amount: normalWalletDeduction,
                    walletType: 'normal',
                    description: `Daily deduction (0.5%) from normal wallet`,
                    status: 'completed'
                });
                await normalDeductionTransaction.save({ session });
            }
            
            if (benefitWalletDeduction > 0) {
                const benefitDeductionTransaction = new Transaction({
                    userId: user._id,
                    type: 'transfer',
                    amount: benefitWalletDeduction,
                    walletType: 'benefit',
                    toWalletType: 'withdrawal',
                    description: `Daily deduction (1%) from benefit wallet to withdrawal wallet`,
                    status: 'completed'
                });
                await benefitDeductionTransaction.save({ session });
            }
            
            if (withdrawalWalletGrowth > 0) {
                const withdrawalGrowthTransaction = new Transaction({
                    userId: user._id,
                    type: 'bonus',
                    amount: withdrawalWalletGrowth,
                    walletType: 'withdrawal',
                    description: `Daily growth (0.5%) on withdrawal wallet balance (day ${user.wallet.withdrawalDaysGrown} of 400)`,
                    status: 'completed'
                });
                await withdrawalGrowthTransaction.save({ session });
            }
            
            console.log(`Processed wallet growth for user ${user._id}: Normal +${normalWalletGrowth}, Benefit +${benefitWalletGrowth}, Withdrawal +${withdrawalWalletGrowth}`);
            console.log(`Daily deductions: Normal ${normalWalletDeduction} (0.5%), Benefit to withdrawal ${benefitWalletDeduction} (1%)`);
        }
        
        // Process deposit-based growth
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
            
            // Check if deposit has reached 400 days
            if (deposit.daysGrown >= 400) {
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
                description: `Daily deposit growth for deposit #${deposit._id}`,
                status: 'completed'
            });
            
            const benefitTransaction = new Transaction({
                userId: user._id,
                type: 'bonus',
                amount: benefitGrowthAmount,
                walletType: 'benefit',
                description: `Daily deposit growth for deposit #${deposit._id}`,
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

// Schedule daily growth calculation to run at midnight every weekday
const startDailyGrowthScheduler = () => {
    // Run at midnight (00:00) every day except Saturday (6) and Sunday (0)
    cron.schedule('0 0 * * 1-5', () => {
        calculateDailyGrowth();
    });
    
    console.log('Daily growth scheduler started (weekdays only)');
};

// Function to manually trigger growth calculation (for testing or catch-up)
const triggerGrowthCalculation = async () => {
    await calculateDailyGrowth();
};

module.exports = {
    startDailyGrowthScheduler,
    triggerGrowthCalculation
};
