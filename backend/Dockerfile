FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Persist the SQLite DB on a mounted disk in production.
ENV KC_DB_PATH=/data/kcpaan.db

EXPOSE 5005

CMD ["gunicorn", "--bind", "0.0.0.0:5005", "--workers", "2", "app:app"]
