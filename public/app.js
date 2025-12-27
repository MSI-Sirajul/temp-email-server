/**
 * PUBLIC EMAIL SERVER - CLIENT SIDE
 * Version: 2.0.0
 */

// ============================================
// GLOBAL VARIABLES AND STATE
// ============================================
class EmailClient {
    constructor() {
        this.currentEmail = null;
        this.socket = null;
        this.emails = [];
        this.serverInfo = null;
        this.currentView = 'list'; // 'list' or 'detail'
        this.selectedEmail = null;
        this.autoRefresh = true;
        this.refreshInterval = null;
        
        this.initialize();
    }
    
    async initialize() {
        // Initialize Socket.IO connection
        this.connectSocket();
        
        // Load server info
        await this.loadServerInfo();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup auto-refresh
        this.setupAutoRefresh();
        
        // Update time
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 1000);
    }
    
    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.showToast('Connected to server', 'success');
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            this.showToast('Disconnected from server', 'error');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('new-email', (data) => {
            if (this.currentEmail && data.recipient === this.currentEmail) {
                this.showToast(`New email from ${data.email.from}`, 'success');
                this.loadEmails();
                
                // Play notification sound
                this.playNotification();
                
                // Show desktop notification
                this.showDesktopNotification(data.email);
            }
        });
    }
    
    async loadServerInfo() {
        try {
            const response = await fetch('/api/info');
            const data = await response.json();
            
            if (data.success) {
                this.serverInfo = data;
                this.updateServerInfoUI(data);
            }
        } catch (error) {
            console.error('Failed to load server info:', error);
        }
    }
    
    async loadDomains() {
        try {
            const response = await fetch('/api/domains');
            const data = await response.json();
            
            if (data.success && data.domains) {
                const domainSelect = document.getElementById('domain');
                domainSelect.innerHTML = '<option value="">Auto-select</option>';
                
                data.domains.forEach(domain => {
                    const option = document.createElement('option');
                    option.value = domain;
                    option.textContent = domain;
                    domainSelect.appendChild(option);
                });
                
                // Set default to public IP if available
                if (data.publicIP) {
                    domainSelect.value = data.publicIP;
                    document.getElementById('footerSmtp').textContent = `${data.publicIP}:1025`;
                }
            }
        } catch (error) {
            console.error('Failed to load domains:', error);
        }
    }
    
    async generateEmail(type = 'public') {
        const usernameInput = document.getElementById('username');
        const domainSelect = document.getElementById('domain');
        
        const params = new URLSearchParams({
            type: type,
            username: usernameInput.value || '',
            domain: domainSelect.value || ''
        });
        
        try {
            const response = await fetch(`/api/email/generate?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.currentEmail = data.email;
                this.showEmailResult(data);
                this.loadEmails();
                this.loadDomains();
            } else {
                this.showToast(data.error || 'Failed to generate email', 'error');
            }
        } catch (error) {
            console.error('Failed to generate email:', error);
            this.showToast('Network error. Please check connection.', 'error');
        }
    }
    
    async loadEmails() {
        if (!this.currentEmail) return;
        
        try {
            const response = await fetch(`/api/email/${this.currentEmail}`);
            const data = await response.json();
            
            if (data.success) {
                this.emails = data.emails;
                this.renderEmailList();
                this.updateStatsUI();
            }
        } catch (error) {
            console.error('Failed to load emails:', error);
        }
    }
    
    async markAsRead(emailId) {
        if (!this.currentEmail) return;
        
        try {
            const response = await fetch(`/api/email/${this.currentEmail}/${emailId}/read`, {
                method: 'POST'
            });
            
            const data = await response.json();
            if (data.success) {
                this.loadEmails();
            }
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    }
    
    async deleteEmail(emailId) {
        if (!this.currentEmail || !confirm('Are you sure you want to delete this email?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/email/${this.currentEmail}/${emailId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            if (data.success) {
                this.showToast('Email deleted', 'success');
                this.loadEmails();
                
                // If we deleted the currently viewed email, go back to list
                if (this.selectedEmail && this.selectedEmail.id === emailId) {
                    this.showEmailList();
                }
            }
        } catch (error) {
            console.error('Failed to delete email:', error);
            this.showToast('Failed to delete email', 'error');
        }
    }
    
    async deleteAllEmails() {
        if (!this.currentEmail || !confirm('Are you sure you want to delete ALL emails for this address?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/email/${this.currentEmail}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            if (data.success) {
                this.showToast('All emails deleted', 'success');
                this.loadEmails();
                this.showEmailList();
            }
        } catch (error) {
            console.error('Failed to delete all emails:', error);
            this.showToast('Failed to delete emails', 'error');
        }
    }
    
    async loadStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            if (data.success) {
                this.updateStatsUI(data);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }
    
    // UI METHODS
    showEmailResult(data) {
        const resultDiv = document.getElementById('emailResult');
        const emailDisplay = document.getElementById('generatedEmail');
        const smtpServer = document.getElementById('smtpServer');
        const currentEmailDisplay = document.getElementById('currentEmailDisplay');
        
        emailDisplay.textContent = data.email;
        smtpServer.textContent = data.smtpServer;
        currentEmailDisplay.textContent = data.email;
        
        resultDiv.style.display = 'block';
        
        // Update current email in UI
        document.getElementById('currentEmailDisplay').textContent = data.email;
        
        this.showToast(`Email created: ${data.email}`, 'success');
    }
    
    renderEmailList() {
        const emailList = document.getElementById('emailList');
        
        if (!this.emails || this.emails.length === 0) {
            emailList.innerHTML = `
                <div class="empty-inbox">
                    <i class="fas fa-envelope-open"></i>
                    <h3>No emails yet</h3>
                    <p>Generate an email address and start receiving!</p>
                </div>
            `;
            return;
        }
        
        emailList.innerHTML = this.emails.map(email => `
            <div class="email-item ${email.read ? '' : 'unread'}" 
                 data-id="${email.id}"
                 onclick="emailClient.showEmailDetail('${email.id}')">
                <div class="email-icon">
                    <i class="fas fa-envelope${email.read ? '-open' : ''}"></i>
                </div>
                <div class="email-content">
                    <div class="email-header">
                        <div class="email-sender">${this.escapeHtml(email.from)}</div>
                        <div class="email-date">${this.formatDate(email.date)}</div>
                    </div>
                    <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                    <div class="email-preview">${this.escapeHtml(email.text.substring(0, 100) + (email.text.length > 100 ? '...' : ''))}</div>
                </div>
            </div>
        `).join('');
    }
    
    showEmailDetail(emailId) {
        const email = this.emails.find(e => e.id === emailId);
        if (!email) return;
        
        this.selectedEmail = email;
        this.currentView = 'detail';
        
        // Update UI
        document.getElementById('emailList').style.display = 'none';
        document.getElementById('emailDetail').style.display = 'flex';
        
        // Fill email details
        document.getElementById('emailSubject').textContent = this.escapeHtml(email.subject);
        document.getElementById('detailFrom').textContent = this.escapeHtml(email.from);
        document.getElementById('detailTo').textContent = this.escapeHtml(email.to);
        document.getElementById('detailDate').textContent = this.formatDate(email.date, true);
        document.getElementById('emailBodyText').textContent = email.text || 'No text content';
        
        // Show HTML if available
        if (email.html) {
            document.getElementById('emailBodyHtml').innerHTML = email.html;
            document.getElementById('emailBodyHtml').style.display = 'block';
            document.getElementById('emailBodyText').style.display = 'none';
        } else {
            document.getElementById('emailBodyHtml').style.display = 'none';
            document.getElementById('emailBodyText').style.display = 'block';
        }
        
        // Mark as read
        if (!email.read) {
            this.markAsRead(emailId);
        }
    }
    
    showEmailList() {
        this.currentView = 'list';
        this.selectedEmail = null;
        
        document.getElementById('emailList').style.display = 'block';
        document.getElementById('emailDetail').style.display = 'none';
    }
    
    updateServerInfoUI(data) {
        if (data.stats) {
            document.getElementById('totalEmails').textContent = data.stats.totalEmails;
            document.getElementById('activeAddresses').textContent = data.stats.activeAddresses;
            document.getElementById('uptime').textContent = this.formatUptime(data.stats.uptime);
            
            if (data.stats.publicIP) {
                document.getElementById('publicIP').textContent = data.stats.publicIP;
                document.getElementById('webUrl').textContent = `http://${data.stats.publicIP}:${data.config.httpPort}`;
            }
        }
    }
    
    updateStatsUI(stats) {
        if (!stats) return;
        
        document.getElementById('totalEmails').textContent = stats.totalEmails;
        document.getElementById('activeAddresses').textContent = stats.activeAddresses;
        document.getElementById('uptime').textContent = this.formatUptime(stats.uptime);
    }
    
    updateConnectionStatus(connected) {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');
        const connectionStatus = document.getElementById('connectionStatus');
        
        if (connected) {
            statusIndicator.classList.add('active');
            statusText.textContent = 'Online';
            statusText.style.color = 'var(--success-color)';
            connectionStatus.textContent = 'Connected to server';
            connectionStatus.style.color = 'var(--success-color)';
        } else {
            statusIndicator.classList.remove('active');
            statusText.textContent = 'Offline';
            statusText.style.color = 'var(--danger-color)';
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.style.color = 'var(--danger-color)';
        }
    }
    
    // UTILITY METHODS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatDate(dateString, full = false) {
        const date = new Date(dateString);
        
        if (full) {
            return date.toLocaleString();
        }
        
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
    
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    updateCurrentTime() {
        const now = new Date();
        document.getElementById('currentTime').textContent = 
            now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    copyEmailToClipboard() {
        if (!this.currentEmail) {
            this.showToast('No email address to copy', 'warning');
            return;
        }
        
        navigator.clipboard.writeText(this.currentEmail).then(() => {
            this.showToast('Email address copied to clipboard', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.showToast('Failed to copy email address', 'error');
        });
    }
    
    shareEmail() {
        if (!this.currentEmail || !navigator.share) {
            this.copyEmailToClipboard();
            return;
        }
        
        const publicIP = this.serverInfo?.stats?.publicIP || 'localhost';
        
        navigator.share({
            title: 'My Temporary Email Address',
            text: `Use this temporary email: ${this.currentEmail}\nSMTP Server: ${publicIP}:1025`,
            url: window.location.href
        }).then(() => {
            this.showToast('Email address shared', 'success');
        }).catch(err => {
            console.error('Share failed:', err);
            this.copyEmailToClipboard();
        });
    }
    
    showDesktopNotification(email) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }
        
        new Notification('New Email Received', {
            body: `From: ${email.from}\nSubject: ${email.subject}`,
            icon: 'https://cdn-icons-png.flaticon.com/512/3178/3178158.png',
            silent: true
        });
    }
    
    playNotification() {
        try {
            // Create a simple notification sound
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            // Audio not supported, ignore
        }
    }
    
    showToast(message, type = 'info', duration = 5000) {
        const container = document.getElementById('toastContainer');
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${this.getToastTitle(type)}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after duration
        setTimeout(() => {
            if (toast.parentNode === container) {
                toast.style.animation = 'slideInRight 0.3s ease reverse';
                setTimeout(() => {
                    if (toast.parentNode === container) {
                        container.removeChild(toast);
                    }
                }, 300);
            }
        }, duration);
    }
    
    getToastIcon(type) {
        switch (type) {
            case 'success': return 'check-circle';
            case 'error': return 'exclamation-circle';
            case 'warning': return 'exclamation-triangle';
            default: return 'info-circle';
        }
    }
    
    getToastTitle(type) {
        switch (type) {
            case 'success': return 'Success';
            case 'error': return 'Error';
            case 'warning': return 'Warning';
            default: return 'Info';
        }
    }
    
    // EVENT HANDLERS
    setupEventListeners() {
        // Email type buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Generate button
        document.getElementById('generateBtn').addEventListener('click', () => {
            const activeType = document.querySelector('.type-btn.active').dataset.type;
            this.generateEmail(activeType);
        });
        
        // Email actions
        document.getElementById('refreshInbox').addEventListener('click', () => {
            this.loadEmails();
            this.showToast('Inbox refreshed', 'info');
        });
        
        document.getElementById('deleteAll').addEventListener('click', () => {
            this.deleteAllEmails();
        });
        
        document.getElementById('backToList').addEventListener('click', () => {
            this.showEmailList();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentView === 'detail') {
                this.showEmailList();
            }
            
            if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.loadEmails();
            }
        });
        
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
    
    setupAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.refreshInterval = setInterval(() => {
            if (this.autoRefresh && this.currentEmail) {
                this.loadEmails();
                this.loadStats();
            }
        }, 10000); // Refresh every 10 seconds
    }
    
    // PUBLIC METHODS FOR HTML ONCLICK
    copyEmail() {
        this.copyEmailToClipboard();
    }
    
    shareEmail() {
        this.shareEmail();
    }
    
    replyToEmail() {
        if (!this.selectedEmail) return;
        
        const subject = `Re: ${this.selectedEmail.subject}`;
        const body = `\n\n--- Original Message ---\nFrom: ${this.selectedEmail.from}\nDate: ${this.formatDate(this.selectedEmail.date, true)}\n\n${this.selectedEmail.text}`;
        
        this.showToast('Reply feature coming soon!', 'info');
        // In a real implementation, you would open a compose window
    }
    
    deleteCurrentEmail() {
        if (!this.selectedEmail) return;
        this.deleteEmail(this.selectedEmail.id);
    }
}

// ============================================
// GLOBAL INSTANCE AND FUNCTIONS
// ============================================
let emailClient;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    emailClient = new EmailClient();
    
    // Load domains
    emailClient.loadDomains();
    
    // Global functions for HTML onclick
    window.emailClient = emailClient;
    
    // Setup custom functions
    window.copyEmail = () => emailClient.copyEmailToClipboard();
    window.shareEmail = () => emailClient.shareEmail();
    window.replyToEmail = () => emailClient.replyToEmail();
    window.deleteCurrentEmail = () => emailClient.deleteCurrentEmail();
    window.showHelp = () => emailClient.showToast('Help documentation coming soon!', 'info');
    window.showSettings = () => emailClient.showToast('Settings coming soon!', 'info');
    window.refreshStats = () => {
        emailClient.loadStats();
        emailClient.showToast('Statistics refreshed', 'info');
    };
});

// Export for modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmailClient;
}