# Makefile for building the Vite frontend

.PHONY: build dev preview clean install

# Install dependencies
install:
	npm install

# Development server
dev:
	npm run dev

# Build for production
build:
	@echo "Building Vite frontend..."
	npm run build
	@echo "Frontend built successfully in dist/"

# Preview production build locally
preview:
	npm run preview

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf node_modules/.vite

# Lint
lint:
	npm run lint
