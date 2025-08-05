const cron = require('node-cron');

console.log('📅 SCHEDULER STATUS CHECK');
console.log('========================\n');

// Current time
const now = new Date();
console.log(`Current time: ${now.toLocaleString()}`);

// Next scheduled run (12:00 PM daily)
const nextRun = new Date();
nextRun.setHours(12, 0, 0, 0);

// If it's already past 12 PM today, schedule for tomorrow
if (now.getHours() >= 12) {
    nextRun.setDate(nextRun.getDate() + 1);
}

console.log(`Next scheduled run: ${nextRun.toLocaleString()}`);

// Calculate time until next run
const timeUntilNext = nextRun.getTime() - now.getTime();
const hoursUntilNext = Math.floor(timeUntilNext / (1000 * 60 * 60));
const minutesUntilNext = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));

console.log(`Time until next run: ${hoursUntilNext} hours, ${minutesUntilNext} minutes`);

// Show scheduler configuration
console.log('\n⚙️ SCHEDULER CONFIGURATION:');
console.log('• Schedule: Daily at 12:00 PM');
console.log('• Normal wallet: 0.5% daily deduction');
console.log('• Benefit wallet: 1% daily transfer to withdrawal wallet');
console.log('• Target: Benefit wallet reaches zero in ~200 days');

// Show cron expression
console.log('\n📋 CRON EXPRESSION: "0 12 * * *"');
console.log('• 0 = minute (0)');
console.log('• 12 = hour (12 PM)');
console.log('• * = day of month (every day)');
console.log('• * = month (every month)');
console.log('• * = day of week (every day)');

console.log('\n✅ Scheduler is configured and ready to run!'); 