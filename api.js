const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const settings = require('./setting.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Simpan log di memory dan file
let logs = [];
const LOG_FILE = settings.LOG_FILE;

// Fungsi untuk memuat log
function loadLogs() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const data = fs.readFileSync(LOG_FILE, 'utf8');
            logs = JSON.parse(data);
        } else {
            logs = [];
            saveLogs();
        }
    } catch (error) {
        console.error("Error membaca file log:", error);
        logs = [];
    }
}

// Fungsi untuk menyimpan log
function saveLogs() {
    try {
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    } catch (error) {
        console.error("Error menyimpan log:", error);
    }
}

// Muat log saat startup
loadLogs();

// Fungsi cek batas harian
function checkDailyLimit() {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);
    return todayLogs.length >= settings.DAILY_LIMIT;
}

// Fungsi cek cooldown
function checkCooldown() {
    if (logs.length === 0) return false;
    
    const lastLog = logs[logs.length - 1];
    const lastTime = new Date(lastLog.timestamp);
    const now = new Date();
    const diffSeconds = (now - lastTime) / 1000;
    
    return diffSeconds < settings.COOLDOWN_SECONDS;
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

// Endpoint utama untuk halaman
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint untuk CSS
app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

// Endpoint untuk status aplikasi
app.get('/api/status', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    
    res.json({
        success: true,
        app: "Send Mail",
        author: "Celine Ayumi",
        dailyLimit: settings.DAILY_LIMIT,
        todayCount: todayLogs.length,
        remaining: Math.max(0, settings.DAILY_LIMIT - todayLogs.length),
        cooldown: settings.COOLDOWN_SECONDS,
        lastSent: lastLog ? lastLog.timestamp : null,
        totalLogs: logs.length
    });
});

// Endpoint untuk mengirim email
app.post('/api/send-email', async (req, res) => {
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
                message: "Batas harian 15 email telah tercapai. Coba lagi besok." 
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
        
        // Coba SMTP 1 terlebih dahulu
        let transporter = createTransporter(settings.SMTP1);
        
        try {
            // Kirim email dengan SMTP 1
            await transporter.sendMail({
                from: `"Send Mail" <${settings.SMTP1.user}>`,
                to: to,
                subject: emailSubject,
                text: message
            });
            success = true;
        } catch (error) {
            console.log("SMTP 1 gagal:", error.message);
            errorMessage = error.message;
            
            // Jika SMTP 1 gagal, coba SMTP 2
            try {
                transporter = createTransporter(settings.SMTP2);
                smtpUsed = "SMTP 2";
                
                await transporter.sendMail({
                    from: `"Send Mail" <${settings.SMTP2.user}>`,
                    to: to,
                    subject: emailSubject,
                    text: message
                });
                success = true;
                errorMessage = "";
            } catch (error2) {
                console.log("SMTP 2 juga gagal:", error2.message);
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
            error: errorMessage
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
        console.error("Error mengirim email:", error);
        res.status(500).json({ 
            success: false, 
            message: "Terjadi kesalahan server" 
        });
    }
});

// Endpoint untuk mendapatkan riwayat
app.get('/api/logs', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);
    
    res.json({ 
        success: true, 
        logs: logs.slice().reverse(),
        dailyLimit: settings.DAILY_LIMIT,
        cooldown: settings.COOLDOWN_SECONDS,
        todayCount: todayLogs.length,
        totalCount: logs.length
    });
});

// Endpoint untuk export log
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

// Endpoint untuk testing
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'OK',
        app: 'Send Mail',
        author: 'Celine Ayumi',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Tangani 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Export untuk Vercel
module.exports = app;

// Untuk development lokal
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server berjalan di http://localhost:${PORT}`);
        console.log(`Aplikasi Send Mail siap digunakan!`);
    });
}