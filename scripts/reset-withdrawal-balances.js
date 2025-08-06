const mongoose = require('mongoose');
const User = require('../models/user.model');

// Configuration
const MONGODB_URI = 'mongodb://localhost:27017/your_database_name';

async function resetWithdrawalBalances() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all users with withdrawal balance > 0
        const usersWithWithdrawal = await User.find({
            'wallet.withdrawal': { $gt: 0 }
        });

        console.log(`Found ${usersWithWithdrawal.length} users with withdrawal balance > 0`);

        if (usersWithWithdrawal.length === 0) {
            console.log('No users found with withdrawal balance > 0');
            return;
        }

        // Show current withdrawal balances
        console.log('\n=== Current Withdrawal Balances ===');
        usersWithWithdrawal.forEach(user => {
            console.log(`User ${user._id} (${user.name}): ₹${user.wallet.withdrawal}`);
        });

        // Ask for confirmation
        console.log('\n⚠️  WARNING: This will reset ALL withdrawal balances to zero!');
        console.log('This action cannot be undone.');
        
        // For safety, we'll add a confirmation check
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise((resolve) => {
            rl.question('Are you sure you want to proceed? Type "YES" to confirm: ', (input) => {
                rl.close();
                resolve(input);
            });
        });

        if (answer !== 'YES') {
            console.log('Operation cancelled by user');
            return;
        }

        // Reset all withdrawal balances to zero
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            let updatedCount = 0;
            let totalWithdrawalReset = 0;

            for (const user of usersWithWithdrawal) {
                const previousWithdrawal = user.wallet.withdrawal;
                user.wallet.withdrawal = 0;
                await user.save({ session });
                
                updatedCount++;
                totalWithdrawalReset += previousWithdrawal;
                
                console.log(`Reset user ${user._id} (${user.name}): ₹${previousWithdrawal} → ₹0`);
            }

            await session.commitTransaction();

            console.log('\n=== Reset Summary ===');
            console.log(`Users updated: ${updatedCount}`);
            console.log(`Total withdrawal amount reset: ₹${totalWithdrawalReset.toFixed(2)}`);
            console.log('✅ All withdrawal balances have been reset to zero');

        } catch (error) {
            await session.abortTransaction();
            console.error('Error during reset:', error);
            throw error;
        } finally {
            session.endSession();
        }

        // Verify the reset
        const verificationUsers = await User.find({
            'wallet.withdrawal': { $gt: 0 }
        });

        if (verificationUsers.length === 0) {
            console.log('\n✅ Verification: All withdrawal balances are now zero');
        } else {
            console.log(`\n❌ Verification failed: ${verificationUsers.length} users still have withdrawal balance > 0`);
        }

    } catch (error) {
        console.error('Reset failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the reset
resetWithdrawalBalances(); 