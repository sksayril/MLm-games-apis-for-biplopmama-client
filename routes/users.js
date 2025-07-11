const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const Deposit = require('../models/deposit.model');
const DepositRequest = require('../models/depositRequest.model');
const Withdrawal = require('../models/withdrawal.model');
const { authenticateUser } = require('../middleware/auth');
const { triggerGrowthCalculation } = require('../utilities/scheduler');
const { processInstantReferralBonus } = require('../utilities/withdrawalHandler');

// Generate unique referral code
const generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

/* User Registration */
router.post('/register', async (req, res) => {
  try {
    const { name, mobile, password, email, referralCode, referralLink } = req.body;
    
    // Extract referral code from link if provided
    let finalReferralCode = referralCode;
    if (!finalReferralCode && referralLink) {
      try {
        // Extract ref parameter from URL if it's in the format /register?ref=CODE
        const url = new URL(referralLink);
        const urlReferralCode = url.searchParams.get('ref');
        if (urlReferralCode) {
          finalReferralCode = urlReferralCode;
        }
      } catch (err) {
        // If referralLink is not a valid URL, check if it might be just the code
        if (referralLink.length >= 6 && referralLink.length <= 10) {
          finalReferralCode = referralLink;
        }
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this mobile number already exists' });
    }

    // Generate unique referral code for new user
    const userReferralCode = generateReferralCode();
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const newUser = new User({
      name,
      mobile,
      email,
      password: hashedPassword,
      referralCode: userReferralCode,
      level: 0
    });

    // Create a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // If user signed up with a referral code (from either direct code or extracted from link)
      if (finalReferralCode) {
        const referrer = await User.findOne({ referralCode: finalReferralCode }).session(session);
        if (referrer) {
          // Set referrer
          newUser.referredBy = referrer._id;
          newUser.level = 1; // This user is level 1 for the direct referrer
          
          // Build the ancestor list (up to 10 levels)
          const ancestors = [];
          
          // Add direct referrer as level 1
          ancestors.push({ userId: referrer._id, level: 1 });
          
          // Get referrer's ancestors and increment their level for this new user
          if (referrer.ancestors && referrer.ancestors.length > 0) {
            const referrerAncestors = referrer.ancestors;
            
            for (const ancestor of referrerAncestors) {
              // Only add ancestors up to level 9 (so they become level 10 for the new user)
              if (ancestor.level < 10) {
                ancestors.push({ 
                  userId: ancestor.userId, 
                  level: ancestor.level + 1 
                });
              }
            }
          }
          
          newUser.ancestors = ancestors;
          
          // Save the user with referral info
          await newUser.save({ session });
          
          // The new user gets added to the withdrawal wallet display after first withdrawal
          // This is handled by the MLM system when they make their first transaction
        }
      } else {
        // No referral code, just save the user
        await newUser.save({ session });
      }
      
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    // Generate JWT token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        mobile: newUser.mobile,
        email: newUser.email,
        referralCode: newUser.referralCode,
        level: newUser.level,
        wallet: newUser.wallet
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* User Login */
router.post('/login', async (req, res) => {
  try {
    const { mobile, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Create user object (without password)
    const userResponse = {
      id: user._id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      referralCode: user.referralCode,
      level: user.level,
      wallet: user.wallet
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get user profile */
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    // Generate referral links
    const baseUrl = process.env.FRONTEND_URL || 'https://dashboard.utpfund.live';
    const referralLink = `${baseUrl}/auth?ref=${user.referralCode}`;
    const shortLink = `${baseUrl}/r/${user.referralCode}`;
    
    // Create an improved message with clearer instructions
    const sharingMessage = `Join me on this amazing platform and start earning rewards today! 🎁\n\nUse either:\n▶ My referral code: ${user.referralCode}\n▶ Or sign up directly: ${referralLink}`;
    
    // Format the response with extended referral information
    const userResponse = {
      ...user.toObject(),
      referral: {
        code: user.referralCode,
        link: referralLink,
        shortLink: shortLink,
        shareOptions: {
          plain: referralLink,
          whatsapp: `https://wa.me/?text=${encodeURIComponent(sharingMessage)}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}&quote=${encodeURIComponent('Join me and earn rewards with my referral code: ' + user.referralCode)}`,
          twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join me and earn rewards with my referral code: ' + user.referralCode)}`,
          copyMessage: `${sharingMessage}\n\nClick the link or use my code when signing up: ${user.referralCode}`
        }
      }
    };
    
    res.status(200).json({
      success: true,
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get user wallet balance */
router.get('/wallet', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('wallet');
    res.status(200).json({
      success: true,
      wallet: user.wallet
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Transfer between wallets */
router.post('/wallet/transfer', authenticateUser, async (req, res) => {
  try {
    const { fromWallet, toWallet, amount } = req.body;
    
    // Validate inputs
    if (!['normal', 'benefit', 'game'].includes(fromWallet) || 
        !['normal', 'benefit', 'game'].includes(toWallet)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet type. Must be normal, benefit, or game'
      });
    }
    
    if (fromWallet === toWallet) {
      return res.status(400).json({
        success: false,
        message: 'Source and destination wallets cannot be the same'
      });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Get user with wallet info
      const user = await User.findById(req.user._id).session(session);
      
      // Check if user has sufficient balance in source wallet
      if (user.wallet[fromWallet] < amount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient balance in ${fromWallet} wallet. Available: ${user.wallet[fromWallet]} Rs`
        });
      }
      
      // Special case: Transfer from normal to game wallet
      if (fromWallet === 'normal' && toWallet === 'game') {
        const benefitDeduction = amount * 2;
        
        // If benefit wallet has enough balance, deduct from both
        if (user.wallet.benefit >= benefitDeduction) {
          // Deduct from normal wallet
          user.wallet.normal -= amount;
          
          // Deduct from benefit wallet (double amount)
          user.wallet.benefit -= benefitDeduction;
          
          // Add to game wallet
          user.wallet.game += amount;
          
          // Create transaction records
          const normalTransaction = new Transaction({
            userId: user._id,
            amount: -amount,
            type: 'transfer',
            walletType: 'normal',
            description: 'Transfer from normal wallet to game wallet',
            status: 'completed',
            transactionDate: new Date()
          });
          
          const benefitTransaction = new Transaction({
            userId: user._id,
            amount: -benefitDeduction,
            type: 'transfer',
            walletType: 'benefit',
            description: 'Deduction from benefit wallet for game wallet funding',
            status: 'completed',
            transactionDate: new Date()
          });
          
          const gameTransaction = new Transaction({
            userId: user._id,
            amount: amount,
            type: 'transfer',
            walletType: 'game',
            description: 'Transfer to game wallet from normal wallet',
            status: 'completed',
            transactionDate: new Date()
          });
          
          await normalTransaction.save({session});
          await benefitTransaction.save({session});
          await gameTransaction.save({session});
        } else {
          // If benefit wallet has insufficient balance (including 0), only deduct from normal wallet
          user.wallet.normal -= amount;
          user.wallet.game += amount;
          
          // Create transaction records
          const normalTransaction = new Transaction({
            userId: user._id,
            amount: -amount,
            type: 'transfer',
            walletType: 'normal',
            description: 'Transfer from normal wallet to game wallet (no benefit deduction)',
            status: 'completed',
            transactionDate: new Date()
          });
          
          const gameTransaction = new Transaction({
            userId: user._id,
            amount: amount,
            type: 'transfer',
            walletType: 'game',
            description: 'Transfer to game wallet from normal wallet (no benefit deduction)',
            status: 'completed',
            transactionDate: new Date()
          });
          
          await normalTransaction.save({session});
          await gameTransaction.save({session});
        }
      } else {
        // Standard wallet transfer
        user.wallet[fromWallet] -= amount;
        user.wallet[toWallet] += amount;
        
        // Create transaction records
        const sourceTransaction = new Transaction({
          userId: user._id,
          amount: -amount,
          type: 'transfer',
          walletType: fromWallet,
          description: `Transfer from ${fromWallet} wallet to ${toWallet} wallet`,
          status: 'completed',
          transactionDate: new Date()
        });
        
        const destinationTransaction = new Transaction({
          userId: user._id,
          amount: amount,
          type: 'transfer',
          walletType: toWallet,
          description: `Transfer to ${toWallet} wallet from ${fromWallet} wallet`,
          status: 'completed',
          transactionDate: new Date()
        });
        
        await sourceTransaction.save({session});
        await destinationTransaction.save({session});
      }
      
      await user.save({session});
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Transfer completed successfully',
        wallet: user.wallet
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
/* Get user transactions */
router.get('/transactions', authenticateUser, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'name email');
    
    res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get user referrals */
router.get('/referrals', authenticateUser, async (req, res) => {
  try {
    const referrals = await User.find({ referredBy: req.user._id })
      .select('name email level createdAt');
    
    res.status(200).json({
      success: true,
      referrals
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get MLM downline network */
router.get('/network', authenticateUser, async (req, res) => {
  try {
    // Find all users who have this user in their ancestors list
    const network = await User.aggregate([
      {
        $match: {
          'ancestors.userId': mongoose.Types.ObjectId(req.user._id)
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          level: 1,
          createdAt: 1,
          userLevel: {
            $filter: {
              input: '$ancestors',
              as: 'ancestor',
              cond: { $eq: ['$$ancestor.userId', mongoose.Types.ObjectId(req.user._id)] }
            }
          }
        }
      },
      {
        $sort: { 'userLevel.level': 1, createdAt: -1 }
      }
    ]);
    
    // Group users by their level in relation to the current user
    const networkByLevel = {};
    
    for (const user of network) {
      const level = user.userLevel[0].level;
      
      if (!networkByLevel[level]) {
        networkByLevel[level] = [];
      }
      
      networkByLevel[level].push({
        id: user._id,
        name: user.name,
        email: user.email,
        joinedAt: user.createdAt
      });
    }
    
    res.status(200).json({
      success: true,
      network: networkByLevel
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get user level details */
router.get('/level', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('level referralCode')
      .populate('referredBy', 'name email');
    
    // Get count of direct referrals
    const directReferrals = await User.countDocuments({ referredBy: req.user._id });
    
    // Get count of all downline members
    const allDownlineMembers = await User.countDocuments({ 'ancestors.userId': req.user._id });
    
    // Get stats by level
    const levelStats = await User.aggregate([
      {
        $match: {
          'ancestors.userId': mongoose.Types.ObjectId(req.user._id)
        }
      },
      {
        $project: {
          userLevel: {
            $filter: {
              input: '$ancestors',
              as: 'ancestor',
              cond: { $eq: ['$$ancestor.userId', mongoose.Types.ObjectId(req.user._id)] }
            }
          }
        }
      },
      {
        $group: {
          _id: { $arrayElemAt: ['$userLevel.level', 0] },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Format the level stats for response
    const formattedLevelStats = {};
    levelStats.forEach(stat => {
      formattedLevelStats[stat._id] = stat.count;
    });
    
    res.status(200).json({
      success: true,
      userLevel: {
        currentLevel: user.level,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        directReferrals: directReferrals,
        totalDownlineMembers: allDownlineMembers,
        levelDistribution: formattedLevelStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Create a new deposit */
router.post('/deposit', authenticateUser, async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid deposit amount is required' });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Check if this is the user's first deposit
      const existingDeposits = await Deposit.countDocuments({ userId: req.user._id });
      const isFirstDeposit = existingDeposits === 0;
      
      // Create the deposit record
      const deposit = new Deposit({
        userId: req.user._id,
        amount: Number(amount),
        startDate: new Date(),
        daysGrown: 0,
        isActive: true
      });
      
      await deposit.save({ session });
      
      // Update user's normal wallet balance
      const user = await User.findById(req.user._id).session(session);
      user.wallet.normal += Number(amount);
      await user.save({ session });
      
      // Process referral bonus if this is the user's first deposit and user has a referrer
      if (isFirstDeposit && user.referredBy) {
        const referrer = await User.findById(user.referredBy).session(session);
        if (referrer) {
          // Calculate 6% referral bonus
          const referralBonusAmount = Number(amount) * 0.06;
          
          // Add bonus to referrer's normal wallet
          referrer.wallet.normal += referralBonusAmount;
          await referrer.save({ session });
          
          // Create transaction record for referral bonus
          const referralTransaction = new Transaction({
            userId: referrer._id,
            type: 'referral_bonus',
            amount: referralBonusAmount,
            walletType: 'normal',
            description: `Referral bonus (6%) from ${user.name || user.email}'s first deposit of ${amount}`,
            status: 'completed',
            transactionDate: new Date()
          });
          
          await referralTransaction.save({ session });
        }
      }
      
      // Create transaction record for the deposit
      const transaction = new Transaction({
        userId: req.user._id,
        type: 'recharge',
        amount: Number(amount),
        walletType: 'normal',
        description: 'Wallet deposit for growth',
        status: 'completed'
      });
      
      await transaction.save({ session });
      
      await session.commitTransaction();
      
      res.status(201).json({
        success: true,
        message: 'Deposit created successfully. Your wallet will grow daily for 200 days.',
        deposit: {
          id: deposit._id,
          amount: deposit.amount,
          startDate: deposit.startDate,
          endDate: deposit.endDate,
          normalGrowthRate: `${deposit.normalGrowthRate * 100}%`,
          benefitGrowthRate: `${deposit.benefitGrowthRate * 100}%`
        }
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get user deposits */
router.get('/deposits', authenticateUser, async (req, res) => {
  try {
    const deposits = await Deposit.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      deposits: deposits.map(deposit => ({
        id: deposit._id,
        amount: deposit.amount,
        startDate: deposit.startDate,
        endDate: deposit.endDate,
        daysGrown: deposit.daysGrown,
        isActive: deposit.isActive,
        normalGrowthRate: `${deposit.normalGrowthRate * 100}%`,
        benefitGrowthRate: `${deposit.benefitGrowthRate * 100}%`,
        totalNormalGrowth: deposit.totalNormalGrowth,
        totalBenefitGrowth: deposit.totalBenefitGrowth,
        lastGrowthDate: deposit.lastGrowthDate
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Generate shareable referral link */
router.get('/referral-link', authenticateUser, async (req, res) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const referralLink = `${baseUrl}/register?ref=${req.user.referralCode}`;
    const shortLink = `${baseUrl}/r/${req.user.referralCode}`;
    
    // Create an improved message with clearer instructions
    const sharingMessage = `Join me on this amazing platform and start earning rewards today! 🎁\n\nUse either:\n▶ My referral code: ${req.user.referralCode}\n▶ Or sign up directly: ${referralLink}`;
    
    res.status(200).json({
      success: true,
      referralCode: req.user.referralCode,
      referralLink: referralLink,
      shortLink: shortLink,
      // Generate different sharing formats with improved messaging
      shareOptions: {
        plain: referralLink,
        code: req.user.referralCode,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(sharingMessage)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}&quote=${encodeURIComponent('Join me and earn rewards with my referral code: ' + req.user.referralCode)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join me and earn rewards with my referral code: ' + req.user.referralCode)}`,
        copyMessage: `${sharingMessage}\n\nClick the link or use my code when signing up: ${req.user.referralCode}`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Create a new deposit request */
router.post('/deposit-request', authenticateUser, async (req, res) => {
  try {
    const { amount, notes } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }
    
    // Create a new deposit request
    const depositRequest = new DepositRequest({
      userId: req.user._id,
      amount: Number(amount),
      notes: notes || `Deposit request for ${amount} Rs`,
      status: 'pending',
      requestDate: new Date()
    });
    
    await depositRequest.save();
    
    res.status(201).json({
      success: true,
      message: 'Deposit request created successfully. Waiting for admin approval.',
      depositRequest: {
        id: depositRequest._id,
        amount: depositRequest.amount,
        status: depositRequest.status,
        requestDate: depositRequest.requestDate,
        notes: depositRequest.notes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get all deposit requests for the current user */
router.get('/deposit-requests', authenticateUser, async (req, res) => {
  try {
    const depositRequests = await DepositRequest.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      depositRequests: depositRequests.map(request => ({
        id: request._id,
        amount: request.amount,
        status: request.status,
        requestDate: request.requestDate,
        approvedDate: request.approvedDate,
        rejectedDate: request.rejectedDate,
        rejectionReason: request.rejectionReason,
        notes: request.notes
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get a specific deposit request */
router.get('/deposit-request/:id', authenticateUser, async (req, res) => {
  try {
    const depositRequest = await DepositRequest.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!depositRequest) {
      return res.status(404).json({ success: false, message: 'Deposit request not found' });
    }
    
    res.status(200).json({
      success: true,
      depositRequest: {
        id: depositRequest._id,
        amount: depositRequest.amount,
        status: depositRequest.status,
        requestDate: depositRequest.requestDate,
        approvedDate: depositRequest.approvedDate,
        rejectedDate: depositRequest.rejectedDate,
        rejectionReason: depositRequest.rejectionReason,
        notes: depositRequest.notes,
        transaction: depositRequest.transactionId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Create a withdrawal request */
router.post('/withdrawal', authenticateUser, async (req, res) => {
  try {
    const { amount, withdrawalMethod, upiId, bankDetails } = req.body;
    
    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }
    
    // Minimum withdrawal amount requirement
    if (amount < 300) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is 500' });
    }

    // Validate withdrawal method
    if (!withdrawalMethod || !['upi', 'bank'].includes(withdrawalMethod)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid withdrawal method is required (upi or bank)' 
      });
    }

    // Validate UPI details
    if (withdrawalMethod === 'upi') {
      if (!upiId || upiId.trim() === '') {
        return res.status(400).json({ success: false, message: 'Valid UPI ID is required' });
      }
    }

    // Validate bank details
    if (withdrawalMethod === 'bank') {
      if (!bankDetails) {
        return res.status(400).json({ success: false, message: 'Bank details are required' });
      }
      
      const { accountNumber, ifscCode, accountName } = bankDetails;
      
      if (!accountNumber || accountNumber.trim() === '') {
        return res.status(400).json({ success: false, message: 'Valid account number is required' });
      }
      
      if (!ifscCode || ifscCode.trim() === '') {
        return res.status(400).json({ success: false, message: 'Valid IFSC code is required' });
      }
      
      if (!accountName || accountName.trim() === '') {
        return res.status(400).json({ success: false, message: 'Valid account name is required' });
      }
    }
    
    // Get user with wallet info
    const user = await User.findById(req.user._id);
    
    // Check if user has sufficient balance in withdrawal wallet
    if (user.wallet.withdrawal < amount) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient balance in withdrawal wallet. Available: ${user.wallet.withdrawal} Rs` 
      });
    }
    
    // Create a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Deduct amount from withdrawal wallet
      user.wallet.withdrawal -= amount;
      await user.save({ session });
      
      // Record the transaction
      const transaction = new Transaction({
        userId: user._id,
        amount: amount,
        type: 'withdrawal',
        walletType: 'withdrawal',
        description: `Withdrawal request from withdrawal wallet (${withdrawalMethod})`,
        status: 'pending',
        transactionDate: new Date()
      });
      
      await transaction.save({ session });
      
      // Create withdrawal request
      const withdrawalRequest = new Withdrawal({
        userId: req.user._id,
        amount: Number(amount),
        withdrawalMethod,
        upiId: withdrawalMethod === 'upi' ? upiId : undefined,
        bankDetails: withdrawalMethod === 'bank' ? bankDetails : undefined,
        status: 'pending'
      });
      
      await withdrawalRequest.save({ session });
      
      await session.commitTransaction();
      
      res.status(201).json({
        success: true,
        message: 'Withdrawal request created successfully. Waiting for admin approval.',
        withdrawal: {
          id: withdrawalRequest._id,
          amount: withdrawalRequest.amount,
          withdrawalMethod: withdrawalRequest.withdrawalMethod,
          upiId: withdrawalRequest.upiId,
          bankDetails: withdrawalRequest.bankDetails,
          status: withdrawalRequest.status,
          createdAt: withdrawalRequest.createdAt
        }
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get all withdrawal requests for the current user */
router.get('/withdrawals', authenticateUser, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      withdrawals: withdrawals.map(withdrawal => ({
        id: withdrawal._id,
        amount: withdrawal.amount,
        upiId: withdrawal.upiId,
        status: withdrawal.status,
        remarks: withdrawal.remarks,
        createdAt: withdrawal.createdAt,
        processedAt: withdrawal.processedAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get a specific withdrawal request */
router.get('/withdrawal/:id', authenticateUser, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }
    
    res.status(200).json({
      success: true,
      withdrawal: {
        id: withdrawal._id,
        amount: withdrawal.amount,
        upiId: withdrawal.upiId,
        status: withdrawal.status,
        remarks: withdrawal.remarks,
        createdAt: withdrawal.createdAt,
        processedAt: withdrawal.processedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;
