// Check current wallet balances
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user.model');

async function checkWallets() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('Connected to MongoDB');
    
    const users = await User.find();
    console.log(`Found ${users.length} users`);
    
    users.forEach(user => {
      console.log(`User ID: ${user._id}`);
      console.log(`Normal wallet: ${user.wallet.normal}`);
      console.log(`Benefit wallet: ${user.wallet.benefit}`);
      console.log(`Withdrawal wallet: ${user.wallet.withdrawal}`);
      console.log('-------------------');
    });
    
    await mongoose.disconnect();
    console.log('Database connection closed');
  } catch (err) {
    console.error('Error:', err);
    try {
      await mongoose.disconnect();
    } catch (e) {}
  }
}

checkWallets();
