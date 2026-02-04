const fs = require('fs');
const path = require('path');

const buildFile = path.join(__dirname, 'dev-build.json');

let buildData = {
    build: 0,
    timestamp: ''
};

if (fs.existsSync(buildFile)) {
    try {
        buildData = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
    } catch (e) {
        console.error('Failed to parse dev-build.json, resetting.');
    }
}

// Increment
buildData.build += 1;

// Timestamp (YYYY-MM-DD HH:MM)
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
buildData.timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

fs.writeFileSync(buildFile, JSON.stringify(buildData, null, 2));

console.log(`Build incremented to ${buildData.build} (${buildData.timestamp})`);
