const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const NumberGameRoom = require('../models/numberGameRoom.model');
const NumberGamePlayer = require('../models/numberGamePlayer.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const { authenticateUser } = require('../middleware/auth');

// Get available number game rooms for users
router.get('/rooms', authenticateUser, async (req, res) => {
    try {
        // Only show waiting rooms to regular users
        const gameRooms = await NumberGameRoom.find({ status: 'waiting' })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            gameRooms: gameRooms.map(room => ({
                id: room._id,
                roomId: room.roomId,
                entryFee: room.entryFee,
                winningMultiplier: room.winningMultiplier,
                maxPlayers: room.maxPlayers,
                currentPlayers: room.currentPlayers,
                bigPlayers: room.bigPlayers,
                smallPlayers: room.smallPlayers,
                status: room.status,
                createdAt: room.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Get a specific number game room details
router.get('/room/:roomId', authenticateUser, async (req, res) => {
    try {
        const gameRoom = await NumberGameRoom.findOne({ roomId: req.params.roomId });

        if (!gameRoom) {
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        // Get players in this room
        const players = await NumberGamePlayer.find({ gameRoomId: gameRoom._id })
            .populate('userId', 'name email');

        res.status(200).json({
            success: true,
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                winningMultiplier: gameRoom.winningMultiplier,
                maxPlayers: gameRoom.maxPlayers,
                currentPlayers: gameRoom.currentPlayers,
                bigPlayers: gameRoom.bigPlayers,
                smallPlayers: gameRoom.smallPlayers,
                status: gameRoom.status,
                createdAt: gameRoom.createdAt
            },
            players: players.map(player => ({
                id: player._id,
                user: {
                    id: player.userId._id,
                    name: player.userId.name,
                    email: player.userId.email
                },
                numberType: player.numberType,
                entryAmount: player.entryAmount,
                hasWon: player.hasWon,
                joinedAt: player.joinedAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Join a number game room with amount and prediction
router.post('/room/join', authenticateUser, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { roomId, numberType, entryAmount } = req.body;

        if (!roomId || !numberType || !entryAmount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'Room ID, number type, and entry amount are required' 
            });
        }

        // Validate numberType
        if (!['big', 'small'].includes(numberType)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'Number type must be either "big" or "small"' 
            });
        }

        // Validate entryAmount
        if (isNaN(entryAmount) || entryAmount <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'Entry amount must be a positive number' 
            });
        }

        // Find the game room
        const gameRoom = await NumberGameRoom.findOne({ roomId }).session(session);

        if (!gameRoom) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ 
                success: false, 
                message: 'Game room not found' 
            });
        }

        // Check if the room is still accepting players
        if (gameRoom.status !== 'waiting') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'This game room is no longer accepting players' 
            });
        }

        // Check if the room is full
        if (gameRoom.currentPlayers >= gameRoom.maxPlayers) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'This game room is full' 
            });
        }

        // Check if user has enough balance in game wallet
        const user = await User.findById(req.user._id).session(session);
        
        if (user.wallet.game < entryAmount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient balance in your game wallet. Required: ${entryAmount} Rs. Please transfer funds from normal wallet to game wallet.` 
            });
        }

        // Deduct entry fee from game wallet
        user.wallet.game -= entryAmount;
        await user.save({ session });
        
        // Create transaction record for game wallet
        const gameTransaction = new Transaction({
            userId: user._id,
            type: 'game',
            amount: -entryAmount,
            walletType: 'game',
            description: `Entry amount for number game room ${gameRoom.roomId}`,
            status: 'completed',
            transactionDate: new Date()
        });
        await gameTransaction.save({ session });

        // Create player record with payment details
        const player = new NumberGamePlayer({
            gameRoomId: gameRoom._id,
            userId: user._id,
            numberType,
            entryAmount,
            paymentDetails: {
                gameWalletDeduction: entryAmount,
                totalPaid: entryAmount
            },
            joinedAt: new Date()
        });
        await player.save({ session });

        // Update game room player count
        gameRoom.currentPlayers += 1;
        
        // Update big/small count based on player's choice
        if (numberType === 'big') {
            gameRoom.bigPlayers += 1;
        } else {
            gameRoom.smallPlayers += 1;
        }
        
        // If this is the last player or the room is now full, determine the winner and start the game
        if (gameRoom.currentPlayers === gameRoom.maxPlayers) {
            // Start the game
            gameRoom.status = 'inProgress';
            gameRoom.startTime = new Date();
            
            // Determine the winning type (the side with fewer players wins)
            if (gameRoom.smallPlayers <= gameRoom.bigPlayers) {
                gameRoom.winningType = 'small';
            } else {
                gameRoom.winningType = 'big';
            }
            
            // Find winning players
            const winningPlayers = await NumberGamePlayer.find({ 
                gameRoomId: gameRoom._id,
                numberType: gameRoom.winningType
            }).session(session);
            
            // Distribute winnings to winners
            for (const winningPlayer of winningPlayers) {
                // Update player record
                // Get entry amount
                const entryAmount = winningPlayer.entryAmount;
                // For winning users, they should get an equal amount to their entry fee as winnings
                const winAmount = entryAmount; // Equal amount as entry fee
                
                winningPlayer.hasWon = true;
                winningPlayer.amountWon = winAmount;
                await winningPlayer.save({ session });
                
                // Find the winning user and update their wallets
                const winningUser = await User.findById(winningPlayer.userId).session(session);
                if (winningUser) {
                    // Add the winning amount to game wallet (equal to entry amount)
                    winningUser.wallet.withdrawal += winAmount;
                    
                    // Return the entry fee to normal wallet
                    winningUser.wallet.normal += entryAmount;
                    
                    await winningUser.save({ session });
                    
                    // Create transaction record for winning amount to game wallet
                    const winTransaction = new Transaction({
                        userId: winningUser._id,
                        type: 'recharge',
                        amount: winAmount,
                        walletType: 'withdrawal',
                        description: `Winning amount in number game room ${gameRoom.roomId}`,
                        status: 'completed',
                        transactionDate: new Date()
                    });
                    await winTransaction.save({ session });
                    
                    // Create transaction record for returning entry fee to normal wallet
                    const returnTransaction = new Transaction({
                        userId: winningUser._id,
                        type: 'recharge',
                        amount: entryAmount,
                        walletType: 'normal',
                        description: `Entry fee returned for winning in number game room ${gameRoom.roomId}`,
                        status: 'completed',
                        transactionDate: new Date()
                    });
                    await returnTransaction.save({ session });
                }
            }
            
            // Mark the game as completed
            gameRoom.status = 'completed';
            gameRoom.endTime = new Date();
        }
        
        await gameRoom.save({ session });
        
        await session.commitTransaction();
        session.endSession();
        
        res.status(200).json({
            success: true,
            message: 'Successfully joined the number game room',
            player: {
                id: player._id,
                numberType: player.numberType,
                entryAmount: player.entryAmount,
                paymentDetails: player.paymentDetails
            },
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                winningMultiplier: gameRoom.winningMultiplier,
                maxPlayers: gameRoom.maxPlayers,
                currentPlayers: gameRoom.currentPlayers,
                bigPlayers: gameRoom.bigPlayers,
                smallPlayers: gameRoom.smallPlayers,
                status: gameRoom.status,
                winningType: gameRoom.winningType
            },
            remainingBalance: {
                normal: user.wallet.normal,
                withdrawal: user.wallet.withdrawal,
                game: user.wallet.game
            }
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Get user's number game history
router.get('/history', authenticateUser, async (req, res) => {
    try {
        const gameHistory = await NumberGamePlayer.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .populate('gameRoomId');
        
        res.status(200).json({
            success: true,
            gameHistory: gameHistory.map(game => ({
                id: game._id,
                roomId: game.gameRoomId.roomId,
                numberType: game.numberType,
                entryAmount: game.entryAmount,
                hasWon: game.hasWon,
                paymentDetails: {
                    gameWalletDeduction: game.paymentDetails.gameWalletDeduction,
                    totalPaid: game.paymentDetails.totalPaid
                },
                amountWon: game.amountWon,
                winningType: game.gameRoomId.winningType,
                joinedAt: game.joinedAt,
                gameStatus: game.gameRoomId.status,
                gameEndTime: game.gameRoomId.endTime
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

module.exports = router;
