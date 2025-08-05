const { calculateRemainingDays } = require('./utilities/scheduler');

// Test the fixed daily amount calculation
const testFixedAmountCalculation = () => {
    console.log('=== FIXED DAILY AMOUNT CALCULATION TEST ===\n');
    
    // Example: User deposits ₹1000, gets ₹2000 in benefit wallet
    const initialBenefitBalance = 2000;
    const dailyFixedAmount = Math.floor(initialBenefitBalance * 0.01 * 100) / 100; // ₹20
    
    console.log(`Initial benefit wallet balance: ₹${initialBenefitBalance}`);
    console.log(`Daily fixed transfer amount: ₹${dailyFixedAmount}`);
    console.log(`Total days to reach zero: ${Math.ceil(initialBenefitBalance / dailyFixedAmount)} days\n`);
    
    let currentBalance = initialBenefitBalance;
    let totalTransferred = 0;
    let day = 1;
    
    console.log('Daily calculation breakdown:');
    console.log('Day\tBalance\t\tFixed Transfer\tNew Balance\tTotal Transferred');
    console.log('---\t-------\t\t-------------\t-----------\t----------------');
    
    while (currentBalance > 0 && day <= 250) {
        const transferAmount = Math.min(dailyFixedAmount, currentBalance);
        const previousBalance = currentBalance;
        currentBalance = Math.max(0, currentBalance - transferAmount);
        totalTransferred += transferAmount;
        
        console.log(`${day}\t₹${previousBalance.toFixed(2)}\t₹${transferAmount.toFixed(2)}\t\t₹${currentBalance.toFixed(2)}\t\t₹${totalTransferred.toFixed(2)}`);
        
        if (currentBalance <= 0) {
            console.log(`\n✅ Benefit wallet reaches zero on day ${day}`);
            break;
        }
        
        day++;
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`Initial benefit balance: ₹${initialBenefitBalance}`);
    console.log(`Daily fixed transfer amount: ₹${dailyFixedAmount}`);
    console.log(`Total transferred to withdrawal wallet: ₹${totalTransferred.toFixed(2)}`);
    console.log(`Days to reach zero: ${day}`);
    console.log(`Remaining balance: ₹${currentBalance.toFixed(2)}`);
    
    // Test the helper function
    const estimatedDays = calculateRemainingDays(initialBenefitBalance, initialBenefitBalance);
    console.log(`\nHelper function estimate: ${estimatedDays} days`);
    
    // Mathematical explanation
    console.log('\n=== MATHEMATICAL EXPLANATION ===');
    console.log('With fixed daily transfer:');
    console.log(`Day 1: ${initialBenefitBalance} - ${dailyFixedAmount} = ${initialBenefitBalance - dailyFixedAmount}`);
    console.log(`Day 2: ${initialBenefitBalance - dailyFixedAmount} - ${dailyFixedAmount} = ${initialBenefitBalance - (2 * dailyFixedAmount)}`);
    console.log(`Day 3: ${initialBenefitBalance - (2 * dailyFixedAmount)} - ${dailyFixedAmount} = ${initialBenefitBalance - (3 * dailyFixedAmount)}`);
    console.log('... and so on');
    console.log(`\nThis creates a linear sequence: ${initialBenefitBalance} - (day × ${dailyFixedAmount})`);
    console.log(`After ${Math.ceil(initialBenefitBalance / dailyFixedAmount)} days, balance becomes zero.`);
};

// Test different initial amounts
const testDifferentAmounts = () => {
    console.log('\n\n=== TESTING DIFFERENT AMOUNTS ===\n');
    
    const testAmounts = [1000, 2000, 5000, 10000];
    
    testAmounts.forEach(amount => {
        const dailyAmount = Math.floor(amount * 0.01 * 100) / 100;
        const days = Math.ceil(amount / dailyAmount);
        console.log(`₹${amount} benefit balance → ₹${dailyAmount} daily → ${days} days to reach zero`);
    });
};

// Run tests
testFixedAmountCalculation();
testDifferentAmounts(); 