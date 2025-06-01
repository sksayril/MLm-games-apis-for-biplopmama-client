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
const { authenticateUser } = require('../middleware/auth');
const { triggerGrowthCalculation } = require('../utilities/scheduler');

// Generate unique referral code
const generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

/* User Registration */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Generate unique referral code for new user
    const userReferralCode = generateReferralCode();
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      referralCode: userReferralCode,
      level: 0
    });

    // If user signed up with a referral code
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        // Set referrer
        newUser.referredBy = referrer._id;
        newUser.level = 1;
        
        // Build the ancestor list (up to 10 levels)
        const ancestors = [];
        
        // Add direct referrer as level 1
        ancestors.push({ userId: referrer._id, level: 1 });
        
        // Get referrer's ancestors and increment their level
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
      }
    }

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
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
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
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

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        level: user.level,
        wallet: user.wallet
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get user profile */
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.status(200).json({
      success: true,
      user
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
      
      // Check if user has sufficient balance
      if (user.wallet[fromWallet] < amount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient balance in ${fromWallet} wallet. Available: ${user.wallet[fromWallet]} Rs`
        });
      }
      
      // Special case: Transfer from normal to game wallet (deduct from benefit wallet too)
      if (fromWallet === 'normal' && toWallet === 'game') {
        const benefitDeduction = amount * 2;
        
        // Check if benefit wallet has enough
        if (user.wallet.benefit < benefitDeduction) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient balance in benefit wallet. Required: ${benefitDeduction} Rs, Available: ${user.wallet.benefit} Rs`
          });
        }
        
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
      
      // Create transaction record
      const transaction = new Transaction({
        userId: req.user._id,
        type: 'deposit',
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
    
    res.status(200).json({
      success: true,
      referralCode: req.user.referralCode,
      referralLink: referralLink,
      // Generate different sharing formats
      shareOptions: {
        plain: referralLink,
        whatsapp: `https://wa.me/?text=Join me on this amazing platform and earn rewards! Use my referral code: ${req.user.referralCode} or sign up here: ${referralLink}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join me on this amazing platform and earn rewards! Use my referral code: ' + req.user.referralCode)}`
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

module.exports = router;
