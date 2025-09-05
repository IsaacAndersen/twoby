#!/bin/bash

# Script to set up Modal secrets for the Resident Survey App

echo "🔧 Setting up Modal secrets for Resident Survey App..."

# Check if password is provided
if [ -z "$1" ]; then
    echo "❌ Error: Please provide a password for the results dashboard"
    echo "Usage: ./setup_secrets.sh 'your-super-secure-password'"
    exit 1
fi

RESULTS_PASSWORD=$1

echo "Creating Modal secret with the following configuration:"
echo "  - RESULTS_PASSWORD: [hidden]"
echo "  - DB_PATH: /vol/db/app.db"
echo "  - ENVIRONMENT: production"
echo ""

# Create the Modal secret
modal secret create resident-survey-secrets \
  RESULTS_PASSWORD="$RESULTS_PASSWORD" \
  DB_PATH="/vol/db/app.db" \
  ENVIRONMENT="production"

if [ $? -eq 0 ]; then
    echo "✅ Modal secrets created successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Deploy backend: cd backend && modal deploy modal_entry.py"
    echo "2. Deploy frontend: cd frontend && modal deploy modal_static.py"
    echo "3. Configure DNS records as shown in DEPLOYMENT.md"
else
    echo "❌ Failed to create Modal secrets"
    exit 1
fi