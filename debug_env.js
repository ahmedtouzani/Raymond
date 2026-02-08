const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const aiChatUsageHourly = require('./src/database/aiChatUsageHourly');

async function debug() {
    console.log('--- ENV DEBUG ---');
    console.log('AI_HOURLY_LIMIT_WHITELISTED:', process.env.AI_HOURLY_LIMIT_WHITELISTED);
    console.log('AI_HOURLY_LIMIT_REGULAR:', process.env.AI_HOURLY_LIMIT_REGULAR);
    console.log('Parsed Whitelisted:', Number(process.env.AI_HOURLY_LIMIT_WHITELISTED || 6));
    console.log('Parsed Regular:', Number(process.env.AI_HOURLY_LIMIT_REGULAR || 3));

    // Simulate check for a mock user
    const limit = await aiChatUsageHourly.getRateLimitForUser('123456789', '987654321');
    console.log('Rate Limit for random user:', limit);
}

debug();
