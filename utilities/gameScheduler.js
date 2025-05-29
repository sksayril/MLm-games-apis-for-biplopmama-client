const cron = require('node-cron');
const mongoose = require('mongoose');
const GameRoom = require('../models/gameRoom.model');
const GamePlayer = require('../models/gamePlayer.model');

let isSchedulerRunning = false;

// Function to reset completed game rooms
async function resetCompletedGameRooms() {
  if (isSchedulerRunning) return;
  
  isSchedulerRunning = true;
  
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    // Find all completed game rooms
    const completedRooms = await GameRoom.find({ status: 'completed' });
    
    if (completedRooms.length > 0) {
      console.log(`Found ${completedRooms.length} completed game rooms to reset`);
      
      for (const gameRoom of completedRooms) {
        // Create a historical record first (handled by the admin endpoint)
        
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
        
        console.log(`Reset game room: ${gameRoom.roomId}`);
      }
      
      await session.commitTransaction();
    }
    
    session.endSession();
  } catch (error) {
    console.error('Error in game room reset scheduler:', error);
    await session.abortTransaction();
    session.endSession();
  } finally {
    isSchedulerRunning = false;
  }
}

// Set up scheduler to run every minute
function startGameRoomResetScheduler() {
  console.log('Starting game room reset scheduler');
  // Schedule to run every minute
  cron.schedule('* * * * *', resetCompletedGameRooms);
  
  // Also run immediately on startup
  resetCompletedGameRooms();
}

module.exports = {
  startGameRoomResetScheduler,
  resetCompletedGameRooms
};
