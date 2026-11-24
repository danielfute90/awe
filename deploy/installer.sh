#!/usr/bin/env bash
# =====================================================================
# Installation / mise à jour d'Awé sur le serveur (Ubuntu, Oracle Cloud).
# Lancé automatiquement par deploy/envoyer.ps1. Peut être relancé sans risque.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/5 Mémoire d'appoint (swap), utile sur les petites machines"
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> 2/5 Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi

echo "==> 3/5 Pare-feu de la machine : ouverture des ports 80 et 443 (web)"
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save >/dev/null 2>&1 || true; fi

echo "==> 4/5 Dossiers de données"
mkdir -p data storage
sudo chown -R 1000:1000 data storage # l'utilisateur "node" du conteneur

echo "==> 5/5 Construction et démarrage (la première fois : 5 à 10 minutes)"
sudo docker compose up -d --build
sudo docker image prune -f >/dev/null

DOMAINE=$(grep -E '^DOMAINE=' .env | cut -d= -f2)
echo "Attente du démarrage d'Awé..."
for i in $(seq 1 60); do
  if sudo docker compose exec -T awe node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo ""
    echo "============================================================"
    echo " Awé est en ligne : https://$DOMAINE"
    echo " (le certificat HTTPS peut prendre 1 minute la première fois)"
    echo "============================================================"
    exit 0
  fi
  sleep 5
done
echo "Awé ne répond pas encore. Derniers messages :"
sudo docker compose logs --tail 40 awe
exit 1
