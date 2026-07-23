# Webhook Migration Guide

## Changes Made

### 1. Environment Variable (.env)
✅ Updated `WEBHOOK_URL` from `https://betbot.shalops.com` to `https://betbot.tatekgym.et`

### 2. Server Display (server.js)
✅ Updated analytics URL in production console message

## What You Need to Do Next

### 1. Cloudflare DNS Configuration
Add a DNS record in your Cloudflare dashboard:

1. Go to Cloudflare Dashboard → Select `tatekgym.et` domain
2. Click on **DNS** tab
3. Add a new record:
   - **Type**: `A`
   - **Name**: `betbot`
   - **IPv4 address**: Your VPS IP address
   - **Proxy status**: 🟠 **DNS only** (very important for webhooks!)
   - **TTL**: Auto
4. Click **Save**

⚠️ **Important**: Use "DNS only" (gray cloud), not "Proxied" (orange cloud). Telegram webhooks work better with direct connection.

### 2. SSL Certificate (Cloudflare Handles This!)
Since you're using Cloudflare:
- **SSL/TLS Mode**: Set to "Full" or "Full (strict)" in Cloudflare
- Cloudflare will automatically provide SSL
- If using "Full (strict)", you may need a certificate on your VPS

**Option A: Let Cloudflare handle SSL (Recommended)**
- Set Cloudflare SSL/TLS to "Full"
- No certificate needed on your VPS

**Option B: Full encryption (More secure)**
```bash
# Install certbot on your VPS
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d betbot.tatekgym.et

# Auto-renewal is configured automatically
```

### 3. Nginx Configuration
Create or update Nginx configuration on your VPS:

```bash
# Create new config file
sudo nano /etc/nginx/sites-available/betbot
```

**Paste this configuration:**
```nginx
server {
    listen 80;
    server_name betbot.tatekgym.et;

    # For Let's Encrypt certificate verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name betbot.tatekgym.et;

    # SSL certificates (if using certbot, it will add these lines)
    # ssl_certificate /etc/letsencrypt/live/betbot.tatekgym.et/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/betbot.tatekgym.et/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logging
    access_log /var/log/nginx/betbot-access.log;
    error_log /var/log/nginx/betbot-error.log;

    # Proxy settings for Node.js app
    location / {
        proxy_pass http://localhost:7070;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:7070/health;
        access_log off;
    }
}
```

**Enable the site:**
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/betbot /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

### 4. Restart Your Application on VPS
```bash
# If using PM2 (recommended)
pm2 restart betbot

# Or if PM2 not installed, install it first:
npm install -g pm2
cd /path/to/betbot
pm2 start server.js --name betbot
pm2 save
pm2 startup  # Follow the instructions to enable auto-start

# Or using systemd service
sudo systemctl restart betbot

# Or manually
pkill -f "node server.js"
cd /path/to/betbot
nohup node server.js > output.log 2>&1 &
```

### 5. Verify Webhook Setup
After restart, check the logs to confirm:
```
✅ Webhook set to: https://betbot.tatekgym.et/webhook/YOUR_TOKEN
```

### 6. Test the Bot
- Send a message to your Telegram bot
- Check if it responds correctly
- Monitor the logs for any errors

## Troubleshooting

### Webhook Not Working?

1. **Check DNS propagation:**
   ```bash
   nslookup betbot.tatekgym.et
   # Should show your VPS IP address
   ```

2. **Check if site is accessible:**
   ```bash
   curl https://betbot.tatekgym.et/health
   # Should return: {"status":"ok","timestamp":"..."}
   ```

3. **Check Nginx is running:**
   ```bash
   sudo systemctl status nginx
   ```

4. **Check your Node.js app is running:**
   ```bash
   pm2 status
   # or
   ps aux | grep node
   ```

5. **Check Telegram webhook info:**
   ```bash
   curl https://api.telegram.org/bot<YOUR_TELEGRAM_TOKEN>/getWebhookInfo
   ```

6. **Check Nginx logs:**
   ```bash
   sudo tail -f /var/log/nginx/betbot-error.log
   sudo tail -f /var/log/nginx/betbot-access.log
   ```

7. **Check application logs:**
   ```bash
   pm2 logs betbot
   # or
   tail -f /path/to/betbot/output.log
   ```

### Common Issues:

**Issue: 502 Bad Gateway**
- Your Node.js app isn't running or crashed
- Check: `pm2 status` or `ps aux | grep node`
- Solution: Restart the app

**Issue: SSL/TLS errors**
- Set Cloudflare SSL/TLS mode to "Full" or "Full (strict)"
- If using "Full (strict)", install SSL certificate on VPS

**Issue: Webhook not receiving updates**
- Make sure Cloudflare proxy is OFF (DNS only - gray cloud)
- Check firewall allows incoming connections on port 443

**Issue: Connection timeout**
- Check VPS firewall: `sudo ufw status`
- Allow ports: `sudo ufw allow 80` and `sudo ufw allow 443`

### Clear Webhook and Start Fresh:
```bash
# Delete current webhook
curl https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook

# Restart your application
pm2 restart betbot

# Check webhook was set correctly
curl https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
```

## Files Modified
- `.env` - Updated WEBHOOK_URL
- `server.js` - Updated analytics URL display

## Current Configuration
- **New Webhook**: `https://betbot.tatekgym.et`
- **Port**: 7070
- **Analytics**: `https://betbot.tatekgym.et/analytics`
- **Health Check**: `https://betbot.tatekgym.et/health`
