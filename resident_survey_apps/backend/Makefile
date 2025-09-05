# Makefile for Resident Survey Backend API

.PHONY: deploy test clean dev logs

# Deploy to Modal
deploy:
	@echo "🚀 Deploying backend API to Modal (surveyapi.ike.rs)..."
	modal deploy modal_all.py::modal_app

# Test the deployed API
test:
	@echo "🔍 Testing deployed API endpoints..."
	@echo ""
	@echo "📊 Health check:"
	@curl -s https://surveyapi.ike.rs/health | python3 -m json.tool || echo "❌ Health check failed"
	@echo ""
	@echo "📊 Database stats:"
	@curl -s https://surveyapi.ike.rs/stats | python3 -m json.tool || echo "❌ Stats check failed"
	@echo ""
	@echo "🏆 Leaderboard:"
	@curl -s https://surveyapi.ike.rs/leaderboard | python3 -m json.tool || echo "❌ Leaderboard check failed"

# Test API with sample data
test-submit:
	@echo "📝 Testing survey submission..."
	@curl -X POST https://surveyapi.ike.rs/submit \
		-H "Content-Type: application/json" \
		-d '{"rotation":"Test Rotation","ai_tools":[{"name":"Claude","frequency":"daily","use_cases":["documentation"]}],"concerns":["accuracy"],"additional_tools":"None","comments":"Test submission"}' \
		| python3 -m json.tool || echo "❌ Submission test failed"

# View Modal logs
logs:
	@echo "📋 Viewing Modal logs..."
	modal logs resident-survey-backend

# Clean up and redeploy
clean-deploy: 
	@echo "🧹 Clean deploying backend..."
	modal deploy modal_all.py::modal_app --force

# Development mode - show app info
dev:
	@echo "🔧 Development Information:"
	@echo "  📁 Main file: modal_all.py"  
	@echo "  🌐 Production URL: https://surveyapi.ike.rs"
	@echo "  🗄️ Database: SQLite with Modal volume"
	@echo "  🔐 Secrets: resident-survey-secrets"
	@echo ""
	@echo "🔧 To develop locally:"
	@echo "  1. Run 'modal run modal_all.py' for local testing"
	@echo "  2. API will be available at local Modal URL"

# Show API documentation
docs:
	@echo "📚 API Documentation:"
	@echo "  🌐 Interactive docs: https://surveyapi.ike.rs/docs"
	@echo "  📊 Health endpoint: https://surveyapi.ike.rs/health"
	@echo "  📈 Stats endpoint: https://surveyapi.ike.rs/stats"
	@echo "  🏆 Leaderboard: https://surveyapi.ike.rs/leaderboard"
	@echo "  📝 Submit survey: POST https://surveyapi.ike.rs/submit"
	@echo "  📊 Results (auth): https://surveyapi.ike.rs/results"

# Check Modal app status
status:
	@echo "📊 Checking Modal app status..."
	modal app list | grep resident-survey || echo "❌ App not found"

# Help
help:
	@echo "🏥 Resident Survey Backend API - Available Commands:"
	@echo ""
	@echo "  🚀 deploy        - Deploy API to Modal"
	@echo "  🔍 test          - Test deployed API endpoints"
	@echo "  📝 test-submit   - Test survey submission with sample data"
	@echo "  📋 logs          - View Modal application logs"
	@echo "  🧹 clean-deploy  - Force redeploy"
	@echo "  🔧 dev           - Show development information"
	@echo "  📚 docs          - Show API documentation URLs"
	@echo "  📊 status        - Check Modal app status"
	@echo "  ❓ help          - Show this help message"
	@echo ""
	@echo "🌐 Production URL: https://surveyapi.ike.rs"
	@echo "📚 API Docs: https://surveyapi.ike.rs/docs"