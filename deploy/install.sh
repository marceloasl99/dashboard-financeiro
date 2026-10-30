#!/usr/bin/env bash
# Finance OS — instalação no Ubuntu (22.04+/24.04) com nginx + systemd.
# Uso: sudo bash deploy/install.sh            (a partir da pasta do repositório clonado)
#      sudo bash deploy/install.sh --demo     (carrega dados fictícios para avaliar)
set -euo pipefail

APP_DIR=/opt/finance-os
APP_USER=finance
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO=0
[[ "${1:-}" == "--demo" ]] && DEMO=1

if [[ $EUID -ne 0 ]]; then echo "Execute com sudo."; exit 1; fi

echo "==> Pacotes do sistema"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip nginx rsync >/dev/null

echo "==> Usuário de serviço '$APP_USER'"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

echo "==> Código em $APP_DIR"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude '.git' --exclude '.venv' --exclude 'data' --exclude 'legacy' --exclude 'docs' \
  --exclude '__pycache__' --exclude '.pytest_cache' --exclude '.superpowers' \
  "$SRC_DIR/" "$APP_DIR/"
mkdir -p "$APP_DIR/data/backups"

echo "==> Ambiente Python"
if [[ ! -x "$APP_DIR/.venv/bin/python" ]]; then
  python3 -m venv "$APP_DIR/.venv"
fi
"$APP_DIR/.venv/bin/pip" install -q --upgrade pip
"$APP_DIR/.venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"

if [[ $DEMO -eq 1 && ! -f "$APP_DIR/data/finance.json" ]]; then
  echo "==> Dados de demonstração"
  (cd "$APP_DIR" && .venv/bin/python scripts/demo_data.py --out data/finance.json)
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Serviço systemd"
install -m 644 "$APP_DIR/deploy/finance.service" /etc/systemd/system/finance.service
systemctl daemon-reload
systemctl enable --now finance
systemctl restart finance

echo "==> nginx"
install -m 644 "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/finance-os
ln -sf /etc/nginx/sites-available/finance-os /etc/nginx/sites-enabled/finance-os
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

sleep 1
if curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then
  echo
  echo "Pronto. Abra http://$(hostname -I | awk '{print $1}')/ no navegador."
  echo "Dados em $APP_DIR/data/finance.json (backups diários em data/backups/)."
  echo "Logs: journalctl -u finance -f"
else
  echo "O serviço não respondeu. Veja: journalctl -u finance -n 50"
  exit 1
fi
