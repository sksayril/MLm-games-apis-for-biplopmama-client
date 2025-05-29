// Script to drop the unique index from the gamePlayer collection
require('dotenv').config();
const mongoose = require('mongoose');
const dbUrl = process.env.DATABASE_URL || 'mongodb://localhost:27017/gamemlm';

async function dropUniqueIndex() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(dbUrl);
    console.log('Connected to database');
    
    console.log('Dropping unique index on gamePlayer collection...');
    // This will drop the unique index and replace it with a regular index
    await mongoose.connection.db.collection('gameplayers').dropIndex('gameRoomId_1_userId_1');
    console.log('Successfully dropped unique index');
    
    // Create a new non-unique index for performance
    await mongoose.connection.db.collection('gameplayers').createIndex(
      { gameRoomId: 1, userId: 1 }, 
      { unique: false }
    );
    console.log('Created new non-unique index');
    
    console.log('Index operation completed successfully');
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('index not found')) {
      console.log('The index might have already been dropped or does not exist');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

dropUniqueIndex();
