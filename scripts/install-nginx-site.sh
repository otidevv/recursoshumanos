#!/usr/bin/env bash
set -euo pipefail

SRC="/tmp/recursoshumanos.unamad.edu.pe.nginx"
SITE_NAME="recursoshumanos.unamad.edu.pe"
AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"

if [[ ! -f "${SRC}" ]]; then
  echo "ERROR: no existe ${SRC}" >&2
  exit 1
fi

echo "[1/4] Copiando config a ${AVAILABLE}"
sudo install -m 644 "${SRC}" "${AVAILABLE}"

echo "[2/4] Habilitando site (symlink en sites-enabled)"
sudo ln -sf "${AVAILABLE}" "${ENABLED}"

echo "[3/4] Validando sintaxis nginx"
sudo nginx -t

echo "[4/4] Recargando nginx"
sudo systemctl reload nginx

echo "OK: ${SITE_NAME} instalado y nginx recargado."
