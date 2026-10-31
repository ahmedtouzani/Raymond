# Automatic deploy

Every push to `main` runs `.github/workflows/deploy.yml`:

1. `npm ci` + `npm test` on GitHub.
2. SSH to the VPS with a dedicated key. The key is locked to a forced command, so the
   only thing it can do is run `deploy.sh <sha>`.
3. `deploy.sh` (on the server, as root through one sudoers rule):
   fetch that exact commit → `docker build -t raymond:<sha12>` (the build runs `npm test`)
   → `pg_dump` to `backups/pre-deploy-*.dump` (last 10 kept) → `docker compose up -d bot`
   → wait up to 60 s for `Ready! Logged in as` in `logs/combined.log` with no new
   `"level":"error"` lines → otherwise roll back to the previous image.

Only one deploy runs at a time (`concurrency` in Actions + `flock` on the server).
Migrations run when the bot starts (`npm start`). A rollback restarts the old image but
does **not** undo migrations; restore from the pre-deploy dump if that is ever needed.

## One-time setup

### On the server (as `vpsadmin`)

```bash
# 1. Dedicated user with no shell access beyond the forced command
sudo adduser --system --group --shell /bin/bash --home /home/raymond-deploy raymond-deploy

# 2. Install the deploy script, root-owned so the deploy user cannot change it
sudo install -o root -g root -m 755 deploy/deploy.sh /opt/apps/raymond/deploy.sh

# 3. Allow exactly that script through sudo, nothing else
echo 'raymond-deploy ALL=(root) NOPASSWD: /opt/apps/raymond/deploy.sh' \
  | sudo tee /etc/sudoers.d/raymond-deploy && sudo chmod 440 /etc/sudoers.d/raymond-deploy
sudo visudo -c

# 4. Generate the key pair (keep the private key only long enough to paste it into GitHub)
ssh-keygen -t ed25519 -N '' -C github-actions-raymond -f /tmp/raymond_deploy

# 5. Authorize the public key with a forced command and no forwarding/pty
sudo install -d -o raymond-deploy -g raymond-deploy -m 700 /home/raymond-deploy/.ssh
echo "command=\"sudo -n /opt/apps/raymond/deploy.sh \\\"\$SSH_ORIGINAL_COMMAND\\\"\",restrict $(cat /tmp/raymond_deploy.pub)" \
  | sudo tee /home/raymond-deploy/.ssh/authorized_keys
sudo chown raymond-deploy:raymond-deploy /home/raymond-deploy/.ssh/authorized_keys
sudo chmod 600 /home/raymond-deploy/.ssh/authorized_keys

# 6. Use the compose file from the repo (only change: image tag comes from RAYMOND_TAG)
sudo cp /opt/apps/raymond/compose.yaml /opt/apps/raymond/compose.yaml.bak
sudo install -m 644 compose.yaml /opt/apps/raymond/compose.yaml
```

`deploy.sh` validates its argument as a 40-character hex SHA, so the forced command
cannot be used to run anything else.

### In GitHub → Settings → Environments → `production` → secrets

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_KEY` | contents of `/tmp/raymond_deploy` (then `shred -u /tmp/raymond_deploy`) |
| `DEPLOY_HOST` | `76.13.33.190` |
| `DEPLOY_USER` | `raymond-deploy` |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 76.13.33.190`, checked against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server |

## Manual deploy / check

```bash
ssh hostinger-vps 'sudo /opt/apps/raymond/deploy.sh <full-sha>'
ssh hostinger-vps 'sudo docker ps --format "{{.Names}} {{.Image}} {{.Status}}"'
```
