const cron = require('node-cron');
const mongoose = require('mongoose');
const { 
    processDailyProfitSharing, 
    processLevelBasedProfitSharing,
    buildMLMAncestorChain 
} = require('./mlm30Handler');

/**
 * MLM Scheduler for 30-Level System
 * Handles both daily profit sharing and level-based profit sharing
 */

class MLMScheduler {
    constructor() {
        this.isRunning = false;
        this.dailyJob = null;
        this.levelBasedJob = null;
        this.lastDailyRun = null;
        this.lastLevelBasedRun = null;
    }

    /**
     * Start the MLM schedulers
     */
    start() {
        if (this.isRunning) {
            console.log('MLM Scheduler is already running');
            return;
        }

        console.log('Starting MLM Scheduler...');

        // Daily profit sharing scheduler - runs every day at 12:00 AM
        this.dailyJob = cron.schedule('0 0 * * *', async () => {
            console.log('Starting daily profit sharing process...');
            this.lastDailyRun = new Date();
            
            try {
                const result = await processDailyProfitSharing();
                if (result.success) {
                    console.log('Daily profit sharing completed successfully:', {
                        totalUsers: result.totalUsers,
                        distributions: result.distributions.length
                    });
                } else {
                    console.error('Daily profit sharing failed:', result.message);
                }
            } catch (error) {
                console.error('Error in daily profit sharing scheduler:', error);
            }
        }, {
            scheduled: false,
            timezone: "Asia/Dhaka" // Adjust timezone as needed
        });

        // Level-based profit sharing scheduler - runs every day at 1:00 AM
        this.levelBasedJob = cron.schedule('0 1 * * *', async () => {
            console.log('Starting level-based profit sharing process...');
            this.lastLevelBasedRun = new Date();
            
            try {
                const result = await processLevelBasedProfitSharing();
                if (result.success) {
                    console.log('Level-based profit sharing completed successfully:', {
                        totalUsers: result.totalUsers,
                        distributions: result.distributions.length
                    });
                } else {
                    console.error('Level-based profit sharing failed:', result.message);
                }
            } catch (error) {
                console.error('Error in level-based profit sharing scheduler:', error);
            }
        }, {
            scheduled: false,
            timezone: "Asia/Dhaka" // Adjust timezone as needed
        });

        // Start both jobs
        this.dailyJob.start();
        this.levelBasedJob.start();
        
        this.isRunning = true;
        console.log('MLM Scheduler started successfully');
        console.log('Daily profit sharing: Every day at 12:00 AM');
        console.log('Level-based profit sharing: Every day at 1:00 AM');
    }

    /**
     * Stop the MLM schedulers
     */
    stop() {
        if (!this.isRunning) {
            console.log('MLM Scheduler is not running');
            return;
        }

        console.log('Stopping MLM Scheduler...');

        if (this.dailyJob) {
            this.dailyJob.stop();
            this.dailyJob = null;
        }

        if (this.levelBasedJob) {
            this.levelBasedJob.stop();
            this.levelBasedJob = null;
        }

        this.isRunning = false;
        console.log('MLM Scheduler stopped successfully');
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastDailyRun: this.lastDailyRun,
            lastLevelBasedRun: this.lastLevelBasedRun,
            nextDailyRun: this.dailyJob ? this.dailyJob.nextDate() : null,
            nextLevelBasedRun: this.levelBasedJob ? this.levelBasedJob.nextDate() : null
        };
    }

    /**
     * Run daily profit sharing manually
     */
    async runDailyProfitSharingNow() {
        console.log('Running daily profit sharing manually...');
        this.lastDailyRun = new Date();
        
        try {
            const result = await processDailyProfitSharing();
            console.log('Manual daily profit sharing result:', result);
            return result;
        } catch (error) {
            console.error('Error in manual daily profit sharing:', error);
            return { success: false, message: 'Error in manual daily profit sharing', error: error.message };
        }
    }

    /**
     * Run level-based profit sharing manually
     */
    async runLevelBasedProfitSharingNow() {
        console.log('Running level-based profit sharing manually...');
        this.lastLevelBasedRun = new Date();
        
        try {
            const result = await processLevelBasedProfitSharing();
            console.log('Manual level-based profit sharing result:', result);
            return result;
        } catch (error) {
            console.error('Error in manual level-based profit sharing:', error);
            return { success: false, message: 'Error in manual level-based profit sharing', error: error.message };
        }
    }

    /**
     * Rebuild MLM ancestor chains for all users
     */
    async rebuildAllMLMChains() {
        console.log('Rebuilding MLM ancestor chains for all users...');
        
        try {
            const User = require('../models/user.model');
            const users = await User.find({}).select('_id name');
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const user of users) {
                try {
                    const result = await buildMLMAncestorChain(user._id);
                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        console.error(`Failed to build chain for user ${user.name}:`, result.message);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`Error building chain for user ${user.name}:`, error.message);
                }
            }
            
            console.log(`MLM chain rebuild completed: ${successCount} success, ${errorCount} errors`);
            return {
                success: true,
                message: 'MLM chain rebuild completed',
                successCount,
                errorCount
            };
        } catch (error) {
            console.error('Error rebuilding MLM chains:', error);
            return {
                success: false,
                message: 'Error rebuilding MLM chains',
                error: error.message
            };
        }
    }
}

// Create singleton instance
const mlmScheduler = new MLMScheduler();

module.exports = mlmScheduler;
