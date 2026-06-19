const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\antigravity-inquiry-helper-web-bridge';
const files = ['index.html', 'app.js', 'mock-ai.js'];
const payload = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
  payload.push({
    path: file,
    content: content
  });
}

fs.writeFileSync(path.join(srcDir, 'payload_output.json'), JSON.stringify(payload), 'utf8');
console.log('Successfully wrote payload_output.json');
