const { calculateRemainingDays } = require('./utilities/scheduler');

// Test the benefit wallet calculation logic
const testBenefitWalletCalculation = () => {
    console.log('=== BENEFIT WALLET CALCULATION TEST ===\n');
    
    // Example: User deposits ₹1000, gets ₹2000 in benefit wallet
    const initialBenefitBalance = 2000;
    console.log(`Initial benefit wallet balance: ₹${initialBenefitBalance}`);
    
    let currentBalance = initialBenefitBalance;
    let totalTransferred = 0;
    let day = 1;
    
    console.log('\nDaily calculation breakdown:');
    console.log('Day\tBalance\t\t1% Transfer\tNew Balance\tTotal Transferred');
    console.log('---\t-------\t\t------------\t-----------\t----------------');
    
    while (currentBalance > 0.01 && day <= 250) {
        const dailyTransfer = Math.floor(currentBalance * 0.01 * 100) / 100;
        const previousBalance = currentBalance;
        currentBalance = Math.max(0, currentBalance - dailyTransfer);
        totalTransferred += dailyTransfer;
        
        console.log(`${day}\t₹${previousBalance.toFixed(2)}\t₹${dailyTransfer.toFixed(2)}\t\t₹${currentBalance.toFixed(2)}\t\t₹${totalTransferred.toFixed(2)}`);
        
        if (currentBalance <= 0.01) {
            console.log(`\n✅ Benefit wallet reaches zero on day ${day}`);
            break;
        }
        
        day++;
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`Initial benefit balance: ₹${initialBenefitBalance}`);
    console.log(`Total transferred to withdrawal wallet: ₹${totalTransferred.toFixed(2)}`);
    console.log(`Days to reach zero: ${day}`);
    console.log(`Remaining balance: ₹${currentBalance.toFixed(2)}`);
    
    // Test the helper function
    const estimatedDays = calculateRemainingDays(initialBenefitBalance);
    console.log(`\nHelper function estimate: ${estimatedDays} days`);
    
    // Mathematical explanation
    console.log('\n=== MATHEMATICAL EXPLANATION ===');
    console.log('With 1% daily transfer:');
    console.log('Day 1: 2000 - (2000 * 0.01) = 2000 - 20 = 1980');
    console.log('Day 2: 1980 - (1980 * 0.01) = 1980 - 19.8 = 1960.2');
    console.log('... and so on');
    console.log('\nThis creates a geometric sequence that approaches zero.');
    console.log('Theoretically, it never reaches exactly zero, but becomes negligible (< ₹0.01)');
};

// Test different initial amounts
const testDifferentAmounts = () => {
    console.log('\n\n=== TESTING DIFFERENT AMOUNTS ===\n');
    
    const testAmounts = [1000, 2000, 5000, 10000];
    
    testAmounts.forEach(amount => {
        const days = calculateRemainingDays(amount);
        console.log(`₹${amount} benefit balance → ${days} days to reach zero`);
    });
};

// Run tests
testBenefitWalletCalculation();
testDifferentAmounts(); 