# Makefile for building and deploying the real Vite frontend

.PHONY: build deploy clean

# Build the Vite frontend
build:
	@echo "Building Vite frontend..."
	npm run build
	@echo "Frontend built successfully in dist/"

# Generate Modal deployment with embedded assets
generate-modal:
	@echo "Generating Modal deployment with embedded assets..."
	python3 generate_modal_deployment.py

# Deploy to Modal
deploy: build generate-modal
	@echo "Deploying to Modal..."
	modal deploy modal_frontend_generated.py

# Clean build artifacts
clean:
	rm -rf dist/
	rm -f modal_frontend_generated.py

# Full build and deploy pipeline
all: clean build deploy

# Development build
dev-build:
	npm run build
	@echo "Development build complete"