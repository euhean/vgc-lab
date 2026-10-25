FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app
EXPOSE 8000
# Apply pending migrations, then start the API.
# Hosting platforms pass the port in $PORT; locally it defaults to 8000.
# --proxy-headers makes the client IP (used by the login rate limit) come from the hosting proxy.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'
