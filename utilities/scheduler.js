const cron = require('node-cron');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const mongoose = require('mongoose');

const calculateDailyGrowth = async () => {
    console.log('Running daily wallet processing:', new Date());

    const stats = {
        usersProcessed: 0,
        totalNormalDeduction: 0,
        totalBenefitTransfer: 0,
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

            // Calculate deductions/transfers
            const normalWalletDeduction = Math.floor(normalWallet * 0.005 * 100) / 100; // 0.5% deduction
            const benefitWalletTransfer = Math.floor(benefitWallet * 0.01 * 100) / 100; // 1% transfer to withdrawal

            // Update wallet values
            user.wallet.normal = Math.max(0, normalWallet - normalWalletDeduction);
            user.wallet.benefit = Math.max(0, benefitWallet - benefitWalletTransfer);
            user.wallet.withdrawal = withdrawalWallet + benefitWalletTransfer;

            await user.save({ session });

            // Log stats
            stats.usersProcessed++;
            stats.totalNormalDeduction += normalWalletDeduction;
            stats.totalBenefitTransfer += benefitWalletTransfer;
            stats.totalWithdrawalGrowth += benefitWalletTransfer;

            // Record transactions
            if (normalWalletDeduction > 0) {
                await new Transaction({
                    userId: user._id,
                    type: 'withdrawal',
                    amount: normalWalletDeduction,
                    walletType: 'normal',
                    description: 'Daily 0.5% deduction from normal wallet',
                    status: 'completed'
                }).save({ session });
            }

            if (benefitWalletTransfer > 0) {
                await new Transaction({
                    userId: user._id,
                    type: 'transfer',
                    amount: benefitWalletTransfer,
                    walletType: 'benefit',
                    toWalletType: 'withdrawal',
                    description: 'Daily 1% transfer from benefit wallet to withdrawal wallet',
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

        console.log('\n======= DAILY WALLET PROCESSING SUMMARY =======');
        console.log(`Users processed: ${stats.usersProcessed}`);
        console.log(`Total normal wallet deductions: ₹${stats.totalNormalDeduction.toFixed(2)}`);
        console.log(`Total benefit wallet transfers: ₹${stats.totalBenefitTransfer.toFixed(2)}`);
        console.log(`Total withdrawal wallet credited: ₹${stats.totalWithdrawalGrowth.toFixed(2)}`);
        console.log(`Time taken: ${duration.toFixed(2)} seconds`);
        console.log('================================================\n');
    } catch (err) {
        await session.abortTransaction();
        console.error('Error during wallet processing:', err);
    } finally {
        session.endSession();
    }
};

const startDailyGrowthScheduler = (runImmediately = false) => {
    // Schedule daily at 12:00 PM (noon)
    cron.schedule('0 12 * * *', () => {
        calculateDailyGrowth();
    });

    if (runImmediately) {
        console.log('Running daily wallet process immediately...');
        calculateDailyGrowth();
    }

    console.log('Daily wallet processing scheduler started (12:00 PM daily)');
    console.log('Logic: 0.5% deduction from normal wallet, 1% transfer from benefit to withdrawal wallet');
};

const triggerGrowthCalculation = async () => {
    console.log('Manually triggering wallet processing...');
    await calculateDailyGrowth();
    console.log('Manual wallet processing completed.');
};

// Helper function to calculate remaining days for benefit wallet to reach zero
const calculateRemainingDays = (benefitBalance) => {
    if (benefitBalance <= 0) return 0;
    
    // With 1% daily transfer, we can calculate approximately how many days remain
    // This is an approximation since the calculation changes daily
    let remainingBalance = benefitBalance;
    let days = 0;
    
    while (remainingBalance > 0.01 && days < 1000) { // Prevent infinite loop
        const dailyTransfer = Math.floor(remainingBalance * 0.01 * 100) / 100;
        remainingBalance -= dailyTransfer;
        days++;
    }
    
    return days;
};

module.exports = {
    startDailyGrowthScheduler,
    triggerGrowthCalculation,
    calculateDailyGrowth,
    calculateRemainingDays
};