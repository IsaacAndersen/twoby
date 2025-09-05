# Makefile for Resident Survey Frontend

.PHONY: build deploy clean generate-modal dev-build install

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm install

# Development build
dev-build:
	@echo "🔧 Building React app for development..."
	npm run build
	@echo "✅ Development build complete in dist/"

# Production build with optimizations
build:
	@echo "🚀 Building React app for production..."
	npm run build
	@echo "✅ Production build complete in dist/"
	@echo "📊 Build stats:"
	@ls -lah dist/

# Generate Modal deployment file with embedded assets
generate-modal:
	@echo "🔧 Generating Modal deployment with embedded React assets..."
	python3 generate_modal_deployment.py

# Deploy to Modal
deploy: build generate-modal
	@echo "🚀 Deploying frontend to Modal (survey.ike.rs)..."
	modal deploy modal_frontend_generated.py

# Clean build artifacts and generated files
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist/
	rm -f modal_frontend_generated.py
	@echo "✅ Clean complete"

# Full pipeline: clean, build, and deploy
all: clean install build deploy

# Quick deploy (assumes build is current)
quick-deploy: generate-modal
	@echo "⚡ Quick deploying frontend..."
	modal deploy modal_frontend_generated.py

# Development server
dev:
	@echo "🔧 Starting development server..."
	npm run dev

# Show build info
info:
	@echo "📊 Frontend Build Information:"
	@echo "  📁 Build directory: ./dist/"
	@echo "  🌐 Production URL: https://survey.ike.rs"
	@echo "  📦 Generated file: modal_frontend_generated.py"
	@if [ -d "./dist" ]; then \
		echo "  📈 Current build:"; \
		ls -la dist/; \
	else \
		echo "  ❌ No build found - run 'make build' first"; \
	fi

# Help
help:
	@echo "🏥 Resident Survey Frontend - Available Commands:"
	@echo ""
	@echo "  📦 install        - Install npm dependencies"
	@echo "  🔧 build          - Build React app for production"
	@echo "  🔧 dev-build      - Build React app for development" 
	@echo "  🚀 generate-modal - Generate Modal deployment file"
	@echo "  🚀 deploy         - Full build and deploy to Modal"
	@echo "  ⚡ quick-deploy   - Deploy without rebuilding"
	@echo "  🧹 clean          - Remove build artifacts"
	@echo "  🔄 all            - Clean, install, build, and deploy"
	@echo "  🔧 dev            - Start development server"
	@echo "  📊 info           - Show build information"
	@echo "  ❓ help           - Show this help message"
	@echo ""
	@echo "🌐 Production URL: https://survey.ike.rs"