const mongoose = require('mongoose');
const User = require('./models/user.model');
const Transaction = require('./models/transaction.model');
const { calculateDailyGrowth, calculateRemainingDays } = require('./utilities/scheduler');

// Test configuration
const testConfig = {
    sampleUsers: [
        {
            name: 'Test User 1',
            wallet: { normal: 1000, benefit: 2000, withdrawal: 0 }
        },
        {
            name: 'Test User 2', 
            wallet: { normal: 500, benefit: 1000, withdrawal: 0 }
        },
        {
            name: 'Test User 3',
            wallet: { normal: 2000, benefit: 4000, withdrawal: 0 }
        }
    ]
};

const runCompleteTest = async () => {
    console.log('🧪 COMPREHENSIVE SCHEDULER TEST');
    console.log('================================\n');
    
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
        console.log('✅ Connected to database');
        
        // Create test users
        console.log('\n📝 Creating test users...');
        const createdUsers = [];
        
        for (const userData of testConfig.sampleUsers) {
            const user = new User({
                name: userData.name,
                email: `${userData.name.toLowerCase().replace(' ', '')}@test.com`,
                wallet: userData.wallet
            });
            
            await user.save();
            createdUsers.push(user);
            console.log(`✅ Created ${userData.name} with wallets:`, userData.wallet);
        }
        
        // Show initial state
        console.log('\n📊 INITIAL WALLET STATE:');
        console.log('User\t\tNormal\tBenefit\tWithdrawal');
        console.log('----\t\t------\t-------\t----------');
        
        for (const user of createdUsers) {
            console.log(`${user.name}\t₹${user.wallet.normal}\t₹${user.wallet.benefit}\t₹${user.wallet.withdrawal}`);
        }
        
        // Run scheduler
        console.log('\n🔄 Running daily wallet processing...');
        await calculateDailyGrowth();
        
        // Show final state
        console.log('\n📊 FINAL WALLET STATE:');
        console.log('User\t\tNormal\tBenefit\tWithdrawal');
        console.log('----\t\t------\t-------\t----------');
        
        for (const user of createdUsers) {
            await user.reload();
            console.log(`${user.name}\t₹${user.wallet.normal.toFixed(2)}\t₹${user.wallet.benefit.toFixed(2)}\t₹${user.wallet.withdrawal.toFixed(2)}`);
        }
        
        // Show transaction history
        console.log('\n📋 TRANSACTION HISTORY:');
        const transactions = await Transaction.find({ userId: { $in: createdUsers.map(u => u._id) } }).sort({ createdAt: -1 });
        
        for (const tx of transactions) {
            const user = createdUsers.find(u => u._id.toString() === tx.userId.toString());
            console.log(`${user.name}: ${tx.description} - ₹${tx.amount}`);
        }
        
        // Calculate remaining days for each user
        console.log('\n⏰ REMAINING DAYS CALCULATION:');
        for (const user of createdUsers) {
            const remainingDays = calculateRemainingDays(user.wallet.benefit);
            console.log(`${user.name}: ${remainingDays} days to reach zero benefit wallet`);
        }
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
};

// Run the test
runCompleteTest(); 