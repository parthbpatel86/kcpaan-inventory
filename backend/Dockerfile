FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# SQLite DB path. On Render free tier this is ephemeral (resets on redeploy/sleep);
# attach a Render disk or switch to Postgres for durable persistence.
ENV KC_DB_PATH=/data/kcpaan.db

EXPOSE 5005

# Single worker: SQLite is file-based and a single instance keeps writes consistent
# and avoids a seed race on first boot.
CMD ["gunicorn", "--bind", "0.0.0.0:5005", "--workers", "1", "--timeout", "60", "app:app"]
