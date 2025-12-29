// Konfigurasi SMTP tanpa login
const settings = {
    // Konfigurasi SMTP 1
    SMTP1: {
        user: "sennohara373@gmail.com",
        pass: "zkzq aows aygd rcxs",
        host: "smtp.gmail.com",
        port: 587,
        secure: false
    },
    
    // Konfigurasi SMTP 2
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
    
    // File log
    LOG_FILE: "/tmp/logs.json"
};

module.exports = settings;