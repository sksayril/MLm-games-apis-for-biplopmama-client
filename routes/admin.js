const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Admin = require('../models/admin.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const Deposit = require('../models/deposit.model');
const DepositRequest = require('../models/depositRequest.model');
const Withdrawal = require('../models/withdrawal.model');
const { authenticateAdmin } = require('../middleware/auth');

/* Admin Registration (accessible only internally or by superadmin) */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: 'Admin with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new admin
    const newAdmin = new Admin({
      name,
      email,
      password: hashedPassword,
      role: role || 'admin'
    });

    await newAdmin.save();

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      admin: {
        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Admin Login */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get admin profile */
router.get('/profile', authenticateAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select('-password');
    res.status(200).json({
      success: true,
      admin
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get all users */
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get user by ID */
router.get('/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Recharge user's wallet */
router.post('/recharge-wallet', authenticateAdmin, async (req, res) => {
  try {
    const { userId, amount } = req.body;
    
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'User ID and valid amount are required' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Start a session for transaction atomicity
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Update normal wallet balance
      user.wallet.normal += Number(amount);
      
      // Update benefit wallet balance (2x the normal amount)
      user.wallet.benefit += Number(amount) * 2;
      
      await user.save({ session });
      
      // Create transaction record
      const transaction = new Transaction({
        userId: user._id,
        type: 'recharge',
        amount: Number(amount),
        walletType: 'normal',
        description: 'Wallet recharge by admin',
        performedBy: req.admin._id
      });
      
      await transaction.save({ session });
      
      // Create benefit transaction record
      const benefitTransaction = new Transaction({
        userId: user._id,
        type: 'bonus',
        amount: Number(amount) * 2,
        walletType: 'benefit',
        description: 'Benefit wallet bonus from recharge',
        performedBy: req.admin._id
      });
      
      await benefitTransaction.save({ session });
      
      // Distribute MLM benefits to upline (ancestors)
      if (user.ancestors && user.ancestors.length > 0) {
        for (const ancestor of user.ancestors) {
          // Calculate 1% benefit for each level
          const benefitAmount = Number(amount) * 0.01;
          
          // Find the ancestor user
          const ancestorUser = await User.findById(ancestor.userId);
          if (ancestorUser) {
            // Update ancestor's benefit wallet
            ancestorUser.wallet.benefit += benefitAmount;
            await ancestorUser.save({ session });
            
            // Create transaction record for the ancestor
            const ancestorTransaction = new Transaction({
              userId: ancestorUser._id,
              type: 'bonus',
              amount: benefitAmount,
              walletType: 'benefit',
              description: `MLM benefit from level ${ancestor.level} user recharge`,
              performedBy: req.admin._id
            });
            
            await ancestorTransaction.save({ session });
          }
        }
      }
      
      await session.commitTransaction();
      session.endSession();
      
      res.status(200).json({
        success: true,
        message: 'Wallet recharged successfully',
        wallet: user.wallet
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get all transactions */
router.get('/transactions', authenticateAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .populate('performedBy', 'name email');
    
    res.status(200).json({
      success: true,
      count: transactions.length,
      transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get user transactions */
router.get('/user-transactions/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'name email');
    
    res.status(200).json({
      success: true,
      count: transactions.length,
      transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get MLM network statistics */
router.get('/mlm-stats', authenticateAdmin, async (req, res) => {
  try {
    // Get users count by level
    const levelStats = await User.aggregate([
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Get total users
    const totalUsers = await User.countDocuments();
    
    // Get total wallet balance
    const walletStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalNormal: { $sum: '$wallet.normal' },
          totalBenefit: { $sum: '$wallet.benefit' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        levelStats,
        walletStats: walletStats[0] || { totalNormal: 0, totalBenefit: 0 }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get all deposit requests */
router.get('/deposit-requests', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    
    // Build filter based on query parameters
    const filter = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }
    
    const depositRequests = await DepositRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email');
    
    res.status(200).json({
      success: true,
      count: depositRequests.length,
      depositRequests: depositRequests.map(request => ({
        id: request._id,
        user: {
          id: request.userId._id,
          name: request.userId.name,
          email: request.userId.email
        },
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
router.get('/deposit-request/:id', authenticateAdmin, async (req, res) => {
  try {
    const depositRequest = await DepositRequest.findById(req.params.id)
      .populate('userId', 'name email wallet')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('transactionId');
    
    if (!depositRequest) {
      return res.status(404).json({ success: false, message: 'Deposit request not found' });
    }
    
    res.status(200).json({
      success: true,
      depositRequest: {
        id: depositRequest._id,
        user: {
          id: depositRequest.userId._id,
          name: depositRequest.userId.name,
          email: depositRequest.userId.email,
          wallet: depositRequest.userId.wallet
        },
        amount: depositRequest.amount,
        status: depositRequest.status,
        requestDate: depositRequest.requestDate,
        approvedBy: depositRequest.approvedBy,
        approvedDate: depositRequest.approvedDate,
        rejectedBy: depositRequest.rejectedBy,
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

/* Approve a deposit request */
router.post('/deposit-request/:id/approve', authenticateAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const depositRequest = await DepositRequest.findById(req.params.id).session(session);
    
    if (!depositRequest) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Deposit request not found' });
    }
    
    if (depositRequest.status !== 'pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        success: false, 
        message: `This deposit request has already been ${depositRequest.status}` 
      });
    }
    
    // Find the user
    const user = await User.findById(depositRequest.userId).session(session);
    
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Calculate amount after 10% deduction
    const deductionAmount = depositRequest.amount * 0.10;
    const finalAmount = depositRequest.amount - deductionAmount;
    
    // Update normal wallet balance (90% of deposit amount)
    user.wallet.normal += finalAmount;
    
    // Update benefit wallet balance (2x the final amount)
    user.wallet.benefit += finalAmount * 2;
    
    await user.save({ session });
    
    // Create transaction record for normal wallet
    const normalTransaction = new Transaction({
      userId: user._id,
      type: 'recharge',
      amount: finalAmount,
      walletType: 'normal',
      description: `Deposit request #${depositRequest._id} approved (10% deduction applied)`,
      status: 'completed',
      performedBy: req.admin._id
    });
    
    await normalTransaction.save({ session });
    
    // Create transaction record for benefit wallet
    const benefitTransaction = new Transaction({
      userId: user._id,
      type: 'recharge',
      amount: finalAmount * 2,
      walletType: 'benefit',
      description: `Benefit wallet bonus from deposit request #${depositRequest._id} (10% deduction applied)`,
      status: 'completed',
      performedBy: req.admin._id
    });
    
    await benefitTransaction.save({ session });
    
    // Create a deposit for daily growth (using final amount)
    const deposit = new Deposit({
      userId: user._id,
      amount: finalAmount,
      startDate: new Date(),
      daysGrown: 0,
      isActive: true
    });
    
    await deposit.save({ session });
    
    // Update deposit request status
    depositRequest.status = 'approved';
    depositRequest.approvedBy = req.admin._id;
    depositRequest.approvedDate = new Date();
    depositRequest.transactionId = normalTransaction._id;
    
    await depositRequest.save({ session });
    
    // Distribute MLM benefits to upline (ancestors) based on final amount
    if (user.ancestors && user.ancestors.length > 0) {
      for (const ancestor of user.ancestors) {
        // Calculate 1% benefit for each level from final amount
        const benefitAmount = finalAmount * 0.01;
        
        // Find the ancestor user
        const ancestorUser = await User.findById(ancestor.userId).session(session);
        if (ancestorUser) {
          // Update ancestor's benefit wallet
          ancestorUser.wallet.benefit += benefitAmount;
          await ancestorUser.save({ session });
          
          // Create transaction record for the ancestor
          const ancestorTransaction = new Transaction({
            userId: ancestorUser._id,
            type: 'bonus',
            amount: benefitAmount,
            walletType: 'benefit',
            description: `MLM benefit from level ${ancestor.level} user deposit request (10% deduction applied)`,
            status: 'completed',
            performedBy: req.admin._id
          });
          
          await ancestorTransaction.save({ session });
        }
      }
    }
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Deposit request approved successfully (10% deduction applied)',
      depositRequest: {
        id: depositRequest._id,
        status: 'approved',
        approvedBy: req.admin._id,
        approvedDate: depositRequest.approvedDate,
        originalAmount: depositRequest.amount,
        deductionAmount: deductionAmount,
        finalAmount: finalAmount
      },
      updatedWallet: {
        normal: user.wallet.normal,
        benefit: user.wallet.benefit
      },
      deposit: {
        id: deposit._id,
        amount: deposit.amount,
        startDate: deposit.startDate,
        endDate: deposit.endDate
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Reject a deposit request */
router.post('/deposit-request/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const depositRequest = await DepositRequest.findById(req.params.id);
    
    if (!depositRequest) {
      return res.status(404).json({ success: false, message: 'Deposit request not found' });
    }
    
    if (depositRequest.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `This deposit request has already been ${depositRequest.status}` 
      });
    }
    
    // Update deposit request status
    depositRequest.status = 'rejected';
    depositRequest.rejectedBy = req.admin._id;
    depositRequest.rejectedDate = new Date();
    depositRequest.rejectionReason = reason || 'Request rejected by admin';
    
    await depositRequest.save();
    
    res.status(200).json({
      success: true,
      message: 'Deposit request rejected successfully',
      depositRequest: {
        id: depositRequest._id,
        status: 'rejected',
        rejectedBy: req.admin._id,
        rejectedDate: depositRequest.rejectedDate,
        rejectionReason: depositRequest.rejectionReason
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get all withdrawal requests */
router.get('/withdrawals', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    
    // Build filter based on query parameters
    const filter = {};
    if (status) {
      filter.status = status;
    }
    
    const withdrawals = await Withdrawal.find(filter)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .populate('processedBy', 'name email');
    
    res.status(200).json({
      success: true,
      count: withdrawals.length,
      withdrawals: withdrawals.map(withdrawal => ({
        id: withdrawal._id,
        userId: withdrawal.userId,
        userEmail: withdrawal.userId ? withdrawal.userId.email : null,
        userName: withdrawal.userId ? withdrawal.userId.name : null,
        amount: withdrawal.amount,
        withdrawalMethod: withdrawal.withdrawalMethod,
        // Show UPI ID if method is UPI
        ...(withdrawal.withdrawalMethod === 'upi' && {
          upiId: withdrawal.upiId
        }),
        // Show bank details if method is bank
        ...(withdrawal.withdrawalMethod === 'bank' && {
          bankDetails: {
            accountNumber: withdrawal.bankDetails.accountNumber,
            ifscCode: withdrawal.bankDetails.ifscCode,
            accountName: withdrawal.bankDetails.accountName
          }
        }),
        status: withdrawal.status,
        remarks: withdrawal.remarks,
        processedBy: withdrawal.processedBy,
        processedAt: withdrawal.processedAt,
        createdAt: withdrawal.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Get a specific withdrawal request */
router.get('/withdrawal/:id', authenticateAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id)
      .populate('userId', 'name email wallet')
      .populate('processedBy', 'name email');
    
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }
    
    res.status(200).json({
      success: true,
      withdrawal: {
        id: withdrawal._id,
        user: {
          id: withdrawal.userId._id,
          name: withdrawal.userId.name,
          email: withdrawal.userId.email,
          wallet: withdrawal.userId.wallet
        },
        amount: withdrawal.amount,
        upiId: withdrawal.upiId,
        status: withdrawal.status,
        remarks: withdrawal.remarks,
        processedBy: withdrawal.processedBy,
        processedAt: withdrawal.processedAt,
        createdAt: withdrawal.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/* Approve a withdrawal request */
router.post('/withdrawal/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const withdrawal = await Withdrawal.findById(req.params.id).session(session);
      
      if (!withdrawal) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
      }
      
      if (withdrawal.status !== 'pending') {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: `This withdrawal request has already been ${withdrawal.status}` 
        });
      }

      // Calculate 10% deduction
      const deductionAmount = withdrawal.amount * 0.10;
      const finalAmount = withdrawal.amount - deductionAmount;
      
      // Update withdrawal request status
      withdrawal.status = 'approved';
      withdrawal.processedBy = req.admin._id;
      withdrawal.processedAt = new Date();
      withdrawal.remarks = req.body.remarks || 'Approved by admin (10% deduction applied)';
      withdrawal.originalAmount = withdrawal.amount;
      withdrawal.deductionAmount = deductionAmount;
      withdrawal.finalAmount = finalAmount;
      
      await withdrawal.save({ session });
      
      // Find related transaction and mark as completed
      const transaction = await Transaction.findOneAndUpdate(
        { userId: withdrawal.userId, type: 'withdrawal', status: 'pending', amount: withdrawal.amount },
        { 
          status: 'completed', 
          amount: finalAmount,
          description: `Withdrawal request approved (10% deduction applied. Original: ${withdrawal.amount}, Deduction: ${deductionAmount}, Final: ${finalAmount})` 
        },
        { new: true, session }
      );
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Withdrawal request approved successfully (10% deduction applied)',
        withdrawal: {
          id: withdrawal._id,
          status: 'approved',
          processedBy: req.admin._id,
          processedAt: withdrawal.processedAt,
          originalAmount: withdrawal.originalAmount,
          deductionAmount: withdrawal.deductionAmount,
          finalAmount: withdrawal.finalAmount
        },
        transaction: transaction ? {
          id: transaction._id,
          status: transaction.status,
          amount: transaction.amount,
          description: transaction.description
        } : null
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

/* Reject a withdrawal request */
router.post('/withdrawal/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const withdrawal = await Withdrawal.findById(req.params.id).session(session);
      
      if (!withdrawal) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
      }
      
      if (withdrawal.status !== 'pending') {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: `This withdrawal request has already been ${withdrawal.status}` 
        });
      }
      
      // Get the user
      const user = await User.findById(withdrawal.userId).session(session);
      
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      // Refund the amount back to game wallet
      user.wallet.game += withdrawal.amount;
      await user.save({ session });
      
      // Update withdrawal request status
      withdrawal.status = 'rejected';
      withdrawal.processedBy = req.admin._id;
      withdrawal.processedAt = new Date();
      withdrawal.remarks = reason || 'Rejected by admin';
      
      await withdrawal.save({ session });
      
      // Find related transaction and mark as cancelled
      const transaction = await Transaction.findOneAndUpdate(
        { userId: withdrawal.userId, type: 'withdrawal', status: 'pending', amount: withdrawal.amount },
        { status: 'cancelled', description: `Withdrawal request rejected: ${reason}` },
        { new: true, session }
      );
      
      // Create a refund transaction
      const refundTransaction = new Transaction({
        userId: user._id,
        amount: withdrawal.amount,
        type: 'refund',
        walletType: 'game',
        description: 'Refund for rejected withdrawal request',
        status: 'completed',
        performedBy: req.admin._id
      });
      
      await refundTransaction.save({ session });
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Withdrawal request rejected and amount refunded',
        withdrawal: {
          id: withdrawal._id,
          status: 'rejected',
          processedBy: req.admin._id,
          processedAt: withdrawal.processedAt,
          remarks: withdrawal.remarks
        },
        updatedWallet: {
          game: user.wallet.game
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

module.exports = router;
