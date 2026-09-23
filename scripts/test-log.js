import mongoose from 'mongoose';
import dotenv from 'dotenv';
import LogService from '../services/logService.js';
import connectDB from '../config/db.js';
import '../models/User.js'; // Import User model for populate

dotenv.config();

const testLogging = async () => {
    try {
        console.log('🔌 Connecting to database...');
        await connectDB();
        console.log('✅ Connected to database');

        console.log('📝 Attempting to create a test log...');

        // Using valid enums from Log.js
        const logResult = await LogService.createLog({
            type: 'info',
            severity: 'medium',
            category: 'system_event', // Valid category
            module: 'system',         // Valid module
            action: 'TEST_LOGGING',
            message: 'This is a test log to verify the logging system',
            metadata: {
                testId: Date.now(),
                environment: process.env.NODE_ENV
            }
        });

        if (logResult) {
            console.log('✅ Log created successfully!');
            console.log('🆔 Log ID:', logResult._id);
            console.log('📄 Log Content:', JSON.stringify(logResult.toJSON(), null, 2));
        } else {
            console.error('❌ Log creation returned null');
        }

        console.log('🔍 Verifying log persistence...');
        const Log = mongoose.model('Log');
        const savedLog = await Log.findById(logResult._id);

        if (savedLog) {
            console.log('✅ Log found in database!');
        } else {
            console.error('❌ Log NOT found in database!');
        }

        console.log('🔍 Testing LogService.getLogs...');
        const logsResult = await LogService.getLogs({ limit: 10 });
        console.log(`📊 Found ${logsResult.total} logs in total.`);
        console.log(`📋 Retrieved ${logsResult.logs.length} logs.`);

        if (logsResult.logs.length > 0) {
            console.log('First log type:', logsResult.logs[0].type);
            console.log('First log isSystemAction:', logsResult.logs[0].isSystemAction);
        }

    } catch (error) {
        console.error('❌ Error during test:', error);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
};

testLogging();
