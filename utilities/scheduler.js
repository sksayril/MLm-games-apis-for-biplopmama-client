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

            const normalWalletDeduction = Math.floor(normalWallet * 0.005 * 100) / 100;
            const benefitWalletDeduction = Math.floor(benefitWallet * 0.01 * 100) / 100;

            // New wallet values
            user.wallet.normal = normalWallet - normalWalletDeduction;
            user.wallet.benefit = benefitWallet - benefitWalletDeduction;
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
                    description: 'Daily 0.5% deduction from normal wallet',
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
                    description: 'Daily 1% deduction from benefit wallet transferred to withdrawal wallet',
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
    cron.schedule('0 0 * * 1-6', () => {
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
