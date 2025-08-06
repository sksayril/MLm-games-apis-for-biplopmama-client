const mongoose = require('mongoose');
const User = require('../models/user.model');

// Configuration
const MONGODB_URI = 'mongodb://localhost:27017/your_database_name';

async function updateInitialBalances() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all users that don't have initial balance fields set
        const usersToUpdate = await User.find({
            $or: [
                { initialNormalBalance: { $exists: false } },
                { initialBenefitBalance: { $exists: false } },
                { initialNormalBalance: 0 },
                { initialBenefitBalance: 0 }
            ]
        });

        console.log(`Found ${usersToUpdate.length} users to update`);

        let updatedCount = 0;

        for (const user of usersToUpdate) {
            let needsUpdate = false;

            // Set initial normal balance if not set and user has normal wallet balance
            if ((!user.initialNormalBalance || user.initialNormalBalance === 0) && 
                user.wallet.normal > 0) {
                user.initialNormalBalance = user.wallet.normal;
                needsUpdate = true;
                console.log(`User ${user._id}: Set initialNormalBalance to ₹${user.wallet.normal}`);
            }

            // Set initial benefit balance if not set and user has benefit wallet balance
            if ((!user.initialBenefitBalance || user.initialBenefitBalance === 0) && 
                user.wallet.benefit > 0) {
                user.initialBenefitBalance = user.wallet.benefit;
                needsUpdate = true;
                console.log(`User ${user._id}: Set initialBenefitBalance to ₹${user.wallet.benefit}`);
            }

            if (needsUpdate) {
                await user.save();
                updatedCount++;
            }
        }

        console.log(`\nMigration completed: ${updatedCount} users updated`);
        
        // Show summary
        const totalUsers = await User.countDocuments();
        const usersWithNormalBalance = await User.countDocuments({ initialNormalBalance: { $gt: 0 } });
        const usersWithBenefitBalance = await User.countDocuments({ initialBenefitBalance: { $gt: 0 } });

        console.log('\n=== Summary ===');
        console.log(`Total users: ${totalUsers}`);
        console.log(`Users with initial normal balance: ${usersWithNormalBalance}`);
        console.log(`Users with initial benefit balance: ${usersWithBenefitBalance}`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the migration
updateInitialBalances(); 