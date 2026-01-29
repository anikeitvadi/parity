#!/bin/bash
# Deployment script for Prediction Market Edge Scanner
#
# Prerequisites:
#   - VPS with Node.js 20+ installed
#   - PM2 installed globally: npm install -g pm2
#   - SSH key configured for passwordless login
#   - .env file configured on VPS with production credentials
#
# Usage:
#   export VPS_IP=your.vps.ip.address
#   ./deploy.sh
#
# The script will:
#   1. Build TypeScript locally
#   2. Sync code to VPS (excluding node_modules, .git, databases)
#   3. Install production dependencies on VPS
#   4. Reload PM2 with ecosystem config
#   5. Save PM2 configuration for auto-restart on reboot

set -e

echo "============================================"
echo "Deploying Prediction Market Scanner to VPS"
echo "============================================"

# Check for VPS_IP environment variable
if [ -z "$VPS_IP" ]; then
    echo "Error: VPS_IP environment variable not set"
    echo "Usage: export VPS_IP=your.vps.ip.address && ./deploy.sh"
    exit 1
fi

echo "[1/5] Building TypeScript..."
npm run build

echo "[2/5] Syncing code to VPS..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.db' \
    --exclude '*.db-shm' \
    --exclude '*.db-wal' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.env.*.local' \
    --exclude 'logs' \
    --exclude 'coverage' \
    --exclude '.planning' \
    . "$VPS_IP":~/market-scanner/

echo "[3/5] Installing dependencies on VPS..."
ssh "$VPS_IP" << 'REMOTE_SCRIPT'
    cd ~/market-scanner

    # Create logs directory if it doesn't exist
    mkdir -p logs

    # Install production dependencies only
    npm install --production --omit=dev

    # Verify .env exists with proper permissions
    if [ ! -f .env ]; then
        echo "Warning: .env file not found on VPS"
        echo "Please copy .env.production to VPS as .env and fill in credentials"
    else
        # Ensure .env has secure permissions (owner read/write only)
        chmod 600 .env
        echo ".env file found with secure permissions"
    fi
REMOTE_SCRIPT

echo "[4/5] Reloading PM2 process..."
ssh "$VPS_IP" << 'REMOTE_SCRIPT'
    cd ~/market-scanner

    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo "Error: PM2 not installed. Run: npm install -g pm2"
        exit 1
    fi

    # Reload or start the application
    if pm2 describe market-scanner > /dev/null 2>&1; then
        pm2 reload ecosystem.config.js --env production
        echo "PM2 process reloaded"
    else
        pm2 start ecosystem.config.js --env production
        echo "PM2 process started"
    fi
REMOTE_SCRIPT

echo "[5/5] Saving PM2 configuration..."
ssh "$VPS_IP" << 'REMOTE_SCRIPT'
    # Save current process list for auto-restart on reboot
    pm2 save

    # Show status
    echo ""
    echo "============================================"
    echo "Deployment Status"
    echo "============================================"
    pm2 status
    echo ""
    echo "View logs: pm2 logs market-scanner"
REMOTE_SCRIPT

echo ""
echo "============================================"
echo "Deployment complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. SSH to VPS: ssh $VPS_IP"
echo "  2. Check logs: pm2 logs market-scanner"
echo "  3. Verify database: sqlite3 ~/market-scanner/markets.db 'SELECT COUNT(*) FROM market_snapshots;'"
