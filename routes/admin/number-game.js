const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const NumberGameRoom = require('../../models/numberGameRoom.model');
const NumberGamePlayer = require('../../models/numberGamePlayer.model');
const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');
const { authenticateAdmin } = require('../../middleware/auth');

// Get all number game rooms (for admin)
router.get('/rooms', authenticateAdmin, async (req, res) => {
    try {
        // Admins can see all rooms regardless of status
        const gameRooms = await NumberGameRoom.find()
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
                winningType: room.winningType,
                startTime: room.startTime,
                endTime: room.endTime,
                createdAt: room.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Create a new number game room (admin only)
router.post('/room/create', authenticateAdmin, async (req, res) => {
    try {
        const { entryFee, winningMultiplier, maxPlayers } = req.body;

        // Validation
        if (!entryFee || isNaN(entryFee) || entryFee <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Entry fee must be a positive number' 
            });
        }

        if (maxPlayers && (isNaN(maxPlayers) || maxPlayers <= 1 || maxPlayers > 50)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Max players must be a number between 2 and 50' 
            });
        }

        if (winningMultiplier && (isNaN(winningMultiplier) || winningMultiplier <= 0)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Winning multiplier must be a positive number' 
            });
        }

        // Create a new game room
        const gameRoom = new NumberGameRoom({
            entryFee,
            winningMultiplier: winningMultiplier || 2,
            maxPlayers: maxPlayers || 10,
            createdBy: req.admin._id,
            status: 'waiting'
        });

        await gameRoom.save();

        res.status(201).json({
            success: true,
            message: 'Number game room created successfully',
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                winningMultiplier: gameRoom.winningMultiplier,
                maxPlayers: gameRoom.maxPlayers,
                status: gameRoom.status,
                createdAt: gameRoom.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Get detailed game room info with players (admin only)
router.get('/room/:roomId/details', authenticateAdmin, async (req, res) => {
    try {
        const gameRoom = await NumberGameRoom.findOne({ roomId: req.params.roomId });

        if (!gameRoom) {
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        // Get all players in this room
        const players = await NumberGamePlayer.find({ gameRoomId: gameRoom._id })
            .populate('userId', 'name email wallet');

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
                winningType: gameRoom.winningType,
                startTime: gameRoom.startTime,
                endTime: gameRoom.endTime,
                createdAt: gameRoom.createdAt
            },
            players: players.map(player => ({
                id: player._id,
                user: {
                    id: player.userId._id,
                    name: player.userId.name,
                    email: player.userId.email,
                    wallet: player.userId.wallet
                },
                numberType: player.numberType,
                entryAmount: player.entryAmount,
                hasWon: player.hasWon,
                amountWon: player.amountWon,
                joinedAt: player.joinedAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Close a game room manually (admin only)
router.post('/room/:roomId/close', authenticateAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const gameRoom = await NumberGameRoom.findOne({ roomId: req.params.roomId }).session(session);

        if (!gameRoom) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        if (gameRoom.status === 'completed') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Game room is already completed' });
        }

        // Force the game to complete
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
            // Calculate the winning amount
            const winAmount = winningPlayer.entryAmount * gameRoom.winningMultiplier;
            
            // Update player record
            winningPlayer.hasWon = true;
            winningPlayer.amountWon = winAmount;
            await winningPlayer.save({ session });
            
            // Find the winning user and update their wallets
            const winningUser = await User.findById(winningPlayer.userId).session(session);
            if (winningUser) {
                // Add winnings to game wallet
                winningUser.wallet.game += winAmount;
                
                // Return the entry amount to normal wallet
                const entryAmount = winningPlayer.entryAmount;
                winningUser.wallet.normal += entryAmount;
                
                await winningUser.save({ session });
                
                // Create transaction record for winning amount
                const winTransaction = new Transaction({
                    userId: winningUser._id,
                    type: 'recharge',
                    amount: winAmount,
                    walletType: 'game',
                    description: `Won in number game room ${gameRoom.roomId}`,
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
        await gameRoom.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Game room closed successfully',
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                status: gameRoom.status,
                winningType: gameRoom.winningType,
                winningPlayers: winningPlayers.length,
                endTime: gameRoom.endTime
            }
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Update game room settings (admin only)
router.put('/room/:roomId', authenticateAdmin, async (req, res) => {
    try {
        const { entryFee, winningMultiplier, maxPlayers } = req.body;
        const gameRoom = await NumberGameRoom.findOne({ roomId: req.params.roomId });

        if (!gameRoom) {
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        // Can only update if the room is still in waiting state
        if (gameRoom.status !== 'waiting') {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot update a game room that has already started or completed' 
            });
        }

        // Update the fields if provided
        if (entryFee && !isNaN(entryFee) && entryFee > 0) {
            gameRoom.entryFee = entryFee;
        }

        if (winningMultiplier && !isNaN(winningMultiplier) && winningMultiplier > 0) {
            gameRoom.winningMultiplier = winningMultiplier;
        }

        if (maxPlayers && !isNaN(maxPlayers) && maxPlayers > 1 && maxPlayers <= 50) {
            // Only allow decreasing if it's not below current player count
            if (maxPlayers < gameRoom.maxPlayers && maxPlayers < gameRoom.currentPlayers) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Cannot decrease max players below current player count of ${gameRoom.currentPlayers}` 
                });
            }
            gameRoom.maxPlayers = maxPlayers;
        }

        await gameRoom.save();

        res.status(200).json({
            success: true,
            message: 'Game room updated successfully',
            gameRoom: {
                id: gameRoom._id,
                roomId: gameRoom.roomId,
                entryFee: gameRoom.entryFee,
                winningMultiplier: gameRoom.winningMultiplier,
                maxPlayers: gameRoom.maxPlayers,
                currentPlayers: gameRoom.currentPlayers,
                status: gameRoom.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Delete a game room (admin only, only if no players have joined)
router.delete('/room/:roomId', authenticateAdmin, async (req, res) => {
    try {
        const gameRoom = await NumberGameRoom.findOne({ roomId: req.params.roomId });

        if (!gameRoom) {
            return res.status(404).json({ success: false, message: 'Game room not found' });
        }

        // Check if there are any players in the room
        if (gameRoom.currentPlayers > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete a game room that has players in it' 
            });
        }

        await NumberGameRoom.deleteOne({ _id: gameRoom._id });

        res.status(200).json({
            success: true,
            message: 'Game room deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

module.exports = router;
