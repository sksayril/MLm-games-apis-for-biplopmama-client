const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

const GameRoom = require('../models/gameRoom.model');
const GamePlayer = require('../models/gamePlayer.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const { authenticateUser } = require('../middleware/auth');

// Get available game rooms for users
router.get('/rooms', authenticateUser, async (req, res) => {
    try {
        // Only show waiting rooms to regular users
        const gameRooms = await GameRoom.find({ status: 'waiting' })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            gameRooms: gameRooms.map(room => ({
                id: room._id,
                roomId: room.roomId,
                entryFee: room.entryFee,
                benefitFeeMultiplier: room.benefitFeeMultiplier,
                winningAmount: room.winningAmount,
                maxPlayers: room.maxPlayers,
                currentPlayers: room.currentPlayers,
                availableColors: room.availableColors,
                status: room.status,
                createdAt: room.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Get a specific game room details
router.get('/room/:roomId', authenticateUser, async (req, res) => {
    try {
        const gameRoom = await GameRoom.findOne({ roomId: req.params.roomId });

        if (!gameRoom) {
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        // Get players in this room
        const players = await GamePlayer.find({ gameRoomId: gameRoom._id })
            .populate('userId', 'name email');

        // Count players by color
        const colorCounts = {};
        gameRoom.availableColors.forEach(color => {
            colorCounts[color] = players.filter(p => p.colorSelected === color).length;
        });

        res.status(200).json({
            success: true,
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                benefitFeeMultiplier: gameRoom.benefitFeeMultiplier,
                winningAmount: gameRoom.winningAmount,
                maxPlayers: gameRoom.maxPlayers,
                currentPlayers: gameRoom.currentPlayers,
                availableColors: gameRoom.availableColors,
                colorCounts,
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
                colorSelected: player.colorSelected,
                hasWon: player.hasWon,
                joinedAt: player.joinedAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Join a game room with color selection
router.post('/room/join', authenticateUser, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { roomId, colorSelected } = req.body;

        if (!roomId || !colorSelected) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'Room ID and color selection are required' 
            });
        }

        // Find the game room
        const gameRoom = await GameRoom.findOne({ roomId }).session(session);

        if (!gameRoom) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        // Validate color selection against available colors in this room
        if (!gameRoom.availableColors.includes(colorSelected)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: `Invalid color selection. Available colors for this room are: ${gameRoom.availableColors.join(', ')}` 
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

        // We are allowing multiple joins by the same user now
        // This is intentional to let users join the same room multiple times

        // Calculate fees for both wallets
        const normalFee = gameRoom.entryFee;
        const benefitFee = normalFee * gameRoom.benefitFeeMultiplier;

        // Check if user has enough balance in both wallets
        const user = await User.findById(req.user._id).session(session);
        
        if (user.wallet.normal < normalFee) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient balance in your normal wallet. Required: ${normalFee} Rs` 
            });
        }

        if (user.wallet.benefit < benefitFee) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient balance in your benefit wallet. Required: ${benefitFee} Rs` 
            });
        }

        // Deduct entry fee from both wallets
        user.wallet.normal -= normalFee;
        user.wallet.benefit -= benefitFee;
        await user.save({ session });

        // Create transaction records for both wallets
        const normalTransaction = new Transaction({
            userId: user._id,
            type: 'withdrawal',
            amount: normalFee,
            walletType: 'normal',
            description: `Entry fee for game room ${gameRoom.roomId}`,
            status: 'completed'
        });
        await normalTransaction.save({ session });

        const benefitTransaction = new Transaction({
            userId: user._id,
            type: 'withdrawal',
            amount: benefitFee,
            walletType: 'benefit',
            description: `Entry fee (benefit wallet) for game room ${gameRoom.roomId}`,
            status: 'completed'
        });
        await benefitTransaction.save({ session });

        // Create player record with payment details
        const player = new GamePlayer({
            gameRoomId: gameRoom._id,
            userId: user._id,
            colorSelected,
            paymentDetails: {
                normalWalletDeduction: normalFee,
                benefitWalletDeduction: benefitFee,
                totalPaid: normalFee + benefitFee
            }
        });
        await player.save({ session });

        // Update game room player count and color counts
        gameRoom.currentPlayers += 1;
        gameRoom.colorCounts[colorSelected] += 1;
        
        // If this is the last player or the room is now full, determine the winner
        if (gameRoom.currentPlayers === gameRoom.maxPlayers) {
            // Determine the winning color (the one with minimum count)
            let minCount = Number.MAX_SAFE_INTEGER;
            let winningColor = null;
            let zeroCountColors = [];
            
            // First, check if any colors have 0 players (these should win)
            for (const color of gameRoom.availableColors) {
                if (gameRoom.colorCounts[color] === 0) {
                    zeroCountColors.push(color);
                }
            }
            
            // If there are colors with 0 players, randomly select one as the winner
            if (zeroCountColors.length > 0) {
                // Pick a random color from the zero count colors
                const randomIndex = Math.floor(Math.random() * zeroCountColors.length);
                winningColor = zeroCountColors[randomIndex];
            } else {
                // If all colors have players, find the color with minimum players
                for (const color of gameRoom.availableColors) {
                    if (gameRoom.colorCounts[color] < minCount && gameRoom.colorCounts[color] > 0) {
                        minCount = gameRoom.colorCounts[color];
                        winningColor = color;
                    }
                }
                
                // If still no winner found (unlikely but as a fallback)
                if (!winningColor) {
                    winningColor = gameRoom.availableColors[0];
                }
            }
            
            // Set the winning color
            gameRoom.winningColor = winningColor;
            gameRoom.status = 'completed';
            gameRoom.endTime = new Date();
            
            // Mark all players as not winners first
            const allPlayers = await GamePlayer.find({
                gameRoomId: gameRoom._id
            }).session(session);
            
            for (const player of allPlayers) {
                player.hasWon = false;
                player.amountWon = 0;
                await player.save({ session });
            }
            
            // In case the winning color has players (which shouldn't happen with our new logic),
            // we would find them here. But since we prioritize colors with 0 players,
            // this list should be empty most of the time.
            const winningPlayers = await GamePlayer.find({ 
                gameRoomId: gameRoom._id,
                colorSelected: winningColor
            }).session(session);
            
            // Distribute winnings if there are any winning players
            // (which should be rare since we prefer colors with 0 players)
            if (winningPlayers.length > 0) {
                for (const winningPlayer of winningPlayers) {
                    // Update player record
                    winningPlayer.hasWon = true;
                    winningPlayer.amountWon = gameRoom.winningAmount;
                    await winningPlayer.save({ session });
                    
                    // Find the winning user and update their wallet
                    const winningUser = await User.findById(winningPlayer.userId).session(session);
                    if (winningUser) {
                        winningUser.wallet.normal += gameRoom.winningAmount;
                        await winningUser.save({ session });
                        
                        // Create transaction record for winning amount
                        const winTransaction = new Transaction({
                            userId: winningUser._id,
                            type: 'recharge',
                            amount: gameRoom.winningAmount,
                            walletType: 'normal',
                            description: `Won in game room ${gameRoom.roomId}`,
                            status: 'completed'
                        });
                        await winTransaction.save({ session });
                    }
                }
            }
        }
        
        await gameRoom.save({ session });
        
        await session.commitTransaction();
        session.endSession();
        
        res.status(200).json({
            success: true,
            message: 'Successfully joined the game room',
            player: {
                id: player._id,
                colorSelected: player.colorSelected,
                paymentDetails: player.paymentDetails
            },
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                benefitFeeMultiplier: gameRoom.benefitFeeMultiplier,
                winningAmount: gameRoom.winningAmount,
                maxPlayers: gameRoom.maxPlayers,
                currentPlayers: gameRoom.currentPlayers,
                availableColors: gameRoom.availableColors,
                colorCounts: gameRoom.colorCounts,
                status: gameRoom.status
            },
            remainingBalance: {
                normal: user.wallet.normal,
                benefit: user.wallet.benefit
            }
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Get user's game history
router.get('/history', authenticateUser, async (req, res) => {
    try {
        const gameHistory = await GamePlayer.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .populate('gameRoomId');
        
        res.status(200).json({
            success: true,
            gameHistory: gameHistory.map(game => ({
                id: game._id,
                roomId: game.gameRoomId.roomId,
                colorSelected: game.colorSelected,
                hasWon: game.hasWon,
                paymentDetails: {
                    normalWalletDeduction: game.paymentDetails.normalWalletDeduction,
                    benefitWalletDeduction: game.paymentDetails.benefitWalletDeduction,
                    totalPaid: game.paymentDetails.totalPaid
                },
                amountWon: game.amountWon,
                winningColor: game.gameRoomId.winningColor,
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
