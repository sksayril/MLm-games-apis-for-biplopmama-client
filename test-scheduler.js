// Test script to verify scheduler deduction functionality
const mongoose = require('mongoose');
const User = require('./models/user.model');
const { calculateDailyGrowth } = require('./utilities/scheduler');
require('dotenv').config();

const testScheduler = async () => {
    try {
        // Connect to database
        await mongoose.connect(process.env.DATABASE_URL);
        console.log('Connected to MongoDB');
        
        // Create a test user with the exact wallet values from the example
        const testUser = new User({
            name: 'Test User',
            mobile: `test-${Date.now()}`, // Make unique
            email: `test-${Date.now()}@example.com`, // Make unique
            password: 'password123',
            wallet: {
                normal: 5000,
                benefit: 10000,
                game: 0,
                withdrawal: 0,
                withdrawalDaysGrown: 0
            },
            referralCode: `REF-${Date.now()}` // Make unique
        });
        
        // Save the test user
        await testUser.save();
        console.log(`Created test user with ID: ${testUser._id}`);
        console.log('Initial wallet balance:');
        console.log(`- Normal: ${testUser.wallet.normal} rs`);
        console.log(`- Benefit: ${testUser.wallet.benefit} rs`);
        console.log(`- Withdrawal: ${testUser.wallet.withdrawal} rs`);
        
        // Run the scheduler
        console.log('\nRunning scheduler...');
        await calculateDailyGrowth();
        
        // Fetch the updated user
        const updatedUser = await User.findById(testUser._id);
        
        console.log('\nWallet balance after scheduler run:');
        console.log(`- Normal: ${updatedUser.wallet.normal} rs`);
        console.log(`- Benefit: ${updatedUser.wallet.benefit} rs`);
        console.log(`- Withdrawal: ${updatedUser.wallet.withdrawal} rs`);
        
        // Calculate and display the changes
        const normalDeduction = 5000 * 0.001; // 5 rs
        const benefitDeduction = 10000 * 0.001; // 10 rs
        
        console.log('\nExpected deductions:');
        console.log(`- Normal wallet deduction (0.1%): ${normalDeduction} rs`);
        console.log(`- Benefit wallet deduction (0.1%): ${benefitDeduction} rs`);
        console.log(`- Total amount added to withdrawal: ${normalDeduction + benefitDeduction} rs`);
        
        // Clean up - delete the test user
        await User.findByIdAndDelete(testUser._id);
        
        // Disconnect from database
        await mongoose.disconnect();
        console.log('\nTest completed and database connection closed');
        
    } catch (error) {
        console.error('Error in test:', error);
    }
};

// Run the test
testScheduler();
