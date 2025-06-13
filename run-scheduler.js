// Run the scheduler immediately with proper database connection
const mongoose = require('mongoose');
const { calculateDailyGrowth } = require('./utilities/scheduler');
require('dotenv').config();

// Main function to run the scheduler with database connection
async function runScheduler() {
  try {
    // Connect to the database first
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('Connected to MongoDB');
    
    // Run the wallet processing
    console.log('Starting immediate wallet processing');
    await calculateDailyGrowth();
    
    console.log('Wallet processing completed successfully');
    
    // Close the database connection properly
    await mongoose.disconnect();
    console.log('Database connection closed');
    
    process.exit(0);
  } catch (err) {
    console.error('Error running wallet processing:', err);
    
    // Make sure to close DB connection even on error
    try {
      await mongoose.disconnect();
      console.log('Database connection closed after error');
    } catch (disconnectErr) {
      console.error('Error closing database connection:', disconnectErr);
    }
    
    process.exit(1);
  }
}

// Execute the scheduler
runScheduler();
