# Makefile for Resident AI Survey Apps - Full Stack Deployment

.PHONY: deploy-all deploy-frontend deploy-backend test clean help

# Deploy both frontend and backend
deploy-all:
	@echo "🚀 Deploying complete Resident Survey application..."
	@echo ""
	@echo "📡 Step 1: Deploying backend API..."
	@cd backend && make deploy
	@echo ""
	@echo "🌐 Step 2: Deploying frontend React app..."
	@cd frontend && make deploy
	@echo ""
	@echo "✅ Full deployment complete!"
	@echo "🌐 Frontend: https://survey.ike.rs"
	@echo "📡 Backend API: https://surveyapi.ike.rs"
	@echo "📚 API Docs: https://surveyapi.ike.rs/docs"

# Deploy only frontend
deploy-frontend:
	@echo "🌐 Deploying frontend..."
	@cd frontend && make deploy

# Deploy only backend  
deploy-backend:
	@echo "📡 Deploying backend..."
	@cd backend && make deploy

# Test both services
test:
	@echo "🔍 Testing full application stack..."
	@echo ""
	@echo "📡 Testing backend API..."
	@cd backend && make test
	@echo ""
	@echo "🌐 Testing frontend availability..."
	@curl -s -o /dev/null -w "Frontend Status: %{http_code}\n" https://survey.ike.rs || echo "❌ Frontend test failed"

# Clean all build artifacts
clean:
	@echo "🧹 Cleaning all build artifacts..."
	@cd frontend && make clean
	@echo "✅ All clean!"

# Development setup
setup:
	@echo "🔧 Setting up development environment..."
	@echo "📦 Installing frontend dependencies..."
	@cd frontend && make install
	@echo "✅ Setup complete!"

# Show project status
status:
	@echo "📊 Resident Survey Apps - Project Status"
	@echo ""
	@echo "🌐 Frontend (React + Vite):"
	@echo "  URL: https://survey.ike.rs"
	@cd frontend && make info
	@echo ""
	@echo "📡 Backend (FastAPI + SQLite):"
	@echo "  URL: https://surveyapi.ike.rs" 
	@echo "  Docs: https://surveyapi.ike.rs/docs"
	@cd backend && make status

# Development commands
dev-frontend:
	@echo "🔧 Starting frontend development server..."
	@cd frontend && make dev

# Quick deploy (assumes builds are current)
quick-deploy:
	@echo "⚡ Quick deploying both services..."
	@cd backend && make deploy
	@cd frontend && make quick-deploy

# Help
help:
	@echo "🏥 Resident AI Survey Apps - Full Stack Commands:"
	@echo ""
	@echo "🚀 Deployment:"
	@echo "  deploy-all       - Deploy both frontend and backend"
	@echo "  deploy-frontend  - Deploy only React frontend"  
	@echo "  deploy-backend   - Deploy only FastAPI backend"
	@echo "  quick-deploy     - Quick deploy (no rebuild)"
	@echo ""
	@echo "🔧 Development:"
	@echo "  setup            - Install dependencies and setup"
	@echo "  dev-frontend     - Start frontend development server"
	@echo "  clean            - Clean all build artifacts"
	@echo ""
	@echo "🔍 Testing & Status:"
	@echo "  test             - Test both frontend and backend"
	@echo "  status           - Show project status"
	@echo "  help             - Show this help"
	@echo ""
	@echo "🌐 Production URLs:"
	@echo "  Frontend: https://survey.ike.rs"
	@echo "  Backend:  https://surveyapi.ike.rs"
	@echo "  API Docs: https://surveyapi.ike.rs/docs"
	@echo ""
	@echo "📁 Project Structure:"
	@echo "  backend/   - FastAPI + SQLite backend"  
	@echo "  frontend/  - React + Vite frontend"