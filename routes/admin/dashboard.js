const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const moment = require('moment');

// Import models
const User = require('../../models/user.model');
const GameRoom = require('../../models/gameRoom.model');
const NumberGameRoom = require('../../models/numberGameRoom.model');
const GamePlayer = require('../../models/gamePlayer.model');
const NumberGamePlayer = require('../../models/numberGamePlayer.model');
const DepositRequest = require('../../models/depositRequest.model');
const Withdrawal = require('../../models/withdrawal.model');
const Transaction = require('../../models/transaction.model');
const { authenticateAdmin } = require('../../middleware/auth');

/**
 * @route   GET /api/admin/dashboard/stats
 * @desc    Get comprehensive dashboard statistics
 * @access  Private (Admin only)
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();

    // Get total players who have participated in games
    const colorGamePlayers = await GamePlayer.distinct('userId');
    const numberGamePlayers = await NumberGamePlayer.distinct('userId');
    
    // Combine and deduplicate to get unique players
    const uniquePlayers = [...new Set([...colorGamePlayers, ...numberGamePlayers])];
    const totalPlayingUsers = uniquePlayers.length;

    // Get game statistics - which game is most played
    const colorGames = await GameRoom.countDocuments({ status: 'completed' });
    const numberGames = await NumberGameRoom.countDocuments({ status: 'completed' });
    
    const gameStats = {
      colorPrediction: {
        count: colorGames,
        percentage: totalPlayingUsers > 0 ? (colorGamePlayers.length / totalPlayingUsers * 100).toFixed(2) : 0
      },
      numberPrediction: {
        count: numberGames,
        percentage: totalPlayingUsers > 0 ? (numberGamePlayers.length / totalPlayingUsers * 100).toFixed(2) : 0
      },
      mostPlayed: colorGames > numberGames ? 'Color Prediction' : 'Number Prediction'
    };

    // Calculate revenue - approved deposits, approved withdrawals, and net revenue
    const approvedDeposits = await DepositRequest.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const approvedWithdrawals = await Withdrawal.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const totalDeposits = approvedDeposits.length > 0 ? approvedDeposits[0].total : 0;
    const totalWithdrawals = approvedWithdrawals.length > 0 ? approvedWithdrawals[0].total : 0;
    const revenue = totalDeposits - totalWithdrawals;

    // Get recent 5 users
    const recentUsers = await User.find()
      .select('_id name email createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate user growth by month
    const userGrowthByMonth = await User.aggregate([
      {
        $group: {
          _id: { 
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          count: 1,
          monthName: {
            $let: {
              vars: {
                monthsInYear: [
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ]
              },
              in: { $arrayElemAt: ['$$monthsInYear', { $subtract: ['$_id.month', 1] }] }
            }
          }
        }
      }
    ]);

    // Return all statistics
    res.status(200).json({
      success: true,
      dashboardStats: {
        users: {
          total: totalUsers,
          playing: totalPlayingUsers,
          notPlaying: totalUsers - totalPlayingUsers,
          recentUsers
        },
        games: gameStats,
        finance: {
          totalDeposits,
          totalWithdrawals,
          revenue
        },
        userGrowth: userGrowthByMonth
      }
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/admin/dashboard/game-analytics
 * @desc    Get detailed game analytics
 * @access  Private (Admin only)
 */
router.get('/game-analytics', authenticateAdmin, async (req, res) => {
  try {
    // Color game analytics
    const colorGameAnalytics = await GameRoom.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalGames: { $sum: 1 },
          totalPlayers: { $sum: '$currentPlayers' },
          totalEntryFees: { $sum: { $multiply: ['$entryFee', '$currentPlayers'] } },
          // Count which colors won the most
          redWins: { $sum: { $cond: [{ $eq: ['$winningColor', 'red'] }, 1, 0] } },
          greenWins: { $sum: { $cond: [{ $eq: ['$winningColor', 'green'] }, 1, 0] } },
          blueWins: { $sum: { $cond: [{ $eq: ['$winningColor', 'blue'] }, 1, 0] } },
          yellowWins: { $sum: { $cond: [{ $eq: ['$winningColor', 'yellow'] }, 1, 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          totalGames: 1,
          totalPlayers: 1,
          totalEntryFees: 1,
          colorWins: {
            red: '$redWins',
            green: '$greenWins',
            blue: '$blueWins',
            yellow: '$yellowWins'
          }
        }
      }
    ]);

    // Number game analytics
    const numberGameAnalytics = await NumberGameRoom.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalGames: { $sum: 1 },
          totalPlayers: { $sum: '$currentPlayers' },
          totalEntryFees: { $sum: { $multiply: ['$entryFee', '$currentPlayers'] } },
          // Count which side won the most
          bigWins: { $sum: { $cond: [{ $eq: ['$winningType', 'big'] }, 1, 0] } },
          smallWins: { $sum: { $cond: [{ $eq: ['$winningType', 'small'] }, 1, 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          totalGames: 1,
          totalPlayers: 1,
          totalEntryFees: 1,
          typeWins: {
            big: '$bigWins',
            small: '$smallWins'
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      colorGameAnalytics: colorGameAnalytics.length > 0 ? colorGameAnalytics[0] : {
        totalGames: 0,
        totalPlayers: 0,
        totalEntryFees: 0,
        colorWins: { red: 0, green: 0, blue: 0, yellow: 0 }
      },
      numberGameAnalytics: numberGameAnalytics.length > 0 ? numberGameAnalytics[0] : {
        totalGames: 0,
        totalPlayers: 0,
        totalEntryFees: 0,
        typeWins: { big: 0, small: 0 }
      }
    });
  } catch (error) {
    console.error('Game Analytics Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch game analytics',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/admin/dashboard/financial-overview
 * @desc    Get detailed financial analytics
 * @access  Private (Admin only)
 */
router.get('/financial-overview', authenticateAdmin, async (req, res) => {
  try {
    // Get timeframe from query params or default to current month
    const { period } = req.query;
    let startDate, endDate;
    
    switch(period) {
      case 'today':
        startDate = moment().startOf('day');
        endDate = moment().endOf('day');
        break;
      case 'week':
        startDate = moment().subtract(7, 'days').startOf('day');
        endDate = moment().endOf('day');
        break;
      case 'month':
        startDate = moment().startOf('month');
        endDate = moment().endOf('month');
        break;
      case 'year':
        startDate = moment().startOf('year');
        endDate = moment().endOf('year');
        break;
      default:
        startDate = moment().startOf('month');
        endDate = moment().endOf('month');
    }

    // Deposits by wallet type
    const depositsAnalytics = await DepositRequest.aggregate([
      {
        $match: {
          status: 'approved',
          createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        }
      },
      {
        $group: {
          _id: '$walletType',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          walletType: '$_id',
          total: 1,
          count: 1
        }
      }
    ]);

    // Withdrawals analytics
    const withdrawalsAnalytics = await Withdrawal.aggregate([
      {
        $match: {
          status: 'approved',
          createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          count: 1
        }
      }
    ]);

    // Daily transaction analytics for chart
    const dailyTransactions = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$type"
          },
          total: { $sum: "$amount" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          transactions: {
            $push: {
              type: "$_id.type",
              total: "$total"
            }
          }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Format the response
    const depositsByType = {};
    let totalDeposits = 0;
    let depositCount = 0;

    depositsAnalytics.forEach(item => {
      depositsByType[item.walletType] = {
        amount: item.total,
        count: item.count
      };
      totalDeposits += item.total;
      depositCount += item.count;
    });

    const totalWithdrawals = withdrawalsAnalytics.length > 0 ? withdrawalsAnalytics[0].total : 0;
    const withdrawalCount = withdrawalsAnalytics.length > 0 ? withdrawalsAnalytics[0].count : 0;
    const netRevenue = totalDeposits - totalWithdrawals;

    res.status(200).json({
      success: true,
      period: {
        from: startDate.format('YYYY-MM-DD'),
        to: endDate.format('YYYY-MM-DD'),
        label: period || 'month'
      },
      overview: {
        totalDeposits,
        depositCount,
        depositsByType,
        totalWithdrawals,
        withdrawalCount,
        netRevenue,
        profitMargin: totalDeposits > 0 ? ((netRevenue / totalDeposits) * 100).toFixed(2) : 0
      },
      dailyTransactions
    });
  } catch (error) {
    console.error('Financial Overview Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch financial overview',
      error: error.message
    });
  }
});

module.exports = router;
