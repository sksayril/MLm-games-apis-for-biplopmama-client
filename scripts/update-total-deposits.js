const mongoose = require('mongoose');
const User = require('../models/user.model');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mlm-system', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const updateTotalDeposits = async () => {
    console.log('Starting total deposits update for existing users...');
    
    try {
        const users = await User.find({});
        let updatedCount = 0;
        
        for (const user of users) {
            const normalWallet = user.wallet.normal || 0;
            const benefitWallet = user.wallet.benefit || 0;
            
            // Calculate total deposits based on current wallet balances
            // Since benefit wallet is 2x the deposit amount, we can calculate:
            // totalDeposits = benefitWallet / 2
            const calculatedTotalDeposits = benefitWallet / 2;
            
            // If user has no benefit wallet but has normal wallet, use normal wallet
            const totalDeposits = calculatedTotalDeposits > 0 ? calculatedTotalDeposits : normalWallet;
            
            if (user.totalDeposits !== totalDeposits) {
                user.totalDeposits = totalDeposits;
                await user.save();
                updatedCount++;
                
                console.log(`Updated user ${user.name || user.email}:`);
                console.log(`  - Normal wallet: ₹${normalWallet}`);
                console.log(`  - Benefit wallet: ₹${benefitWallet}`);
                console.log(`  - Calculated total deposits: ₹${totalDeposits}`);
                console.log('  ---');
            }
        }
        
        console.log(`\nUpdate completed! ${updatedCount} users updated.`);
        
    } catch (error) {
        console.error('Error updating total deposits:', error);
    } finally {
        mongoose.connection.close();
    }
};

// Run the update
updateTotalDeposits(); 