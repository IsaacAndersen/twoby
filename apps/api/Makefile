.PHONY: install test run deploy serve clean lint format coverage

install:
	pip install -r requirements.txt

test:
	pytest test_app.py -v

coverage:
	pytest test_app.py --cov=. --cov-report=term-missing --cov-report=html

run:
	python3 run_local.py

serve:
	modal serve modal_app.py

deploy:
	modal deploy modal_api.py

clean:
	rm -f twoby_local.db
	rm -rf __pycache__ .pytest_cache htmlcov .coverage
	find . -type f -name "*.pyc" -delete

lint:
	ruff check .

format:
	black .