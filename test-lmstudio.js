
const LM_STUDIO_URL = 'http://100.64.219.180:1234/v1/chat/completions';

async function testLMStudio() {
    console.log(`Connecting to LM Studio at ${LM_STUDIO_URL}...`);
    
    const payload = {
        model: "model-identifier", // LM Studio usually ignores this or uses the loaded model
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "Say 'LM Studio is ready!' if you can hear me." }
        ],
        temperature: 0.7
    };

    try {
        const response = await fetch(LM_STUDIO_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log("Success! Response from LM Studio:");
        console.log("-----------------------------------");
        console.log(data.choices[0].message.content);
        console.log("-----------------------------------");
        console.log("Full Token Usage:", data.usage);
    } catch (error) {
        console.error("Failed to connect to LM Studio:");
        console.error(error.message);
        console.log("\nPossible solutions:");
        console.log("1. Ensure LM Studio 'Local Server' is ON.");
        console.log("2. Ensure the IP 100.64.219.180 is reachable (Check Tailscale/Network).");
        console.log("3. Ensure Cross-Origin-Resource-Sharing (CORS) is enabled in LM Studio if calling from a browser (not applicable to this node script).");
    }
}

testLMStudio();
