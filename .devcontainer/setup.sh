#!/usr/bin/env bash
set -euo pipefail

echo ">>> Installing Solana CLI (Anza stable)..."
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

SOLANA_PATH='export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"'
if ! grep -qxF "$SOLANA_PATH" "$HOME/.bashrc"; then
  echo "$SOLANA_PATH" >> "$HOME/.bashrc"
fi
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

echo ">>> Installing Anchor Version Manager (avm)..."
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

echo ">>> Installing Anchor 0.30.1..."
avm install 0.30.1
avm use 0.30.1

echo ">>> Configuring Solana for devnet..."
solana config set --url devnet

if [ ! -f "$HOME/.config/solana/id.json" ]; then
  echo ">>> Generating devnet keypair..."
  solana-keygen new --no-bip39-passphrase --silent
fi

echo ">>> Installing web dependencies..."
(cd web && npm install --no-audit --no-fund)

echo ">>> Installing root test dependencies..."
npm install --no-audit --no-fund

cat <<EOF

=============================================
Dev environment ready.

  Wallet:   $(solana address)
  Cluster:  devnet

Next steps:
  1. solana airdrop 2
  2. anchor build
  3. anchor keys sync       # writes real program ID into Anchor.toml + lib.rs
  4. anchor build           # rebuild with the real ID
  5. anchor deploy --provider.cluster devnet
  6. Copy the program ID printed by step 5 into Vercel env:
     Settings -> Environment Variables -> TIP_VAULT_PROGRAM_ID
=============================================
EOF
