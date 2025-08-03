## Basic Api Build For nodejs connect with mongodb using express generator

### Recent Updates (Scheduler Logic)

**New Scheduler Logic (Updated)**
- Daily deduction is now based on total deposits, not current wallet balance
- Target: Double the original deposit amount in 200 days
- Formula: `Daily Deduction = (Total Deposits × 2) ÷ 200`
- Normal wallet is deducted first, then benefit wallet
- Benefit wallet deductions are transferred to withdrawal wallet
- Normal wallet deductions disappear (not transferred anywhere)

**Key Changes:**
1. Added `totalDeposits` field to User model
2. Updated scheduler to calculate fixed daily amount
3. Updated deposit approval routes to track total deposits
4. Created migration script for existing users

**Migration Required:**
Run the following script to update existing users:
```bash
node scripts/update-total-deposits.js
```

**Testing:**
```bash
node test-new-scheduler.js
```

---

***EXPRESS INSTALL***
```bash
npm i -g express
```
***EXPRESSS GENERATOR INSTALL***
```bash
npm install -g express-generator
```

***USING EXPRESS GENERATOR TO CREATE EXPRESS APP*** 
```bash
express --no-view==<projectname>
```
