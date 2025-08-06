const mongoose = require('mongoose');
const User = require('./models/user.model');
const { calculateDailyGrowth } = require('./utilities/scheduler');

// Test configuration
const MONGODB_URI = 'mongodb://localhost:27017/your_database_name';

async function testScheduler() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Create a test user with initial balances
        const testUser = new User({
            name: 'Test User',
            mobile: '1234567890',
            email: 'test@example.com',
            password: 'testpassword',
            wallet: {
                normal: 1000,    // Initial deposit: ₹1000
                benefit: 2000,   // Initial benefit: ₹2000
                withdrawal: 0
            },
            initialNormalBalance: 1000,  // Store initial normal balance
            initialBenefitBalance: 2000  // Store initial benefit balance
        });

        await testUser.save();
        console.log('Test user created with initial balances:');
        console.log(`- Normal wallet: ₹${testUser.wallet.normal}`);
        console.log(`- Benefit wallet: ₹${testUser.wallet.benefit}`);
        console.log(`- Initial normal balance: ₹${testUser.initialNormalBalance}`);
        console.log(`- Initial benefit balance: ₹${testUser.initialBenefitBalance}`);

        // Calculate expected daily deductions
        const expectedNormalDeduction = Math.floor(1000 * 0.005 * 100) / 100; // 0.5% of ₹1000 = ₹5
        const expectedBenefitTransfer = Math.floor(2000 * 0.01 * 100) / 100;   // 1% of ₹2000 = ₹20

        console.log('\nExpected daily deductions:');
        console.log(`- Normal wallet deduction: ₹${expectedNormalDeduction}`);
        console.log(`- Benefit wallet transfer: ₹${expectedBenefitTransfer}`);

        // Run the scheduler once
        console.log('\n=== Running scheduler for Day 1 ===');
        await calculateDailyGrowth();

        // Check results after Day 1
        const userAfterDay1 = await User.findById(testUser._id);
        console.log('\nResults after Day 1:');
        console.log(`- Normal wallet: ₹${userAfterDay1.wallet.normal} (should be ₹${1000 - expectedNormalDeduction})`);
        console.log(`- Benefit wallet: ₹${userAfterDay1.wallet.benefit} (should be ₹${2000 - expectedBenefitTransfer})`);
        console.log(`- Withdrawal wallet: ₹${userAfterDay1.wallet.withdrawal} (should be ₹${expectedBenefitTransfer})`);

        // Run the scheduler again (Day 2)
        console.log('\n=== Running scheduler for Day 2 ===');
        await calculateDailyGrowth();

        // Check results after Day 2
        const userAfterDay2 = await User.findById(testUser._id);
        console.log('\nResults after Day 2:');
        console.log(`- Normal wallet: ₹${userAfterDay2.wallet.normal} (should be ₹${1000 - (expectedNormalDeduction * 2)})`);
        console.log(`- Benefit wallet: ₹${userAfterDay2.wallet.benefit} (should be ₹${2000 - (expectedBenefitTransfer * 2)})`);
        console.log(`- Withdrawal wallet: ₹${userAfterDay2.wallet.withdrawal} (should be ₹${expectedBenefitTransfer * 2})`);

        // Verify that deductions are consistent (based on initial amounts)
        const day1NormalDeduction = 1000 - userAfterDay1.wallet.normal;
        const day2NormalDeduction = userAfterDay1.wallet.normal - userAfterDay2.wallet.normal;
        const day1BenefitTransfer = 2000 - userAfterDay1.wallet.benefit;
        const day2BenefitTransfer = userAfterDay1.wallet.benefit - userAfterDay2.wallet.benefit;

        console.log('\n=== Verification ===');
        console.log(`Day 1 normal deduction: ₹${day1NormalDeduction} (expected: ₹${expectedNormalDeduction})`);
        console.log(`Day 2 normal deduction: ₹${day2NormalDeduction} (expected: ₹${expectedNormalDeduction})`);
        console.log(`Day 1 benefit transfer: ₹${day1BenefitTransfer} (expected: ₹${expectedBenefitTransfer})`);
        console.log(`Day 2 benefit transfer: ₹${day2BenefitTransfer} (expected: ₹${expectedBenefitTransfer})`);

        if (Math.abs(day1NormalDeduction - expectedNormalDeduction) < 0.01 && 
            Math.abs(day2NormalDeduction - expectedNormalDeduction) < 0.01 &&
            Math.abs(day1BenefitTransfer - expectedBenefitTransfer) < 0.01 &&
            Math.abs(day2BenefitTransfer - expectedBenefitTransfer) < 0.01) {
            console.log('\n✅ SUCCESS: All deductions are consistent and based on initial amounts!');
        } else {
            console.log('\n❌ FAILURE: Deductions are not consistent or not based on initial amounts!');
        }

        // Clean up
        await User.findByIdAndDelete(testUser._id);
        console.log('\nTest user cleaned up');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the test
testScheduler(); 