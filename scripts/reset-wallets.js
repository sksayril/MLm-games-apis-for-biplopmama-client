const mongoose = require('mongoose');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
require('dotenv').config(); // Load environment variables

// Database connection
const connectDB = async () => {
    try {
        const dbUrl = process.env.DATABASE_URL || 'mongodb://localhost:27017/mlm-uses';
        await mongoose.connect(dbUrl);
        console.log('Database connected successfully');
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
};

async function resetAllWallets() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log('Starting wallet reset process...');

        // Find all users
        const users = await User.find({}).session(session);
        console.log(`Found ${users.length} users to process`);

        let processedCount = 0;

        for (const user of users) {
            // Store old wallet values for transaction records
            const oldNormalBalance = user.wallet.normal || 0;
            const oldBenefitBalance = user.wallet.benefit || 0;
            const oldWithdrawalBalance = user.wallet.withdrawal || 0;

            // Reset all wallet balances to zero
            user.wallet.normal = 0;
            user.wallet.benefit = 0;
            user.wallet.withdrawal = 0;
            user.wallet.withdrawalDaysGrown = 0; // Reset withdrawal days grown counter

            await user.save({ session });

            // Create transaction records for the reset
            if (oldNormalBalance !== 0) {
                await new Transaction({
                    userId: user._id,
                    type: 'system_reset',
                    amount: oldNormalBalance,
                    walletType: 'normal',
                    description: 'System wallet reset - Normal wallet balance set to zero',
                    status: 'completed'
                }).save({ session });
            }

            if (oldBenefitBalance !== 0) {
                await new Transaction({
                    userId: user._id,
                    type: 'system_reset',
                    amount: oldBenefitBalance,
                    walletType: 'benefit',
                    description: 'System wallet reset - Benefit wallet balance set to zero',
                    status: 'completed'
                }).save({ session });
            }

            if (oldWithdrawalBalance !== 0) {
                await new Transaction({
                    userId: user._id,
                    type: 'system_reset',
                    amount: oldWithdrawalBalance,
                    walletType: 'withdrawal',
                    description: 'System wallet reset - Withdrawal wallet balance set to zero',
                    status: 'completed'
                }).save({ session });
            }

            processedCount++;
            if (processedCount % 10 === 0) {
                console.log(`Processed ${processedCount} users...`);
            }
        }

        await session.commitTransaction();
        console.log('\n====== WALLET RESET SUMMARY ======');
        console.log(`Total users processed: ${processedCount}`);
        console.log('All wallet balances have been set to zero');
        console.log('================================\n');

    } catch (error) {
        await session.abortTransaction();
        console.error('Error during wallet reset:', error);
        throw error;
    } finally {
        session.endSession();
        // Close the database connection
        await mongoose.connection.close();
    }
}

// Run the connection and reset function
connectDB()
    .then(() => resetAllWallets())
    .then(() => {
        console.log('Wallet reset completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed to reset wallets:', error);
        process.exit(1);
    });
