"""
Microserviço Python para geração de embeddings.
Carrega o modelo all-MiniLM-L6-v2 uma vez e serve via HTTP.
Porta: 5001 (local apenas)
"""
import os
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

# Carregar modelo ao iniciar
print("Carregando modelo de embeddings...", flush=True)
try:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('all-MiniLM-L6-v2')
    print("✅ Modelo carregado!", flush=True)
except Exception as e:
    print(f"❌ Erro ao carregar modelo: {e}", flush=True)
    sys.exit(1)

class EmbeddingHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silenciar logs de acesso
    
    def do_POST(self):
        if self.path == '/embed':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            try:
                data = json.loads(body)
                texts = data.get('texts', [])
                if not texts:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b'{"error": "texts required"}')
                    return
                
                # Gerar embeddings
                embeddings = model.encode(texts, show_progress_bar=False)
                result = {
                    "embeddings": embeddings.tolist(),
                    "dim": embeddings.shape[1]
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
                
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "ok", "model": "all-MiniLM-L6-v2"}')
        else:
            self.send_response(404)
            self.end_headers()

PORT = int(os.environ.get('EMBEDDING_SERVICE_PORT', '5001'))

print(f"Iniciando servidor na porta {PORT}...", flush=True)
server = HTTPServer(('127.0.0.1', PORT), EmbeddingHandler)
print(f"✅ Embedding service rodando em http://127.0.0.1:{PORT}", flush=True)
server.serve_forever()
