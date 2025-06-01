const cron = require('node-cron');
const mongoose = require('mongoose');
const GameRoom = require('../models/gameRoom.model');
const GamePlayer = require('../models/gamePlayer.model');
const NumberGameRoom = require('../models/numberGameRoom.model');
const NumberGamePlayer = require('../models/numberGamePlayer.model');

let isColorGameSchedulerRunning = false;
let isNumberGameSchedulerRunning = false;

// Function to reset completed color game rooms
async function resetCompletedColorGameRooms() {
  if (isColorGameSchedulerRunning) return;
  
  isColorGameSchedulerRunning = true;
  let session;
  
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    
    // Find all completed color game rooms
    const completedRooms = await GameRoom.find({ status: 'completed' });
    
    if (completedRooms.length > 0) {
      console.log(`Found ${completedRooms.length} completed color game rooms to reset`);
      
      for (const gameRoom of completedRooms) {
        // Reset the game room
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
        
        // Remove player associations completely from this room
        // This is important to allow the same players to rejoin after reset
        await GamePlayer.deleteMany(
          { gameRoomId: gameRoom._id },
          { session }
        );
        
        console.log(`Reset color game room: ${gameRoom.roomId}`);
      }
      
      await session.commitTransaction();
    } else {
      await session.abortTransaction();
    }
    
    session.endSession();
  } catch (error) {
    console.error('Error in color game room reset scheduler:', error);
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
  } finally {
    isColorGameSchedulerRunning = false;
  }
}

// Function to reset completed number game rooms
async function resetCompletedNumberGameRooms() {
  if (isNumberGameSchedulerRunning) return;
  
  isNumberGameSchedulerRunning = true;
  let session;
  
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    
    // Find all completed number game rooms that ended at least 1 minute ago
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const completedRooms = await NumberGameRoom.find({ 
      status: 'completed',
      endTime: { $lte: oneMinuteAgo }
    });
    
    if (completedRooms.length > 0) {
      console.log(`Found ${completedRooms.length} completed number game rooms to reset`);
      
      for (const gameRoom of completedRooms) {
        // Reset the game room
        gameRoom.status = 'waiting';
        gameRoom.currentPlayers = 0;
        gameRoom.bigPlayers = 0;
        gameRoom.smallPlayers = 0;
        gameRoom.winningType = null;
        gameRoom.startTime = undefined;
        gameRoom.endTime = undefined;
        
        await gameRoom.save({ session });
        
        // Remove player associations completely from this room
        // This is important to allow the same players to rejoin after reset
        await NumberGamePlayer.deleteMany(
          { gameRoomId: gameRoom._id },
          { session }
        );
        
        console.log(`Reset number game room: ${gameRoom.roomId}`);
      }
      
      await session.commitTransaction();
    } else {
      await session.abortTransaction();
    }
    
    session.endSession();
  } catch (error) {
    console.error('Error in number game room reset scheduler:', error);
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
  } finally {
    isNumberGameSchedulerRunning = false;
  }
}

// Set up scheduler to run every minute
function startGameRoomResetScheduler() {
  console.log('Starting game room reset schedulers');
  
  // Schedule color game reset to run every minute
  cron.schedule('* * * * *', resetCompletedColorGameRooms);
  
  // Schedule number game reset to run every minute
  cron.schedule('* * * * *', resetCompletedNumberGameRooms);
  
  // Also run immediately on startup
  resetCompletedColorGameRooms();
  resetCompletedNumberGameRooms();
}

module.exports = {
  startGameRoomResetScheduler,
  resetCompletedColorGameRooms,
  resetCompletedNumberGameRooms
};
