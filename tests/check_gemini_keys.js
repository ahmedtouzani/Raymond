/**
 * Diagnostic: Check status of all Gemini API keys
 */
async function checkKeyStatus() {
    console.log('\n🔍 Gemini API Key Status Check\n');
    console.log('='.repeat(50));

    const keys = [];
    for (let i = 1; i <= 10; i++) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key && key.trim()) {
            keys.push({ index: i, key: key.trim() });
        }
    }

    console.log(`Total keys loaded: ${keys.length}\n`);

    for (const { index, key } of keys) {
        const keyPreview = key.substring(0, 10) + '...';
        console.log(`Key #${index}: ${keyPreview}`);

        // Try a simple API call
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            role: 'user',
                            parts: [{ text: 'test' }]
                        }],
                        generationConfig: {
                            temperature: 0.5,
                            maxOutputTokens: 10
                        }
                    })
                }
            );

            if (response.status === 200) {
                console.log(`  ✅ Status: WORKING`);
            } else if (response.status === 429) {
                console.log(`  ⏳ Status: RATE LIMITED`);
            } else {
                const errorText = await response.text().catch(() => 'Unknown');
                console.log(`  ❌ Status: ERROR (${response.status}): ${errorText.substring(0, 50)}`);
            }
        } catch (error) {
            console.log(`  ❌ Status: FAILED - ${error.message}`);
        }

        console.log('');
    }

    console.log('='.repeat(50));
    console.log('\n💡 Recommendations:');
    if (keys.length < 6) {
        console.log('  - Add more API keys (aim for 6-8 keys)');
    }
    console.log('  - Wait 5 minutes for rate-limited keys to recover');
    console.log('  - Consider upgrading to paid tier for higher quotas\n');
}

// Run check
checkKeyStatus().catch(console.error);
