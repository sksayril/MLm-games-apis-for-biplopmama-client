const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

const GameRoom = require('../models/gameRoom.model');
const GamePlayer = require('../models/gamePlayer.model');
const { authenticateAdmin } = require('../middleware/auth');

// Generate unique room ID
const generateRoomId = () => {
    return 'ROOM' + crypto.randomBytes(3).toString('hex').toUpperCase();
};

// Admin: Create a new game room with specific color configuration
router.post('/room/create', authenticateAdmin, async (req, res) => {
    try {
        const { 
            entryFee, 
            benefitFeeMultiplier,
            winningAmount, 
            maxPlayers,
            availableColors 
        } = req.body;
        
        // Validate colors if provided
        if (availableColors && availableColors.length > 0) {
            const validColors = ['red', 'green', 'blue', 'yellow'];
            for (const color of availableColors) {
                if (!validColors.includes(color)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid color: ${color}. Valid colors are: red, green, blue, yellow`
                    });
                }
            }
            
            // Ensure at least 2 colors are selected
            if (availableColors.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'At least 2 colors must be available for a game room'
                });
            }
        }

        // Create a new game room with custom configuration
        const gameRoom = new GameRoom({
            roomId: generateRoomId(),
            entryFee: entryFee || 50,
            benefitFeeMultiplier: benefitFeeMultiplier || 2,
            winningAmount: winningAmount || 100,
            maxPlayers: maxPlayers || 20,
            availableColors: availableColors || ['red', 'green', 'blue', 'yellow'],
            status: 'waiting',
            currentPlayers: 0,
            createdBy: req.admin._id
        });

        await gameRoom.save();

        res.status(201).json({
            success: true,
            message: 'Game room created successfully',
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                benefitFeeMultiplier: gameRoom.benefitFeeMultiplier,
                winningAmount: gameRoom.winningAmount,
                maxPlayers: gameRoom.maxPlayers,
                availableColors: gameRoom.availableColors,
                status: gameRoom.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Admin: Get all game rooms (including completed ones)
router.get('/rooms', authenticateAdmin, async (req, res) => {
    try {
        const gameRooms = await GameRoom.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: gameRooms.length,
            gameRooms: gameRooms.map(room => ({
                id: room._id,
                roomId: room.roomId,
                entryFee: room.entryFee,
                benefitFeeMultiplier: room.benefitFeeMultiplier,
                winningAmount: room.winningAmount,
                maxPlayers: room.maxPlayers,
                currentPlayers: room.currentPlayers,
                availableColors: room.availableColors,
                colorCounts: room.colorCounts,
                winningColor: room.winningColor,
                status: room.status,
                createdAt: room.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Admin: Get detailed statistics for a game room
router.get('/room/:roomId/stats', authenticateAdmin, async (req, res) => {
    try {
        const gameRoom = await GameRoom.findOne({ roomId: req.params.roomId });

        if (!gameRoom) {
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        // Get all players in this room with user details
        const players = await GamePlayer.find({ gameRoomId: gameRoom._id })
            .populate('userId', 'name email wallet');

        // Calculate statistics
        const colorStats = {
            red: { count: 0, players: [] },
            green: { count: 0, players: [] },
            blue: { count: 0, players: [] },
            yellow: { count: 0, players: [] }
        };

        let totalNormalDeducted = 0;
        let totalBenefitDeducted = 0;
        let totalPaid = 0;
        let totalWon = 0;

        players.forEach(player => {
            if (colorStats[player.colorSelected]) {
                colorStats[player.colorSelected].count++;
                colorStats[player.colorSelected].players.push({
                    id: player.userId._id,
                    name: player.userId.name,
                    email: player.userId.email,
                    hasWon: player.hasWon
                });
            }

            totalNormalDeducted += player.paymentDetails.normalWalletDeduction;
            totalBenefitDeducted += player.paymentDetails.benefitWalletDeduction;
            totalPaid += player.paymentDetails.totalPaid;
            totalWon += player.amountWon;
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
                colorCounts: gameRoom.colorCounts,
                winningColor: gameRoom.winningColor,
                status: gameRoom.status,
                createdAt: gameRoom.createdAt
            },
            statistics: {
                colorStats,
                totalNormalDeducted,
                totalBenefitDeducted,
                totalPaid,
                totalWon,
                profit: totalPaid - totalWon
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Admin: Close a game room and force determine winner
router.post('/room/:roomId/close', authenticateAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const gameRoom = await GameRoom.findOne({ roomId: req.params.roomId }).session(session);

        if (!gameRoom) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        if (gameRoom.status === 'completed') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Game room already completed' });
        }

        // Get all players in this room
        const players = await GamePlayer.find({ gameRoomId: gameRoom._id }).session(session);

        if (players.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'No players in this game room' });
        }

        // Count players by color
        const colorCounts = {
            red: 0,
            green: 0,
            blue: 0,
            yellow: 0
        };

        players.forEach(player => {
            if (colorCounts[player.colorSelected] !== undefined) {
                colorCounts[player.colorSelected]++;
            }
        });

        // Save color counts to game room
        gameRoom.colorCounts = colorCounts;

        // Determine winning color (color with minimum count)
        let minCount = Number.MAX_SAFE_INTEGER;
        let winningColor = null;
        let zeroCountColors = [];
        
        // First, check if any colors have 0 players (these should win)
        for (const color of gameRoom.availableColors) {
            if (colorCounts[color] === 0) {
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
                if (colorCounts[color] < minCount && colorCounts[color] > 0) {
                    minCount = colorCounts[color];
                    winningColor = color;
                }
            }
            
            // If still no winner found (unlikely but as a fallback)
            if (!winningColor) {
                winningColor = gameRoom.availableColors[0];
            }
        }

        gameRoom.winningColor = winningColor;
        gameRoom.status = 'completed';
        gameRoom.endTime = new Date();

        await gameRoom.save({ session });

        // First mark all players as non-winners
        for (const player of players) {
            player.hasWon = false;
            player.amountWon = 0;
            await player.save({ session });
        }

        // Find all players who selected the winning color (should be none in most cases)
        const winningPlayers = players.filter(player => player.colorSelected === winningColor);

        // Set winning players
        if (winningPlayers.length > 0) {
            const User = require('../models/user.model');
            const Transaction = require('../models/transaction.model');
            
            for (const player of winningPlayers) {
                player.hasWon = true;
                player.amountWon = gameRoom.winningAmount;
                await player.save({ session });

                // Find the winning user and update their wallet
                const winningUser = await User.findById(player.userId).session(session);
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

        // Create a copy of the completed game data for historical records
        const gameHistory = new GameRoom({
            roomId: generateRoomId(), // New ID for the history record
            status: 'completed',
            entryFee: gameRoom.entryFee,
            benefitFeeMultiplier: gameRoom.benefitFeeMultiplier,
            winningAmount: gameRoom.winningAmount,
            maxPlayers: gameRoom.maxPlayers,
            currentPlayers: gameRoom.currentPlayers,
            availableColors: gameRoom.availableColors,
            winningColor: winningColor,
            colorCounts: colorCounts,
            createdBy: gameRoom.createdBy,
            startTime: gameRoom.startTime,
            endTime: new Date(),
            createdAt: gameRoom.createdAt
        });
        
        await gameHistory.save({ session });
        
        // Reset the current game room for new players
        gameRoom.status = 'waiting';
        gameRoom.currentPlayers = 0;
        gameRoom.winningColor = undefined;
        gameRoom.colorCounts = {
            red: 0,
            green: 0,
            blue: 0,
            yellow: 0
        };
        gameRoom.startTime = undefined;
        gameRoom.endTime = undefined;
        
        await gameRoom.save({ session });
        
        // Keep the game player records for history but remove the association with the reset game room
        // This is better than deleting them as it preserves the game history
        
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Game room closed and automatically reset for new players',
            gameResults: {
                id: gameHistory._id,
                roomId: gameHistory.roomId,  // This is the history record ID
                originalRoomId: gameRoom.roomId,  // This is the original room ID that was reset
                winningColor,
                colorCounts,
                status: 'completed'
            },
            newGameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                benefitFeeMultiplier: gameRoom.benefitFeeMultiplier,
                winningAmount: gameRoom.winningAmount,
                maxPlayers: gameRoom.maxPlayers,
                currentPlayers: 0,
                availableColors: gameRoom.availableColors,
                status: 'waiting'
            }
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Admin: Reset a completed game room for new players
router.post('/room/:roomId/reset', authenticateAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const gameRoom = await GameRoom.findOne({ roomId: req.params.roomId }).session(session);
        
        if (!gameRoom) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }
        
        if (gameRoom.status !== 'completed') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'Only completed game rooms can be reset. Current status: ' + gameRoom.status 
            });
        }
        
        // Reset game room to waiting state
        gameRoom.status = 'waiting';
        gameRoom.currentPlayers = 0;
        gameRoom.winningColor = undefined;
        gameRoom.colorCounts = {
            red: 0,
            green: 0,
            blue: 0,
            yellow: 0
        };
        gameRoom.startTime = undefined;
        gameRoom.endTime = undefined;
        
        await gameRoom.save({ session });
        
        // Remove all players from this game room
        await GamePlayer.deleteMany({ gameRoomId: gameRoom._id }).session(session);
        
        await session.commitTransaction();
        session.endSession();
        
        res.status(200).json({
            success: true,
            message: 'Game room reset successfully and ready for new players',
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                benefitFeeMultiplier: gameRoom.benefitFeeMultiplier,
                winningAmount: gameRoom.winningAmount,
                maxPlayers: gameRoom.maxPlayers,
                currentPlayers: 0,
                availableColors: gameRoom.availableColors,
                status: 'waiting'
            }
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

module.exports = router;
