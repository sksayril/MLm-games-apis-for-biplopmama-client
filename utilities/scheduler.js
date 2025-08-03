const cron = require('node-cron');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const mongoose = require('mongoose');

const calculateDailyGrowth = async () => {
    console.log('Running daily wallet processing:', new Date());

    const stats = {
        usersProcessed: 0,
        totalNormalDeduction: 0,
        totalBenefitDeduction: 0,
        totalWithdrawalGrowth: 0,
        startTime: new Date()
    };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const allUsers = await User.find().session(session);

        for (const user of allUsers) {
            const normalWallet = user.wallet.normal || 0;
            const benefitWallet = user.wallet.benefit || 0;
            const withdrawalWallet = user.wallet.withdrawal || 0;
            const totalDeposits = user.totalDeposits || 0;

            // Calculate daily deduction based on total deposits
            // Target: Double the deposit amount in 200 days
            // So daily deduction = (totalDeposits * 2) / 200
            const dailyDeductionAmount = totalDeposits > 0 ? (totalDeposits * 2) / 200 : 0;
            
            // Calculate how much to deduct from each wallet
            let normalWalletDeduction = 0;
            let benefitWalletDeduction = 0;
            
            if (dailyDeductionAmount > 0) {
                // Deduct from normal wallet first, then benefit wallet
                if (normalWallet >= dailyDeductionAmount) {
                    normalWalletDeduction = dailyDeductionAmount;
                } else {
                    normalWalletDeduction = normalWallet;
                    benefitWalletDeduction = dailyDeductionAmount - normalWallet;
                    
                    // If benefit wallet doesn't have enough, cap it
                    if (benefitWalletDeduction > benefitWallet) {
                        benefitWalletDeduction = benefitWallet;
                    }
                }
            }

            // Round to 2 decimal places
            normalWalletDeduction = Math.floor(normalWalletDeduction * 100) / 100;
            benefitWalletDeduction = Math.floor(benefitWalletDeduction * 100) / 100;

            // Update wallet values
            user.wallet.normal = Math.max(0, normalWallet - normalWalletDeduction);
            user.wallet.benefit = Math.max(0, benefitWallet - benefitWalletDeduction);
            user.wallet.withdrawal = withdrawalWallet + benefitWalletDeduction;

            await user.save({ session });

            // Log stats
            stats.usersProcessed++;
            stats.totalNormalDeduction += normalWalletDeduction;
            stats.totalBenefitDeduction += benefitWalletDeduction;
            stats.totalWithdrawalGrowth += benefitWalletDeduction;

            // Record transactions
            if (normalWalletDeduction > 0) {
                await new Transaction({
                    userId: user._id,
                    type: 'withdrawal',
                    amount: normalWalletDeduction,
                    walletType: 'normal',
                    description: `Daily deduction: ₹${dailyDeductionAmount.toFixed(2)} (${((dailyDeductionAmount/totalDeposits)*100).toFixed(2)}% of total deposits)`,
                    status: 'completed'
                }).save({ session });
            }

            if (benefitWalletDeduction > 0) {
                await new Transaction({
                    userId: user._id,
                    type: 'transfer',
                    amount: benefitWalletDeduction,
                    walletType: 'benefit',
                    toWalletType: 'withdrawal',
                    description: `Daily deduction transfer: ₹${benefitWalletDeduction.toFixed(2)} from benefit to withdrawal wallet`,
                    status: 'completed'
                }).save({ session });
            }

            if (stats.usersProcessed % 10 === 0) {
                console.log(`Processed user ${user._id}`);
            }
        }

        await session.commitTransaction();

        const endTime = new Date();
        const duration = (endTime - stats.startTime) / 1000;

        console.log('\n======= DAILY WALLET DEDUCTION SUMMARY =======');
        console.log(`Users processed: ${stats.usersProcessed}`);
        console.log(`Total normal deductions: ₹${stats.totalNormalDeduction.toFixed(2)}`);
        console.log(`Total benefit deductions: ₹${stats.totalBenefitDeduction.toFixed(2)}`);
        console.log(`Total withdrawal wallet credited: ₹${stats.totalWithdrawalGrowth.toFixed(2)}`);
        console.log(`Time taken: ${duration.toFixed(2)} seconds`);
        console.log('Note: Daily deduction is now based on total deposits (target: 2x in 200 days)');
        console.log('==============================================\n');
    } catch (err) {
        await session.abortTransaction();
        console.error('Error during wallet processing:', err);
    } finally {
        session.endSession();
    }
};

const startDailyGrowthScheduler = (runImmediately = false) => {
    // Schedule daily at 3:00 PM
    cron.schedule('0 0 * * 1-5', () => {
        calculateDailyGrowth();
    });

    if (runImmediately) {
        console.log('Running daily wallet process immediately...');
        calculateDailyGrowth();
    }

    console.log('Daily wallet processing scheduler started (12:00 PM daily)');
};

const triggerGrowthCalculation = async () => {
    console.log('Manually triggering wallet deduction process...');
    await calculateDailyGrowth();
    console.log('Manual wallet deduction completed.');
};

module.exports = {
    startDailyGrowthScheduler,
    triggerGrowthCalculation,
    calculateDailyGrowth
};
