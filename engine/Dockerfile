# Python engine service (stdlib HTTP, supervised worker)
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV ENGINE_PORT=8800
EXPOSE 8800
CMD ["python3", "engine/server.py"]