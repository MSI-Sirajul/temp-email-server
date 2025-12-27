/**
 * PUBLIC TEMPORARY EMAIL SERVER
 * For Termux - Complete Solution
 * Version: 2.1.0
 */

// ============================================
// IMPORTS AND CONFIGURATION
// ============================================
const SMTPServer = require("smtp-server").SMTPServer;
const MailParser = require("mailparser").MailParser;
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const path = require("path");
const publicIp = require('public-ip');
const cors = require('cors');
const os = require('os');
const { execSync } = require('child_process');
require('dotenv').config();

// ============================================
// INITIAL SETUP
// ============================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuration
const config = {
    // Ports
    SMTP_PORT: parseInt(process.env.SMTP_PORT) || 1025,
    HTTP_PORT: parseInt(process.env.HTTP_PORT) || 3000,
    
    // Email Settings
    EMAIL_EXPIRY_HOURS: parseInt(process.env.EMAIL_EXPIRY_HOURS) || 24,
    MAX_EMAILS_PER_ADDRESS: parseInt(process.env.MAX_EMAILS_PER_ADDRESS) || 100,
    ALLOW_ATTACHMENTS: process.env.ALLOW_ATTACHMENTS === 'true',
    MAX_ATTACHMENT_SIZE: process.env.MAX_ATTACHMENT_SIZE || '5MB',
    
    // Security
    ALLOW_RELAY: process.env.ALLOW_RELAY === 'true',
    REQUIRE_AUTH: process.env.REQUIRE_AUTH === 'true',
    
    // Storage
    SAVE_EMAILS: process.env.SAVE_EMAILS === 'true',
    EMAIL_STORAGE: path.join(__dirname, "emails.json"),
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// ============================================
// EMAIL MANAGER CLASS - UPDATED
// ============================================
class EmailManager {
    constructor() {
        this.emails = new Map();
        this.domains = new Set(['localhost']);
        this.publicIP = null;
        this.localIPs = [];
        this.domainHistory = [];
        this.stats = {
            totalEmails: 0,
            totalAddresses: 0,
            startTime: new Date()
        };
    }
    
    async initialize() {
        try {
            // Get public IP using multiple methods
            this.publicIP = await this.getPublicIP();
            
            // Get local IPs
            this.getLocalIPs();
            
            // Add all detected IPs to domains
            if (this.publicIP) {
                this.domains.add(this.publicIP);
                console.log(`🌐 Public IP detected: ${this.publicIP}`);
            }
            
            this.localIPs.forEach(ip => {
                this.domains.add(ip);
            });
            
            console.log(`🏠 Local IPs: ${this.localIPs.join(', ')}`);
            console.log(`📧 Available domains: ${Array.from(this.domains).join(', ')}`);
            
            // Load saved emails
            if (config.SAVE_EMAILS && fs.existsSync(config.EMAIL_STORAGE)) {
                this.loadFromFile();
            }
            
            // Cleanup old emails periodically
            setInterval(() => this.cleanupOldEmails(), 3600000);
            
        } catch (error) {
            console.log("⚠️  Error during initialization:", error.message);
            this.getLocalIPs(); // At least get local IPs
        }
    }
    
    async getPublicIP() {
        // Method 1: Check manual IP from .env
        if (process.env.MANUAL_PUBLIC_IP) {
            const manualIP = process.env.MANUAL_PUBLIC_IP.trim();
            if (this.isValidIP(manualIP)) {
                return manualIP;
            }
        }
        
        // Method 2: Try public-ip package
        try {
            const ip = await publicIp.v4({ timeout: 5000 });
            if (this.isValidIP(ip)) return ip;
        } catch (error) {
            // Continue to next method
        }
        
        // Method 3: Try multiple web services
        const services = [
            'https://api.ipify.org',
            'https://icanhazip.com',
            'https://checkip.amazonaws.com',
            'https://ipinfo.io/ip',
            'https://ifconfig.me/ip'
        ];
        
        for (const service of services) {
            try {
                // Using node-fetch style (simulated)
                const https = require('https');
                const ip = await new Promise((resolve, reject) => {
                    const req = https.get(service, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            const ip = data.trim();
                            if (this.isValidIP(ip)) {
                                resolve(ip);
                            } else {
                                reject(new Error('Invalid IP'));
                            }
                        });
                    });
                    req.setTimeout(3000, () => {
                        req.destroy();
                        reject(new Error('Timeout'));
                    });
                    req.on('error', reject);
                });
                
                if (ip) return ip;
            } catch (error) {
                continue;
            }
        }
        
        // Method 4: Try system commands
        const commands = [
            'curl -s ifconfig.me',
            'wget -qO- ifconfig.me 2>/dev/null',
            'curl -s api.ipify.org',
            'curl -s icanhazip.com'
        ];
        
        for (const cmd of commands) {
            try {
                const ip = execSync(cmd, { timeout: 3000 }).toString().trim();
                if (this.isValidIP(ip)) return ip;
            } catch (error) {
                continue;
            }
        }
        
        return null;
    }
    
    getLocalIPs() {
        try {
            const networkInterfaces = os.networkInterfaces();
            Object.values(networkInterfaces).forEach(iface => {
                iface.forEach(details => {
                    if (details.family === 'IPv4' && !details.internal) {
                        this.localIPs.push(details.address);
                    }
                });
            });
            
            // If no IPs found, try ifconfig command
            if (this.localIPs.length === 0) {
                try {
                    const ifconfig = execSync('ifconfig 2>/dev/null || ip addr 2>/dev/null').toString();
                    const ipRegex = /inet (\d+\.\d+\.\d+\.\d+)/g;
                    let match;
                    while ((match = ipRegex.exec(ifconfig)) !== null) {
                        const ip = match[1];
                        if (ip !== '127.0.0.1' && this.isValidIP(ip)) {
                            this.localIPs.push(ip);
                        }
                    }
                } catch (error) {
                    // Ignore error
                }
            }
        } catch (error) {
            console.log("⚠️  Error getting local IPs:", error.message);
        }
    }
    
    isValidIP(ip) {
        if (!ip || typeof ip !== 'string') return false;
        
        // Remove whitespace
        ip = ip.trim();
        
        // Check format
        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipPattern.test(ip)) return false;
        
        // Check each octet
        const parts = ip.split('.');
        if (parts.length !== 4) return false;
        
        for (const part of parts) {
            const num = parseInt(part, 10);
            if (num < 0 || num > 255 || isNaN(num)) return false;
            if (part.length > 1 && part.startsWith('0')) return false; // No leading zeros
        }
        
        // Reserved IP checks
        if (ip === '127.0.0.1') return false; // Loopback
        if (ip === '0.0.0.0') return false; // Invalid
        if (ip.startsWith('169.254.')) return false; // Link-local
        if (ip.startsWith('192.168.')) return false; // Private
        if (ip.startsWith('10.')) return false; // Private
        if (ip.startsWith('172.16.') || ip.startsWith('172.17.') || 
            ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
            ip.startsWith('172.20.') || ip.startsWith('172.21.') ||
            ip.startsWith('172.22.') || ip.startsWith('172.23.') ||
            ip.startsWith('172.24.') || ip.startsWith('172.25.') ||
            ip.startsWith('172.26.') || ip.startsWith('172.27.') ||
            ip.startsWith('172.28.') || ip.startsWith('172.29.') ||
            ip.startsWith('172.30.') || ip.startsWith('172.31.')) return false; // Private
        
        return true;
    }
    
    generateEmailAddress(options = {}) {
        const {
            username: customUsername,
            domain: preferredDomain,
            type = 'public' // 'public', 'local', 'random'
        } = options;
        
        // Generate username
        let username;
        if (customUsername && this.isValidUsername(customUsername)) {
            username = customUsername;
        } else {
            username = this.generateRandomUsername();
        }
        
        // Select domain based on type
        let domain;
        const domains = Array.from(this.domains);
        
        if (preferredDomain && domains.includes(preferredDomain)) {
            domain = preferredDomain;
        } else if (type === 'public' && this.publicIP) {
            domain = this.publicIP;
        } else if (type === 'local') {
            // Pick a local domain (not public IP)
            const localDomains = domains.filter(d => d !== this.publicIP && d !== 'localhost');
            domain = localDomains.length > 0 ? localDomains[0] : 'localhost';
        } else {
            // Random selection
            domain = domains[Math.floor(Math.random() * domains.length)];
        }
        
        const email = `${username}@${domain}`;
        
        // Initialize storage for this email
        if (!this.emails.has(email)) {
            this.emails.set(email, {
                address: email,
                created: new Date(),
                messages: [],
                stats: {
                    received: 0,
                    read: 0
                }
            });
            this.stats.totalAddresses++;
        }
        
        // Track domain usage
        this.domainHistory.push({
            email,
            domain,
            timestamp: new Date(),
            type: domain === 'localhost' || (this.localIPs.includes(domain) && domain !== this.publicIP) ? 'local' : 'public'
        });
        
        return {
            email,
            domain,
            isPublic: domain === this.publicIP,
            isLocal: domain === 'localhost' || this.localIPs.includes(domain),
            smtpServer: `${domain}:${config.SMTP_PORT}`,
            webInterface: domain === 'localhost' ? 
                `http://localhost:${config.HTTP_PORT}` :
                `http://${domain}:${config.HTTP_PORT}`,
            instructions: this.getInstructions(domain)
        };
    }
    
    getInstructions(domain) {
        if (domain === 'localhost') {
            return {
                note: 'Local email - can only receive from this device',
                sendFrom: 'Send from this device only',
                example: `echo "Test" | mail -s "Test" username@localhost`
            };
        } else if (domain === this.publicIP) {
            return {
                note: 'Public email - can receive from anywhere on internet',
                sendFrom: `Send from any device: username@${domain}`,
                smtp: `SMTP Server: ${domain}:${config.SMTP_PORT}`,
                example: `Use in Gmail/Outlook with SMTP server above`
            };
        } else {
            return {
                note: 'Local network email - can receive from same network',
                sendFrom: `Send from same network: username@${domain}`,
                smtp: `SMTP Server: ${domain}:${config.SMTP_PORT}`,
                example: `Devices on same WiFi can send to this address`
            };
        }
    }
    
    generateRandomUsername() {
        const adjectives = ['quick', 'clever', 'happy', 'brave', 'calm', 'eager', 'gentle', 'jolly', 'smart', 'wise'];
        const nouns = ['fox', 'bear', 'wolf', 'eagle', 'lion', 'tiger', 'panda', 'hawk', 'owl', 'deer'];
        const num = Math.floor(Math.random() * 999);
        
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        
        return `${adj}_${noun}_${num}`.toLowerCase();
    }
    
    isValidUsername(username) {
        return /^[a-z0-9_.-]{3,20}$/.test(username);
    }
    
    // ... [Rest of the EmailManager methods remain the same as before] ...
    
    async receiveEmail(toAddress, emailData) {
        if (!this.emails.has(toAddress)) {
            // Create address if it doesn't exist (for receiving)
            this.emails.set(toAddress, {
                address: toAddress,
                created: new Date(),
                messages: [],
                stats: { received: 0, read: 0 }
            });
            this.stats.totalAddresses++;
        }
        
        const emailEntry = this.emails.get(toAddress);
        const emailId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        const savedEmail = {
            id: emailId,
            from: emailData.from,
            to: toAddress,
            subject: emailData.subject || 'No Subject',
            text: emailData.text || '',
            html: emailData.html || '',
            headers: emailData.headers || {},
            date: new Date().toISOString(),
            read: false,
            attachments: emailData.attachments || 0
        };
        
        emailEntry.messages.unshift(savedEmail);
        emailEntry.stats.received++;
        this.stats.totalEmails++;
        
        // Limit messages per address
        if (emailEntry.messages.length > config.MAX_EMAILS_PER_ADDRESS) {
            emailEntry.messages = emailEntry.messages.slice(0, config.MAX_EMAILS_PER_ADDRESS);
        }
        
        // Save to file
        this.saveToFile();
        
        // Log the receipt
        console.log(`📨 Email received: ${emailData.from} -> ${toAddress} [${savedEmail.subject}]`);
        
        // Return email info
        return {
            id: emailId,
            address: toAddress,
            email: savedEmail,
            totalMessages: emailEntry.messages.length
        };
    }
    
    getEmailsForAddress(emailAddress) {
        return this.emails.get(emailAddress)?.messages || [];
    }
    
    markAsRead(emailAddress, emailId) {
        const emailEntry = this.emails.get(emailAddress);
        if (emailEntry) {
            const email = emailEntry.messages.find(msg => msg.id === emailId);
            if (email && !email.read) {
                email.read = true;
                emailEntry.stats.read++;
                this.saveToFile();
                return true;
            }
        }
        return false;
    }
    
    deleteEmail(emailAddress, emailId) {
        const emailEntry = this.emails.get(emailAddress);
        if (emailEntry) {
            const initialLength = emailEntry.messages.length;
            emailEntry.messages = emailEntry.messages.filter(msg => msg.id !== emailId);
            if (emailEntry.messages.length < initialLength) {
                this.saveToFile();
                return true;
            }
        }
        return false;
    }
    
    deleteAllEmails(emailAddress) {
        if (this.emails.has(emailAddress)) {
            this.emails.get(emailAddress).messages = [];
            this.saveToFile();
            return true;
        }
        return false;
    }
    
    getStats() {
        return {
            ...this.stats,
            uptime: Date.now() - this.stats.startTime,
            activeAddresses: this.emails.size,
            domains: Array.from(this.domains),
            publicIP: this.publicIP,
            localIPs: this.localIPs
        };
    }
    
    cleanupOldEmails() {
        const expiryTime = config.EMAIL_EXPIRY_HOURS * 60 * 60 * 1000;
        const now = Date.now();
        
        let deletedCount = 0;
        
        for (const [address, data] of this.emails.entries()) {
            // Remove emails older than expiry time
            const initialCount = data.messages.length;
            data.messages = data.messages.filter(msg => {
                const msgTime = new Date(msg.date).getTime();
                return (now - msgTime) < expiryTime;
            });
            deletedCount += (initialCount - data.messages.length);
            
            // Remove address if no messages and older than expiry
            if (data.messages.length === 0) {
                const addressAge = now - new Date(data.created).getTime();
                if (addressAge > expiryTime) {
                    this.emails.delete(address);
                }
            }
        }
        
        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} old emails`);
            this.saveToFile();
        }
    }
    
    saveToFile() {
        if (!config.SAVE_EMAILS) return;
        
        try {
            const data = {
                emails: Object.fromEntries(this.emails),
                stats: this.stats,
                savedAt: new Date().toISOString()
            };
            
            fs.writeFileSync(config.EMAIL_STORAGE, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving emails to file:', error);
        }
    }
    
    loadFromFile() {
        try {
            const rawData = fs.readFileSync(config.EMAIL_STORAGE, 'utf8');
            const data = JSON.parse(rawData);
            
            // Convert back to Map
            this.emails = new Map(Object.entries(data.emails || {}));
            this.stats = data.stats || this.stats;
            
            console.log(`📂 Loaded ${this.emails.size} email addresses from storage`);
        } catch (error) {
            console.error('Error loading emails from file:', error);
        }
    }
}

// ============================================
// INITIALIZE MANAGER
// ============================================
const emailManager = new EmailManager();

// ============================================
// SMTP SERVER SETUP
// ============================================
const smtpServer = new SMTPServer({
    // Server identification
    name: 'public-email-server',
    banner: 'Public Temporary Email Server - Termux',
    
    // Connection settings
    secure: false,
    disabledCommands: config.REQUIRE_AUTH ? [] : ['AUTH'],
    authOptional: !config.REQUIRE_AUTH,
    
    // Accept all recipients
    onRcptTo: (address, session, callback) => {
        const domain = address.address.split('@')[1];
        
        // Allow any domain for receiving (dynamic adding)
        emailManager.domains.add(domain);
        callback();
    },
    
    // Process incoming email
    onData: async (stream, session, callback) => {
        const mailParser = new MailParser({});
        const emailData = {
            from: session.envelope.mailFrom.address,
            recipients: session.envelope.rcptTo.map(rcpt => rcpt.address),
            subject: '',
            text: '',
            html: '',
            headers: {},
            attachments: 0
        };
        
        mailParser.on('headers', (headers) => {
            emailData.headers = Object.fromEntries(headers);
            emailData.subject = headers.get('subject') || 'No Subject';
        });
        
        mailParser.on('data', (data) => {
            if (data.type === 'text') {
                emailData.text = data.text || '';
                emailData.html = data.html || '';
            }
            if (data.type === 'attachment') {
                if (config.ALLOW_ATTACHMENTS) {
                    emailData.attachments++;
                    data.content.resume();
                }
            }
        });
        
        mailParser.on('end', async () => {
            try {
                for (const recipient of emailData.recipients) {
                    const result = await emailManager.receiveEmail(recipient, emailData);
                    
                    io.emit('new-email', {
                        recipient: recipient,
                        email: result.email,
                        total: result.totalMessages
                    });
                }
                
                callback();
            } catch (error) {
                console.error('Error processing email:', error);
                callback(error);
            }
        });
        
        stream.pipe(mailParser);
    },
    
    onError: (err) => {
        console.error('SMTP Server Error:', err.message);
    },
    
    logger: config.LOG_LEVEL === 'debug'
});

// ============================================
// EXPRESS ROUTES (API)
// ============================================
app.use(express.static(path.join(__dirname, 'public')));

// API: Get server info
app.get('/api/info', async (req, res) => {
    const stats = emailManager.getStats();
    
    res.json({
        success: true,
        server: {
            name: 'Public Email Server',
            version: '2.1.0',
            uptime: process.uptime(),
            platform: os.platform(),
            hostname: os.hostname()
        },
        config: {
            smtpPort: config.SMTP_PORT,
            httpPort: config.HTTP_PORT,
            allowAttachments: config.ALLOW_ATTACHMENTS,
            maxEmails: config.MAX_EMAILS_PER_ADDRESS
        },
        network: {
            publicIP: stats.publicIP,
            localIPs: stats.localIPs,
            domains: stats.domains,
            isPublic: !!stats.publicIP
        },
        stats: stats
    });
});

// API: Generate new email
app.get('/api/email/generate', async (req, res) => {
    try {
        const { type = 'public', username, domain } = req.query;
        
        const emailInfo = emailManager.generateEmailAddress({
            username,
            domain,
            type: type === 'public' ? 'public' : 'local'
        });
        
        res.json({
            success: true,
            ...emailInfo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API: Get emails for address
app.get('/api/email/:address', (req, res) => {
    const { address } = req.params;
    const emails = emailManager.getEmailsForAddress(address);
    
    res.json({
        success: true,
        address,
        count: emails.length,
        emails
    });
});

// API: Mark email as read
app.post('/api/email/:address/:id/read', (req, res) => {
    const { address, id } = req.params;
    const success = emailManager.markAsRead(address, id);
    
    res.json({
        success,
        message: success ? 'Email marked as read' : 'Email not found'
    });
});

// API: Delete email
app.delete('/api/email/:address/:id', (req, res) => {
    const { address, id } = req.params;
    const success = emailManager.deleteEmail(address, id);
    
    res.json({
        success,
        message: success ? 'Email deleted' : 'Email not found'
    });
});

// API: Delete all emails for address
app.delete('/api/email/:address', (req, res) => {
    const { address } = req.params;
    const success = emailManager.deleteAllEmails(address);
    
    res.json({
        success,
        message: success ? 'All emails deleted' : 'Address not found'
    });
});

// API: Get server statistics
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        ...emailManager.getStats()
    });
});

// API: Get available domains
app.get('/api/domains', (req, res) => {
    const stats = emailManager.getStats();
    
    res.json({
        success: true,
        domains: stats.domains,
        publicIP: stats.publicIP,
        localIPs: stats.localIPs,
        note: 'You can use any of these domains in email addresses'
    });
});

// API: Test public IP
app.get('/api/test-ip', async (req, res) => {
    try {
        const testIPs = [];
        const services = [
            { name: 'ipify', url: 'https://api.ipify.org' },
            { name: 'icanhazip', url: 'https://icanhazip.com' },
            { name: 'aws', url: 'https://checkip.amazonaws.com' }
        ];
        
        for (const service of services) {
            try {
                const https = require('https');
                const ip = await new Promise((resolve, reject) => {
                    const req = https.get(service.url, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => resolve(data.trim()));
                    });
                    req.setTimeout(3000, () => {
                        req.destroy();
                        reject(new Error('Timeout'));
                    });
                    req.on('error', reject);
                });
                
                testIPs.push({
                    service: service.name,
                    ip: ip,
                    valid: emailManager.isValidIP(ip)
                });
            } catch (error) {
                testIPs.push({
                    service: service.name,
                    error: error.message
                });
            }
        }
        
        res.json({
            success: true,
            currentPublicIP: emailManager.publicIP,
            testResults: testIPs,
            manualIP: process.env.MANUAL_PUBLIC_IP
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve main page
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// START SERVERS
// ============================================
async function startServers() {
    try {
        // Initialize email manager
        await emailManager.initialize();
        
        // Start SMTP server
        smtpServer.listen(config.SMTP_PORT, '0.0.0.0', () => {
            console.log(`✅ SMTP Server started`);
            console.log(`   Port: ${config.SMTP_PORT}`);
            console.log(`   Host: 0.0.0.0`);
            console.log(`   Accessible from anywhere!`);
        });
        
        // Start HTTP server
        server.listen(config.HTTP_PORT, '0.0.0.0', async () => {
            const stats = emailManager.getStats();
            
            console.log(`✅ HTTP Server started`);
            console.log(`   Port: ${config.HTTP_PORT}`);
            console.log(`   Web Interface: http://localhost:${config.HTTP_PORT}`);
            
            if (stats.localIPs.length > 0) {
                console.log(`   Local Network: http://${stats.localIPs[0]}:${config.HTTP_PORT}`);
            }
            
            if (stats.publicIP) {
                console.log(`🌐 Public Access: http://${stats.publicIP}:${config.HTTP_PORT}`);
                console.log(`   Email Format: username@${stats.publicIP}`);
                console.log(`   SMTP Server: ${stats.publicIP}:${config.SMTP_PORT}`);
            } else {
                console.log(`⚠️  No public IP detected. Using local only.`);
                console.log(`   To enable public access:`);
                console.log(`   1. Check your internet connection`);
                console.log(`   2. Set MANUAL_PUBLIC_IP in .env file`);
                console.log(`   3. Configure port forwarding on your router`);
                console.log(`   Local Email Format: username@localhost`);
                console.log(`   Local SMTP Server: localhost:${config.SMTP_PORT}`);
            }
            
            console.log('\n📧 Available Email Formats:');
            stats.domains.forEach(domain => {
                const type = domain === 'localhost' ? 'Local' : 
                            domain === stats.publicIP ? 'Public' : 'Network';
                console.log(`   ${type}: username@${domain}`);
            });
            
            console.log('\n🚀 Ready to receive emails!');
            
            // Display network configuration help
            if (!stats.publicIP && stats.localIPs.length > 0) {
                console.log('\n🔧 To enable public access, configure port forwarding:');
                console.log(`   Forward TCP Port ${config.SMTP_PORT} → ${stats.localIPs[0]}:${config.SMTP_PORT}`);
                console.log(`   Forward TCP Port ${config.HTTP_PORT} → ${stats.localIPs[0]}:${config.HTTP_PORT}`);
            }
        });
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down servers...');
            smtpServer.close(() => {
                console.log('✅ SMTP Server stopped');
            });
            server.close(() => {
                console.log('✅ HTTP Server stopped');
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('Failed to start servers:', error);
        process.exit(1);
    }
}

// ============================================
// START APPLICATION
// ============================================
startServers();
