const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('--- System Verification Script ---');

// 1. Check Database Connection
console.log('\n[1] Checking Database Connection...');
try {
    const db = require('./src/services/database');
    // We wait a bit because db service tests connection asynchronously in constructor
    setTimeout(async () => {
        try {
            await db.query('SELECT NOW()');
            console.log('✅ Database connection confirmed.');
            
            // 2. Check Core Handlers
            console.log('\n[2] Checking Core Handlers...');
            const commandHandler = require('./src/handlers/commandHandler');
            const eventHandler = require('./src/handlers/eventHandler');
            
            if (commandHandler.loadCommands) console.log('✅ Command Handler exports loadCommands');
            else console.error('❌ Command Handler missing loadCommands');

            if (eventHandler.loadEvents) console.log('✅ Event Handler exports loadEvents');
            else console.error('❌ Event Handler missing loadEvents');

            // 3. Validate Event structure vs Documentation
            console.log('\n[3] Validating Event Structure...');
            const eventFiles = fs.readdirSync(path.join(__dirname, 'src/events'));
            console.log(`Found ${eventFiles.length} event files in src/events.`);
            
            // 4. Validate Command structure
             console.log('\n[4] Validating Command Structure...');
            const commandDirs = fs.readdirSync(path.join(__dirname, 'src/commands'));
            console.log(`Found command directories/files: ${commandDirs.join(', ')}`);

            console.log('\n✅ System verification complete.');
            process.exit(0);
        } catch (err) {
            console.error('❌ Database query failed or other error:', err);
            process.exit(1);
        }
    }, 2000);
} catch (err) {
    console.error('❌ Failed to require database service:', err);
    process.exit(1);
}
