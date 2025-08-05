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
const numberGameRouter = require('./routes/number-game');
const withdrawalRouter = require('./routes/withdrawal');
const adminGameRouter = require('./routes/admin-game');
const mlmRouter = require('./routes/mlm');
const adminNumberGameRouter = require('./routes/admin/number-game');
const adminDashboardRouter = require('./routes/admin/dashboard');

// Import and start the scheduler for daily wallet growth
const { startDailyGrowthScheduler } = require('./utilities/scheduler');
startDailyGrowthScheduler(); // Run immediately for testing

// Import and start the scheduler for game room resets
const { startGameRoomResetScheduler } = require('./utilities/gameScheduler');
startGameRoomResetScheduler();

const app = express();

// Enable CORS for all routes with detailed configuration
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
app.use('/api/number-game', numberGameRouter);
app.use('/api/withdrawal', withdrawalRouter);
app.use('/api/admin/game', adminGameRouter);
app.use('/api/mlm', mlmRouter);
app.use('/api/admin/number-game', adminNumberGameRouter);
app.use('/api/admin/dashboard', adminDashboardRouter);

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
