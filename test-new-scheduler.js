const mongoose = require('mongoose');
const User = require('./models/user.model');
const { calculateDailyGrowth } = require('./utilities/scheduler');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mlm-system', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const testNewScheduler = async () => {
    console.log('Testing new scheduler logic...\n');
    
    try {
        // Find a test user
        const testUser = await User.findOne({});
        
        if (!testUser) {
            console.log('No users found. Please create a user first.');
            return;
        }
        
        console.log('Test User Details:');
        console.log(`Name: ${testUser.name}`);
        console.log(`Total Deposits: ₹${testUser.totalDeposits || 0}`);
        console.log(`Normal Wallet: ₹${testUser.wallet.normal || 0}`);
        console.log(`Benefit Wallet: ₹${testUser.wallet.benefit || 0}`);
        console.log(`Withdrawal Wallet: ₹${testUser.wallet.withdrawal || 0}`);
        
        // Calculate expected daily deduction
        const totalDeposits = testUser.totalDeposits || 0;
        const dailyDeductionAmount = totalDeposits > 0 ? (totalDeposits * 2) / 200 : 0;
        
        console.log('\nExpected Daily Deduction:');
        console.log(`Total Deposits: ₹${totalDeposits}`);
        console.log(`Target (2x in 200 days): ₹${totalDeposits * 2}`);
        console.log(`Daily Deduction Amount: ₹${dailyDeductionAmount.toFixed(2)}`);
        console.log(`Percentage of total deposits: ${((dailyDeductionAmount/totalDeposits)*100).toFixed(2)}%`);
        
        // Calculate how many days it will take to complete
        const normalWallet = testUser.wallet.normal || 0;
        const benefitWallet = testUser.wallet.benefit || 0;
        const totalWalletBalance = normalWallet + benefitWallet;
        
        if (dailyDeductionAmount > 0) {
            const daysToComplete = Math.ceil(totalWalletBalance / dailyDeductionAmount);
            console.log(`\nDays to complete (based on current wallet balance): ${daysToComplete} days`);
            
            if (daysToComplete > 200) {
                console.log('⚠️  Warning: It will take more than 200 days to complete with current balance');
            } else {
                console.log('✅ Will complete within 200 days');
            }
        }
        
        console.log('\nRunning scheduler test...');
        await calculateDailyGrowth();
        
        // Get updated user
        const updatedUser = await User.findById(testUser._id);
        
        console.log('\nAfter Scheduler Run:');
        console.log(`Normal Wallet: ₹${updatedUser.wallet.normal || 0}`);
        console.log(`Benefit Wallet: ₹${updatedUser.wallet.benefit || 0}`);
        console.log(`Withdrawal Wallet: ₹${updatedUser.wallet.withdrawal || 0}`);
        
        const normalDeduction = (testUser.wallet.normal || 0) - (updatedUser.wallet.normal || 0);
        const benefitDeduction = (testUser.wallet.benefit || 0) - (updatedUser.wallet.benefit || 0);
        const withdrawalIncrease = (updatedUser.wallet.withdrawal || 0) - (testUser.wallet.withdrawal || 0);
        
        console.log('\nActual Deductions:');
        console.log(`Normal Wallet Deduction: ₹${normalDeduction.toFixed(2)}`);
        console.log(`Benefit Wallet Deduction: ₹${benefitDeduction.toFixed(2)}`);
        console.log(`Withdrawal Wallet Increase: ₹${withdrawalIncrease.toFixed(2)}`);
        console.log(`Total Deduction: ₹${(normalDeduction + benefitDeduction).toFixed(2)}`);
        
    } catch (error) {
        console.error('Error testing scheduler:', error);
    } finally {
        mongoose.connection.close();
    }
};

// Run the test
testNewScheduler(); 