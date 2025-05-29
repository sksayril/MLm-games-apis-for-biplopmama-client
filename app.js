require("dotenv").config()
require("./utilities/database")
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');

// Import routes
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const adminRouter = require('./routes/admin');
const gameRouter = require('./routes/game');
const adminGameRouter = require('./routes/admin-game');

// Import and start the scheduler for daily wallet growth
const { startDailyGrowthScheduler } = require('./utilities/scheduler');
startDailyGrowthScheduler();

// Import and start the scheduler for game room resets
const { startGameRoomResetScheduler } = require('./utilities/gameScheduler');
startGameRoomResetScheduler();

const app = express();

// Enable CORS for all routes
app.use(cors());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/', indexRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/game', gameRouter);
app.use('/api/admin/game', adminGameRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
