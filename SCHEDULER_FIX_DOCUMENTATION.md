# Scheduler Fix Documentation

## Problem Description

The original scheduler had the following issues:

1. **Inconsistent Deductions**: Daily deductions were calculated based on current wallet balance instead of initial deposit amount
2. **Wrong Percentage**: Benefit wallet transfer was using 0.1% instead of 1%
3. **Missing Initial Balance Tracking**: No tracking of initial normal wallet balance for consistent deductions

## Example Scenario

**User deposits ₹1000:**
- Normal wallet: ₹1000
- Benefit wallet: ₹2000 (2x bonus)

**Original (Broken) Logic:**
- Day 1: Normal deduction = ₹1000 × 0.5% = ₹5, Benefit transfer = ₹2000 × 0.1% = ₹2
- Day 2: Normal deduction = ₹995 × 0.5% = ₹4.98, Benefit transfer = ₹1998 × 0.1% = ₹1.998
- **Problem**: Deductions decrease each day based on current balance

**Fixed Logic:**
- Day 1: Normal deduction = ₹1000 × 0.5% = ₹5, Benefit transfer = ₹2000 × 1% = ₹20
- Day 2: Normal deduction = ₹1000 × 0.5% = ₹5, Benefit transfer = ₹2000 × 1% = ₹20
- **Solution**: Deductions remain consistent based on initial amounts

## Changes Made

### 1. User Model Updates (`models/user.model.js`)
```javascript
// Added new field to track initial normal wallet balance
initialNormalBalance: {
    type: Number,
    default: 0
}
```

### 2. Scheduler Logic Fix (`utilities/scheduler.js`)

#### Before (Broken):
```javascript
// Calculated based on current balance
const normalWalletDeduction = Math.floor(normalWallet * 0.005 * 100) / 100;
const benefitWalletTransfer = Math.floor(user.initialBenefitBalance * 0.001 * 100) / 100; // Wrong percentage
```

#### After (Fixed):
```javascript
// Calculate based on initial deposit amounts
if (user.initialNormalBalance && user.initialNormalBalance > 0) {
    normalWalletDeduction = Math.floor(user.initialNormalBalance * 0.005 * 100) / 100; // 0.5% of initial
} else if (normalWallet > 0) {
    user.initialNormalBalance = normalWallet; // Store initial balance
    normalWalletDeduction = Math.floor(normalWallet * 0.005 * 100) / 100;
}

if (user.initialBenefitBalance && user.initialBenefitBalance > 0) {
    benefitWalletTransfer = Math.floor(user.initialBenefitBalance * 0.01 * 100) / 100; // 1% of initial
} else if (benefitWallet > 0) {
    user.initialBenefitBalance = benefitWallet; // Store initial balance
    benefitWalletTransfer = Math.floor(benefitWallet * 0.01 * 100) / 100;
}
```

### 3. Key Improvements

1. **Consistent Deductions**: All daily deductions are now based on initial deposit amounts
2. **Correct Percentages**: 
   - Normal wallet: 0.5% of initial deposit
   - Benefit wallet: 1% of initial benefit balance
3. **Initial Balance Tracking**: Both normal and benefit wallets track their initial amounts
4. **Safety Checks**: Deductions are limited to available balance to prevent negative values

## Migration Script

Run the migration script to update existing users:

```bash
node scripts/update-initial-balances.js
```

This script will:
- Find users without initial balance fields
- Set `initialNormalBalance` to current normal wallet balance
- Set `initialBenefitBalance` to current benefit wallet balance
- Only update users who have wallet balances > 0

## Test Script

Run the test script to verify the fix:

```bash
node test-fixed-scheduler.js
```

This test will:
- Create a test user with ₹1000 normal and ₹2000 benefit
- Run scheduler for 2 days
- Verify deductions are consistent (₹5 normal, ₹20 benefit each day)
- Clean up test data

## Expected Behavior

### Daily Deductions
- **Normal Wallet**: 0.5% of initial deposit amount (consistent daily)
- **Benefit Wallet**: 1% of initial benefit balance (consistent daily)
- **Withdrawal Wallet**: Receives the benefit wallet transfers

### Example Timeline
```
Day 0: User deposits ₹1000
- Normal: ₹1000, Benefit: ₹2000, Withdrawal: ₹0

Day 1: First deduction
- Normal: ₹995 (₹1000 - ₹5), Benefit: ₹1980 (₹2000 - ₹20), Withdrawal: ₹20

Day 2: Second deduction
- Normal: ₹990 (₹995 - ₹5), Benefit: ₹1960 (₹1980 - ₹20), Withdrawal: ₹40

Day 3: Third deduction
- Normal: ₹985 (₹990 - ₹5), Benefit: ₹1940 (₹1960 - ₹20), Withdrawal: ₹60
```

## Helper Functions

### `calculateRemainingDays(benefitBalance, initialBenefitBalance)`
Calculates how many days until benefit wallet reaches zero based on 1% daily transfer.

### `calculateNormalWalletRemainingDays(normalBalance, initialNormalBalance)`
Calculates how many days until normal wallet reaches zero based on 0.5% daily deduction.

## Configuration

The scheduler runs daily at 12:00 PM. To change the schedule, modify the cron expression in `startDailyGrowthScheduler()`:

```javascript
cron.schedule('0 12 * * *', () => {
    calculateDailyGrowth();
});
```

## Monitoring

The scheduler logs detailed information:
- Number of users processed
- Total deductions and transfers
- Processing time
- Any errors during execution

## Security Considerations

1. **Database Transactions**: All operations use MongoDB transactions for data consistency
2. **Error Handling**: Comprehensive try-catch blocks with proper rollback
3. **Balance Validation**: Deductions are limited to available balance
4. **Logging**: Detailed logging for monitoring and debugging

## Future Improvements

1. **Rate Limiting**: Add rate limiting for manual triggers
2. **Notification System**: Send notifications to users about daily deductions
3. **Analytics Dashboard**: Create dashboard to monitor deduction patterns
4. **Configurable Percentages**: Make deduction percentages configurable via admin panel 