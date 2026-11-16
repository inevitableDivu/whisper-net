#!/usr/bin/env bash
set -e

# ==============================================================================
# Script: generate-certs.sh
# Purpose: Generate self-signed TLS certificates with SAN for localhost and LAN IP
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERTS_DIR="${ROOT_DIR}/certs"

mkdir -p "${CERTS_DIR}"

CUSTOM_IP="${1:-${HOST_IP:-}}"

# Detect local IP if available
DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
TARGET_IP="${CUSTOM_IP:-${DETECTED_IP}}"

CONFIG_FILE="${CERTS_DIR}/openssl-san.cnf"

cat > "${CONFIG_FILE}" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = req_distinguished_name
x509_extensions = v3_req

[req_distinguished_name]
C = US
ST = Secure
L = Local
O = SecureChat Development
OU = Cryptographic Core
CN = localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = ${TARGET_IP}
EOF

echo "[Certs] Generating self-signed TLS certificates in ${CERTS_DIR}..."
openssl req -x509 -newkey rsa:2048 -nodes -sha256 \
  -keyout "${CERTS_DIR}/key.pem" \
  -out "${CERTS_DIR}/cert.pem" \
  -days 365 \
  -config "${CONFIG_FILE}"

rm -f "${CONFIG_FILE}"

echo "✅ Certificates successfully created:"
echo "   • ${CERTS_DIR}/cert.pem"
echo "   • ${CERTS_DIR}/key.pem"
echo "   • Configured for localhost, 127.0.0.1, and ${TARGET_IP}"
