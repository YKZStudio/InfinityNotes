FROM python:3.12-slim
WORKDIR /app
COPY server /app/server
COPY client /app/client
RUN useradd --uid 10001 --create-home infinity && mkdir /data && chown infinity:infinity /data
USER infinity
EXPOSE 8787
CMD ["python", "server/app.py", "--host", "0.0.0.0", "--port", "8787", "--data", "/data"]
