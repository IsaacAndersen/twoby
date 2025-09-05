# 🚀 Deployment Guide

Complete guide to deploy the Resident AI Survey app to Modal with custom domains.

## 📋 Prerequisites

1. **Modal Account**: Sign up at [modal.com](https://modal.com)
2. **Modal CLI**: Install and authenticate
   ```bash
   pip install modal
   modal setup
   ```
3. **Domain Access**: Ensure you can add DNS records for `ike.rs` domain
4. **API Password**: Choose a secure password for the results dashboard

## 🔧 1. Set Up Modal Secrets

Create the secrets that both backend and frontend will use:

```bash
modal secret create resident-survey-secrets \
  RESULTS_PASSWORD="your-super-secure-password-here" \
  DB_PATH="/vol/db/app.db" \
  ENVIRONMENT="production"
```

**Important**: Replace `"your-super-secure-password-here"` with a strong password for the results dashboard.

## 🌐 2. Configure Custom Domains

### Backend Domain (surveyapi.ike.rs)

1. **Deploy first** (to get Modal's SSL certificate):
   ```bash
   cd resident_survey_apps/backend
   modal deploy modal_entry.py
   ```

2. **Add DNS record**:
   ```
   Type: CNAME
   Name: surveyapi
   Value: resident-ai-survey-api--fastapi.modal.run
   TTL: 300
   ```

3. **Verify**: Check https://surveyapi.ike.rs/health

### Frontend Domain (survey.ike.rs)

1. **Deploy first** (to get Modal's SSL certificate):
   ```bash
   cd resident_survey_apps/frontend
   modal deploy modal_static.py
   ```

2. **Add DNS record**:
   ```
   Type: CNAME  
   Name: survey
   Value: resident-survey-frontend--serve-static.modal.run
   TTL: 300
   ```

3. **Verify**: Check https://survey.ike.rs

## 🔄 3. Deployment Steps

### Step 1: Deploy Backend

```bash
cd resident_survey_apps/backend

# Deploy the API
modal deploy modal_entry.py
```

**Expected output**:
```
✓ App deployed! View at: https://resident-ai-survey-api--fastapi.modal.run
✓ Custom domain: https://surveyapi.ike.rs
```

### Step 2: Deploy Frontend

```bash
cd resident_survey_apps/frontend

# Copy production environment
cp .env.example .env

# Deploy static frontend  
modal deploy modal_static.py
```

**Expected output**:
```
✓ Frontend built successfully!
✓ App deployed! View at: https://survey.ike.rs
```

## 🧪 4. Testing Deployment

### Backend Health Check
```bash
curl https://surveyapi.ike.rs/health
# Expected: {"status": "healthy", "service": "Resident AI Usage Survey API"}
```

### Frontend Access
1. Visit https://survey.ike.rs
2. Should see the home page with mobile bottom navigation
3. Try submitting a test survey
4. Check leaderboard updates

### Results Dashboard
1. Go to https://survey.ike.rs/results  
2. Enter the password you set in Modal secrets
3. Verify aggregated data displays

## 🔧 5. Environment Configuration

### Production Environment Variables

**Backend** (set in Modal secrets):
- `RESULTS_PASSWORD`: Password for results dashboard
- `DB_PATH`: `/vol/db/app.db` 
- `ENVIRONMENT`: `production`

**Frontend** (automatically set during build):
- `VITE_API_BASE`: `https://surveyapi.ike.rs`

### Development Override

For local development:

**Backend**:
```bash
export RESULTS_PASSWORD="dev-password"
export DB_PATH="./dev.db"
uvicorn app:app --reload --port 8000
```

**Frontend**:
```bash
# Create .env file
echo "VITE_API_BASE=http://localhost:8000" > .env
npm run dev
```

## 📊 6. Monitoring & Maintenance

### Check App Status
```bash
# List running apps
modal app list

# View logs
modal logs resident-ai-survey-api
modal logs resident-survey-frontend
```

### Database Access
The SQLite database persists in Modal Volume `resident-ai-survey-db`.

To backup or inspect:
```bash
# Run a one-off function to access the database
modal run backend/backup.py  # (create this file if needed)
```

### Warm Container Settings
Both apps are configured with:
- `min_containers=1` (always warm)
- `container_idle_timeout=300` (5 min timeout)
- This ensures fast response times but costs more

## 🔄 7. Updates & Redeployment

### Backend Updates
```bash
cd resident_survey_apps/backend
# Make your changes
modal deploy modal_entry.py --force
```

### Frontend Updates  
```bash
cd resident_survey_apps/frontend
# Make your changes
modal deploy modal_static.py --force
```

### Database Migrations
Database schema changes require manual migration:
1. Update the `init_db()` function in `app.py`
2. Add migration logic to handle existing data
3. Redeploy backend

## 🎯 8. QR Code Generation

For mobile access, generate QR codes pointing to:
- **Submit form**: `https://survey.ike.rs/submit`
- **Leaderboard**: `https://survey.ike.rs/leaderboard`

Use any QR code generator, print and post in:
- Resident workrooms
- Call rooms  
- Break areas
- Conference rooms

## 🚨 9. Troubleshooting

### Backend Issues
- **500 errors**: Check `modal logs resident-ai-survey-api`
- **CORS errors**: Verify frontend domain in CORS settings
- **Database errors**: Check volume mount and permissions

### Frontend Issues  
- **Blank page**: Check browser console, verify API connection
- **Build failures**: Check Node.js version compatibility
- **API connection**: Verify `VITE_API_BASE` environment variable

### Domain Issues
- **SSL cert problems**: Redeploy after DNS propagation (can take 24hrs)
- **DNS not resolving**: Check CNAME records and TTL settings
- **Modal domain mismatch**: Ensure custom domain matches exactly

## 🔐 10. Security Notes

- **Results password**: Store securely, share only with authorized staff
- **HTTPS only**: Both domains use SSL/TLS encryption
- **No user auth**: App is designed to be anonymous and public
- **Rate limiting**: Consider adding if abuse occurs
- **CORS**: Properly configured to only allow frontend domain

## 💰 11. Cost Optimization

Current setup with warm containers costs ~$10-20/month depending on usage.

To reduce costs:
- Set `min_containers=0` (but increases cold start times)
- Increase `container_idle_timeout` to reduce churn
- Monitor usage and scale accordingly

---

## 🆘 Quick Commands Reference

```bash
# Deploy everything
cd resident_survey_apps/backend && modal deploy modal_entry.py
cd ../frontend && modal deploy modal_static.py

# Check status  
modal app list

# View logs
modal logs resident-ai-survey-api
modal logs resident-survey-frontend

# Update secrets
modal secret update resident-survey-secrets RESULTS_PASSWORD="new-password"
```