#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRED_DIR="$ROOT/credentials"
KEYSTORE="$CRED_DIR/biomicshub-upload.keystore"
PROPS="$ROOT/android/keystore.properties"
ALIAS="biomicshub-upload"

if [[ -f "$KEYSTORE" ]]; then
  echo "Upload keystore already exists: $KEYSTORE"
  echo "Delete it first if you want to generate a new one."
  exit 1
fi

mkdir -p "$CRED_DIR"

read -r -s -p "Choose a keystore password (min 6 chars): " STORE_PASS
echo
read -r -s -p "Confirm keystore password: " STORE_PASS_2
echo

if [[ "$STORE_PASS" != "$STORE_PASS_2" ]]; then
  echo "Passwords do not match."
  exit 1
fi

if [[ ${#STORE_PASS} -lt 6 ]]; then
  echo "Password too short."
  exit 1
fi

KEY_PASS="$STORE_PASS"

keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STORE_PASS" \
  -keypass "$KEY_PASS" \
  -dname "CN=BiomicsHub, OU=Mobile, O=BiomicsHub, L=Kolkata, ST=West Bengal, C=IN"

cat > "$PROPS" <<EOF
storeFile=../credentials/biomicshub-upload.keystore
storePassword=$STORE_PASS
keyAlias=$ALIAS
keyPassword=$KEY_PASS
EOF

chmod 600 "$PROPS" "$KEYSTORE"

echo
echo "Created upload keystore:"
echo "  $KEYSTORE"
echo "  $PROPS"
echo
echo "IMPORTANT — back up both files somewhere safe (1Password / USB)."
echo "If you lose the keystore, you cannot update the app on Play Store."
echo
echo "Upload keystore SHA-1 (register in Google Cloud + Firebase):"
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$STORE_PASS" | grep -E "SHA1|SHA256"
