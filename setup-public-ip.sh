#!/data/data/com.termux/files/usr/bin/bash

echo "🔍 Detecting your public IP address..."

# Try multiple methods to get public IP
IP_METHODS=(
    "curl -s ifconfig.me"
    "wget -qO- ifconfig.me"
    "curl -s api.ipify.org"
    "curl -s icanhazip.com"
    "curl -s checkip.amazonaws.com"
)

PUBLIC_IP=""

for method in "${IP_METHODS[@]}"; do
    echo "Trying: $method"
    IP=$(timeout 5 $method 2>/dev/null)
    
    if [[ $IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        PUBLIC_IP=$IP
        echo "✅ Found public IP: $PUBLIC_IP"
        break
    fi
done

if [ -z "$PUBLIC_IP" ]; then
    echo "❌ Could not detect public IP automatically"
    echo "Please enter your public IP manually:"
    read -r PUBLIC_IP
fi

# Update .env file
ENV_FILE="$HOME/temp-email-server/.env"
if [ -f "$ENV_FILE" ]; then
    # Check if MANUAL_PUBLIC_IP already exists
    if grep -q "MANUAL_PUBLIC_IP" "$ENV_FILE"; then
        # Update existing entry
        sed -i "s/MANUAL_PUBLIC_IP=.*/MANUAL_PUBLIC_IP=$PUBLIC_IP/" "$ENV_FILE"
    else
        # Add new entry
        echo "" >> "$ENV_FILE"
        echo "# Manual Public IP" >> "$ENV_FILE"
        echo "MANUAL_PUBLIC_IP=$PUBLIC_IP" >> "$ENV_FILE"
    fi
    echo "✅ Updated .env file with public IP: $PUBLIC_IP"
else
    echo "❌ .env file not found at $ENV_FILE"
fi

# Get local IP
LOCAL_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)

echo ""
echo "📊 Network Information:"
echo "   Public IP: $PUBLIC_IP"
echo "   Local IP:  $LOCAL_IP"
echo ""
echo "🔧 To make your server publicly accessible:"
echo "   1. Login to your router"
echo "   2. Go to Port Forwarding section"
echo "   3. Add these rules:"
echo "      - TCP Port 1025 → $LOCAL_IP:1025"
echo "      - TCP Port 3000 → $LOCAL_IP:3000"
echo ""
echo "📧 Email formats you can use:"
echo "   - username@$PUBLIC_IP"
echo "   - username@localhost"
echo "   - username@$LOCAL_IP"
