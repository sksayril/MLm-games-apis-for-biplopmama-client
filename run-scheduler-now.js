const { triggerGrowthCalculation } = require('./utilities/scheduler');

console.log('🚀 Starting scheduler test...');
console.log('Time:', new Date().toLocaleString());

// Trigger the scheduler immediately
triggerGrowthCalculation()
    .then(() => {
        console.log('✅ Scheduler completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Scheduler failed:', error);
        process.exit(1);
    }); 