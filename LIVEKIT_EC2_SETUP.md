# LiveKit on AWS EC2 Setup

This project now includes backend routes and frontend pages for a premium LiveKit-based live class system.

Backend endpoints added:

- `POST /api/class/start-server`
- `POST /api/class/stop-server`
- `GET /api/class/server-status`
- `GET /api/livekit/teacher-token?classId=...`
- `GET /api/livekit/student-token?classId=...`
- `GET /api/livekit/admin/workspace`
- `GET /api/livekit/student/workspace`

Frontend routes added:

- `/admin/live-classes`
- `/admin/live-classes/:classId/studio`
- `/student/live-classes`
- `/student/live-classes/:classId`

## 1. AWS EC2 Setup

1. Open AWS Console.
2. Go to EC2.
3. Choose Mumbai region: `ap-south-1`.
4. Launch a new instance.
5. Select image: `Ubuntu Server 22.04 LTS` or `Ubuntu Server 24.04 LTS`.
6. Select instance type: `t3.medium`.
7. Create or choose an existing key pair and download the `.pem` file.
8. Allow these inbound ports in the security group:
   - `22` TCP
   - `80` TCP
   - `443` TCP
   - `7880` TCP
   - `7881` TCP
   - `7882` TCP/UDP
   - `50000-60000` UDP
9. Launch the instance.

## 2. SSH Into EC2

From your local machine:

```bash
chmod 400 /path/to/your-key.pem
ssh -i /path/to/your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

For the current BiomicsHub EC2 instance:

```bash
chmod 400 ~/Downloads/biomicshub.pem
ssh -i ~/Downloads/biomicshub.pem ubuntu@15.206.157.173
```

## 3. Install Node.js 18

Run these commands on Ubuntu:

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs nginx snapd redis-server
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
```

`redis-server` is included because the LiveKit config in this project uses local Redis.

`pm2` is not required for the final EC2 deployment. The validated production setup below uses a native `systemd` service for `livekit-server`.

Verify:

```bash
node -v
npm -v
nginx -v
certbot --version
```

## 4. Install LiveKit Server

Use the single curl installer command:

```bash
curl -sSL https://get.livekit.io | bash
```

Verify:

```bash
livekit-server --help
```

## 5. Create LiveKit Config

Create the config file:

```bash
sudo mkdir -p /etc/livekit
sudo nano /etc/livekit/livekit.yaml
```

Use this config template:

```yaml
port: 7880
bind_addresses:
  - "0.0.0.0"

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true

redis:
  address: "localhost:6379"

keys:
  YOUR_LIVEKIT_API_KEY: YOUR_LIVEKIT_API_SECRET

room:
  auto_create: true
  max_participants: 101

logging:
  level: info
```

An example file is included in this repo at [deployment/livekit/livekit.yaml.example](/Users/subhashis/Desktop/BiomicsHubwebapp/deployment/livekit/livekit.yaml.example).

## 6. Run LiveKit With systemd

Create the service file:

```bash
sudo nano /etc/systemd/system/biomics-livekit.service
```

Use this content:

```ini
[Unit]
Description=Biomics LiveKit Server
After=network.target redis-server.service
Wants=redis-server.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu
ExecStart=/usr/local/bin/livekit-server --config /etc/livekit/livekit.yaml
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now biomics-livekit
```

Useful checks:

```bash
systemctl status biomics-livekit --no-pager
journalctl -u biomics-livekit --no-pager -n 80
ss -lntup | grep -E ':7880|:7881|:6379'
```

This is the validated form running on the current EC2 host.

## 7. Configure Nginx Reverse Proxy

Create the site config:

```bash
sudo nano /etc/nginx/sites-available/livekit.biomicshub.com
```

Use this config:

```nginx
server {
    listen 80;
    server_name livekit.biomicshub.com;

    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

An example file is included in this repo at [deployment/livekit/livekit.biomicshub.com.nginx.conf](/Users/subhashis/Desktop/BiomicsHubwebapp/deployment/livekit/livekit.biomicshub.com.nginx.conf).

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/livekit.biomicshub.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 8. Install SSL With Certbot

Point the DNS A record for `livekit.biomicshub.com` to the EC2 public IP first.

Then run:

```bash
sudo certbot --nginx -d livekit.biomicshub.com
```

Confirm renewal:

```bash
sudo certbot renew --dry-run
```

## 9. Backend Environment Variables

Add these to [backend/.env](/Users/subhashis/Desktop/BiomicsHubwebapp/backend/.env):

```env
AWS_ACCESS_KEY=your_aws_access_key
AWS_SECRET_KEY=your_aws_secret_key
AWS_REGION=ap-south-1
EC2_INSTANCE_ID=i-xxxxxxxxxxxxxxxxx

LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
LIVEKIT_URL=wss://livekit.biomicshub.com
```

Note:

- `LIVEKIT_URL` should be the public secure websocket URL used by clients.
- If you prefer HTTPS origin form in your environment, keep it consistent with your deployed frontend and backend. The current frontend code expects the configured `LIVEKIT_URL` returned by the backend.
- For temporary IP-based testing on the current EC2 box, use `LIVEKIT_URL=ws://15.206.157.173`. Nginx already proxies port `80` to the LiveKit service.
- Direct public access to port `7880` may still be blocked by the EC2 security group, so the IP-based test URL should go through Nginx rather than `ws://15.206.157.173:7880`.

## 10. App Flow

Admin flow:

1. Open `/admin/live-classes`
2. Create a class session
3. Grant premium access to students if needed
4. Optionally block calendar slots
5. Open teacher studio
6. Click `Start Class`
7. Backend calls `POST /api/class/start-server`
8. Frontend waits 60 seconds when EC2 is booting
9. Backend activates the class and returns a teacher LiveKit token
10. Teacher joins with video and audio on

Student flow:

1. Open `/student/live-classes`
2. Student sees premium access state
3. Student sees upcoming class schedule and blocked calendar slots
4. When a class is live, the student room auto-fetches the LiveKit token and connects
5. Student joins with microphone only and no camera publishing

## 11. Polling Over LiveKit DataChannel

Teacher:

- Creates question and options A/B/C/D
- Publishes poll JSON over LiveKit DataChannel
- Receives answers from students over the same channel
- Sees live bar chart updates
- Can reveal the correct answer

Student:

- Sees poll popup instantly
- Chooses one answer
- Sends answer over DataChannel
- Sees reveal when teacher ends the poll

## 12. Local Project Install Commands

From the repo root:

```bash
npm --prefix backend install
npm --prefix frontend install
```

Run backend:

```bash
npm --prefix backend run dev
```

Run frontend:

```bash
npm --prefix frontend run dev
```

Build frontend:

```bash
npm run build
```

## 13. Important Implementation Note

The requested student permission combination of `canPublish false` plus microphone-on is not valid in practical LiveKit usage, because microphone publishing also requires publish permission.

The implemented student token therefore uses:

- subscribe enabled
- data publish enabled
- publish enabled only for microphone source

That keeps the student camera off while still allowing audio and polls.