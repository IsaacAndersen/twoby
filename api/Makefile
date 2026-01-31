.PHONY: install test run dev build docker-build docker-run clean lint format coverage

install:
	pip install -r requirements.txt

test:
	pytest test_app.py -v

coverage:
	pytest test_app.py --cov=. --cov-report=term-missing --cov-report=html

# Local development
run:
	uvicorn app:app --reload --host 0.0.0.0 --port 8000

dev:
	uvicorn app:app --reload --host 0.0.0.0 --port 8000

# Docker commands
docker-build:
	docker build -t twoby-api .

docker-run:
	docker run -p 8080:8080 \
		-e DATABASE_URL="$(DATABASE_URL)" \
		-e PEPPER="$(PEPPER)" \
		-e OPENAI_API_KEY="$(OPENAI_API_KEY)" \
		-e GOOGLE_API_KEY="$(GOOGLE_API_KEY)" \
		-e GOOGLE_CSE_ID="$(GOOGLE_CSE_ID)" \
		twoby-api

# Cleanup
clean:
	rm -f twoby_local.db twoby_local.db-wal twoby_local.db-shm
	rm -rf __pycache__ .pytest_cache htmlcov .coverage
	find . -type f -name "*.pyc" -delete

lint:
	ruff check .

format:
	black .
