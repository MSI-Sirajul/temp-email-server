#!/usr/bin/env node
/**
 * Fix Public IP Detection Script
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Public IP Detection...\n');

function isValidIP(ip) {
    if (!ip) return false;
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(ip)) return false;
    
    const parts = ip.split('.');
    for (const part of parts) {
        const num = parseInt(part, 10);
        if (num < 0 || num > 255) return false;
    }
    return true;
}

// Get public IP
let publicIP = '';
const methods = [
    'curl -s ifconfig.me',
    'curl -s api.ipify.org',
    'curl -s icanhazip.com',
    'wget -qO- ifconfig.me 2>/dev/null'
];

console.log('🌐 Detecting your public IP...');
for (const method of methods) {
    try {
        const ip = execSync(method, { timeout: 5000 }).toString().trim();
        if (isValidIP(ip)) {
            publicIP = ip;
            console.log(`✅ Found public IP: ${publicIP} (via ${method.split(' ')[1]})`);
            break;
        }
    } catch (error) {
        // Continue to next method
    }
}

if (!publicIP) {
    console.log('❌ Could not detect public IP automatically');
    console.log('Please enter your public IP manually:');
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    readline.question('Public IP: ', (ip) => {
        if (isValidIP(ip.trim())) {
            publicIP = ip.trim();
            updateEnvFile();
        } else {
            console.log('❌ Invalid IP address format');
        }
        readline.close();
    });
} else {
    updateEnvFile();
}

function updateEnvFile() {
    const envPath = path.join(__dirname, '.env');
    
    if (!fs.existsSync(envPath)) {
        console.log('❌ .env file not found');
        return;
    }
    
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check if MANUAL_PUBLIC_IP already exists
    if (envContent.includes('MANUAL_PUBLIC_IP')) {
        // Update existing
        envContent = envContent.replace(
            /MANUAL_PUBLIC_IP=.*/,
            `MANUAL_PUBLIC_IP=${publicIP}`
        );
        console.log('✅ Updated existing MANUAL_PUBLIC_IP in .env');
    } else {
        // Add new
        envContent += `\n\n# Manual Public IP\nMANUAL_PUBLIC_IP=${publicIP}\n`;
        console.log('✅ Added MANUAL_PUBLIC_IP to .env');
    }
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    
    console.log('\n📊 Configuration Summary:');
    console.log(`   Public IP: ${publicIP}`);
    console.log(`   SMTP Server: ${publicIP}:1025`);
    console.log(`   Web Interface: http://${publicIP}:3000`);
    console.log(`   Email Format: username@${publicIP}`);
    
    console.log('\n🔧 Port Forwarding Required:');
    console.log('   1. Login to your router (usually 192.168.1.1)');
    console.log('   2. Go to Port Forwarding / NAT section');
    console.log('   3. Add these rules:');
    console.log('      - TCP Port 1025 → Your Device IP:1025');
    console.log('      - TCP Port 3000 → Your Device IP:3000');
    
    console.log('\n🚀 Restart your server: npm start');
}
