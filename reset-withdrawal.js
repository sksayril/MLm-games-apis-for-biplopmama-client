const mongoose = require('mongoose');
const User = require('./models/user.model');

// Configuration - Update this with your MongoDB URI
const MONGODB_URI = 'mongodb+srv://onlinecrypto09:JKRyAUzLPBLrF482@cluster0.acyc1ui.mongodb.net/mlm2';

async function resetWithdrawal() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find and reset all withdrawal balances
        const result = await User.updateMany(
            { 'wallet.withdrawal': { $gt: 0 } },
            { $set: { 'wallet.withdrawal': 0 } }
        );

        console.log(`✅ Reset withdrawal balance for ${result.modifiedCount} users`);
        console.log('All withdrawal balances are now zero');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

resetWithdrawal(); 