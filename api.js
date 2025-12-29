const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ========== STATIC FILES ==========
// Serve static files dari root directory
app.use(express.static(__dirname));

// ========== ROUTE UNTUK HTML & CSS ==========
// Route untuk halaman utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route untuk CSS
app.get('/style.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'style.css'));
});

// Route untuk favicon (optional)
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ========== KONFIGURASI SMTP ==========
const settings = {
    // SMTP 1
    SMTP1: {
        user: "sennohara373@gmail.com",
        pass: "zkzq aows aygd rcxs",
        host: "smtp.gmail.com",
        port: 587,
        secure: false
    },
    
    // SMTP 2
    SMTP2: {
        user: "iwishyouknow9999@gmail.com",
        pass: "nqtl tvnj rbht oddy",
        host: "smtp.gmail.com",
        port: 587,
        secure: false
    },
    
    // Batas pengiriman
    DAILY_LIMIT: 15,
    COOLDOWN_SECONDS: 60, // 1 menit
    
    // File log (gunakan /tmp untuk Vercel)
    LOG_FILE: "/tmp/logs.json"
};

// ========== LOG SYSTEM ==========
let logs = [];

// Fungsi untuk memuat log
function loadLogs() {
    try {
        if (fs.existsSync(settings.LOG_FILE)) {
            const data = fs.readFileSync(settings.LOG_FILE, 'utf8');
            logs = JSON.parse(data);
            console.log(`Logs loaded: ${logs.length} entries`);
        } else {
            logs = [];
            console.log("No log file found, starting fresh");
        }
    } catch (error) {
        console.error("Error membaca file log:", error);
        logs = [];
    }
}

// Fungsi untuk menyimpan log
function saveLogs() {
    try {
        fs.writeFileSync(settings.LOG_FILE, JSON.stringify(logs, null, 2));
        console.log(`Logs saved: ${logs.length} entries`);
    } catch (error) {
        console.error("Error menyimpan log:", error);
    }
}

// Muat log saat startup
loadLogs();

// ========== HELPER FUNCTIONS ==========
// Cek batas harian
function checkDailyLimit() {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);
    const isLimit = todayLogs.length >= settings.DAILY_LIMIT;
    
    if (isLimit) {
        console.log(`Daily limit reached: ${todayLogs.length}/${settings.DAILY_LIMIT}`);
    }
    
    return isLimit;
}

// Cek cooldown
function checkCooldown() {
    if (logs.length === 0) {
        return false;
    }
    
    const lastLog = logs[logs.length - 1];
    const lastTime = new Date(lastLog.timestamp);
    const now = new Date();
    const diffSeconds = (now - lastTime) / 1000;
    const isCooldown = diffSeconds < settings.COOLDOWN_SECONDS;
    
    if (isCooldown) {
        console.log(`Cooldown active: ${Math.ceil(diffSeconds)}s/${settings.COOLDOWN_SECONDS}s`);
    }
    
    return isCooldown;
}

// Buat transporter SMTP
function createTransporter(smtpConfig) {
    return nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass
        },
        tls: {
            rejectUnauthorized: false
        }
    });
}

// ========== API ENDPOINTS ==========

// 1. Endpoint untuk status aplikasi
app.get('/api/status', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    
    res.json({
        success: true,
        app: "Send Mail",
        author: "Celine Ayumi",
        version: "1.0.0",
        dailyLimit: settings.DAILY_LIMIT,
        todayCount: todayLogs.length,
        remaining: Math.max(0, settings.DAILY_LIMIT - todayLogs.length),
        cooldown: settings.COOLDOWN_SECONDS,
        lastSent: lastLog ? lastLog.timestamp : null,
        totalLogs: logs.length,
        timestamp: new Date().toISOString()
    });
});

// 2. Endpoint untuk mengirim email
app.post('/api/send-email', async (req, res) => {
    console.log("Received email send request:", req.body);
    
    try {
        const { to, subject, message } = req.body;
        
        // Validasi input
        if (!to || !message) {
            return res.status(400).json({ 
                success: false, 
                message: "Email tujuan dan pesan wajib diisi" 
            });
        }
        
        // Validasi format email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return res.status(400).json({ 
                success: false, 
                message: "Format email tujuan tidak valid" 
            });
        }
        
        // Cek batas harian
        if (checkDailyLimit()) {
            return res.status(429).json({ 
                success: false, 
                message: `Batas harian ${settings.DAILY_LIMIT} email telah tercapai. Coba lagi besok.` 
            });
        }
        
        // Cek cooldown
        if (checkCooldown()) {
            return res.status(429).json({ 
                success: false, 
                message: "Tunggu 1 menit sebelum mengirim email berikutnya" 
            });
        }
        
        const emailSubject = subject || "(No Subject)";
        let smtpUsed = "SMTP 1";
        let success = false;
        let errorMessage = "";
        
        console.log(`Attempting to send email to: ${to}`);
        
        // Coba SMTP 1 terlebih dahulu
        let transporter = createTransporter(settings.SMTP1);
        
        try {
            console.log("Trying SMTP 1...");
            await transporter.sendMail({
                from: `"Send Mail" <${settings.SMTP1.user}>`,
                to: to,
                subject: emailSubject,
                text: message
            });
            success = true;
            console.log("Email sent successfully via SMTP 1");
        } catch (error) {
            console.log("SMTP 1 failed:", error.message);
            errorMessage = error.message;
            
            // Jika SMTP 1 gagal, coba SMTP 2
            try {
                transporter = createTransporter(settings.SMTP2);
                smtpUsed = "SMTP 2";
                
                console.log("Trying SMTP 2...");
                await transporter.sendMail({
                    from: `"Send Mail" <${settings.SMTP2.user}>`,
                    to: to,
                    subject: emailSubject,
                    text: message
                });
                success = true;
                errorMessage = "";
                console.log("Email sent successfully via SMTP 2");
            } catch (error2) {
                console.log("SMTP 2 also failed:", error2.message);
                success = false;
                errorMessage = error2.message;
            }
        }
        
        // Simpan log
        const logEntry = {
            id: Date.now(),
            to: to,
            subject: emailSubject,
            message: message.substring(0, 100) + (message.length > 100 ? "..." : ""),
            fullMessage: message,
            date: new Date().toISOString().split('T')[0],
            timestamp: new Date().toISOString(),
            success: success,
            smtpUsed: smtpUsed,
            error: errorMessage,
            ip: req.ip
        };
        
        logs.push(logEntry);
        saveLogs();
        
        if (success) {
            res.json({ 
                success: true, 
                message: "Sukses - Email berhasil dikirim!",
                log: logEntry
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: "Gagal mengirim email: " + errorMessage,
                log: logEntry
            });
        }
        
    } catch (error) {
        console.error("Error in send-email endpoint:", error);
        res.status(500).json({ 
            success: false, 
            message: "Terjadi kesalahan server: " + error.message
        });
    }
});

// 3. Endpoint untuk mendapatkan riwayat
app.get('/api/logs', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);
    
    // Limit jumlah log yang dikembalikan untuk performa
    const limitedLogs = logs.slice(-50).reverse(); // 50 log terbaru
    
    res.json({ 
        success: true, 
        logs: limitedLogs,
        dailyLimit: settings.DAILY_LIMIT,
        cooldown: settings.COOLDOWN_SECONDS,
        todayCount: todayLogs.length,
        totalCount: logs.length
    });
});

// 4. Endpoint untuk export log
app.get('/api/export-logs', (req, res) => {
    try {
        const logData = JSON.stringify(logs, null, 2);
        const filename = `sendmail-logs-${new Date().toISOString().split('T')[0]}.json`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(logData);
    } catch (error) {
        console.error("Error exporting logs:", error);
        res.status(500).json({ success: false, message: "Gagal mengekspor log" });
    }
});

// 5. Endpoint untuk reset log (development only)
app.delete('/api/reset-logs', (req, res) => {
    logs = [];
    saveLogs();
    res.json({ success: true, message: "Logs reset successfully" });
});

// 6. Endpoint untuk testing API
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'OK',
        app: 'Send Mail',
        author: 'Celine Ayumi',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ========== ERROR HANDLING ==========
// Handle 404 - API not found
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'API endpoint tidak ditemukan',
        path: req.originalUrl 
    });
});

// Handle 404 - Page not found (fallback to index.html for SPA)
app.use((req, res) => {
    // Jika request untuk API, kembalikan 404 JSON
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ 
            success: false, 
            message: 'Endpoint tidak ditemukan' 
        });
    }
    
    // Untuk halaman lain, arahkan ke index.html (untuk SPA routing)
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== SERVER STARTUP ==========
// Hanya jalankan server jika bukan di Vercel
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server Send Mail berjalan di http://localhost:${PORT}`);
        console.log(`📧 Aplikasi siap digunakan!`);
        console.log(`📊 Total logs: ${logs.length}`);
        console.log(`🔧 SMTP Config: Dual Gmail dengan auto-fallback`);
    });
}

// ========== EXPORT FOR VERCEL ==========
module.exports = app;