// Native fetch (Node 18+)

async function listModels() {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        const data = await response.json();

        if (data.data) {
            console.log('--- Free Models ---');
            const freeModels = data.data.filter(m => m.id.includes('free') || m.pricing.prompt === '0');
            freeModels.forEach(m => console.log(m.id));

            console.log('\n--- Google Models ---');
            const googleModels = data.data.filter(m => m.id.includes('google/gemini'));
            googleModels.forEach(m => console.log(m.id));
        }
    } catch (error) {
        console.error('Error fetching models:', error);
    }
}

listModels();
