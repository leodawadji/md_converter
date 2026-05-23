#!/usr/bin/env bash
# Setup script para as dependências de transcrição de YouTube com diarização
# Compatível com macOS e Linux (incluindo WSL no Windows)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }

echo ""
echo "========================================="
echo "  Setup: Transcrição YouTube + WhisperX"
echo "========================================="
echo ""

# ── 1. Python 3 ──────────────────────────────
if command -v python3 &>/dev/null; then
  PYTHON_VERSION=$(python3 --version 2>&1)
  info "Python encontrado: $PYTHON_VERSION"
else
  error "Python 3 não encontrado. Instale em https://python.org"
fi

# ── 2. pip ───────────────────────────────────
if ! python3 -m pip --version &>/dev/null; then
  warn "pip não encontrado. Tentando instalar..."
  python3 -m ensurepip --upgrade || error "Falha ao instalar pip."
fi

# ── 3. ffmpeg ────────────────────────────────
if command -v ffmpeg &>/dev/null; then
  info "ffmpeg já instalado."
else
  warn "ffmpeg não encontrado. Tentando instalar..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    command -v brew &>/dev/null && brew install ffmpeg || error "Instale o Homebrew primeiro: https://brew.sh"
  elif [[ -f /etc/debian_version ]]; then
    sudo apt-get update && sudo apt-get install -y ffmpeg
  elif [[ -f /etc/redhat-release ]]; then
    sudo dnf install -y ffmpeg || sudo yum install -y ffmpeg
  else
    error "Instale o ffmpeg manualmente: https://ffmpeg.org/download.html"
  fi
fi

# ── 4. yt-dlp ────────────────────────────────
if command -v yt-dlp &>/dev/null; then
  info "yt-dlp já instalado."
else
  info "Instalando yt-dlp..."
  python3 -m pip install -U yt-dlp
fi

# ── 5. PyTorch (CPU) ─────────────────────────
info "Instalando PyTorch (versão CPU)..."
python3 -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# ── 6. WhisperX ──────────────────────────────
info "Instalando WhisperX..."
python3 -m pip install whisperx

# ── 7. HF_TOKEN ──────────────────────────────
echo ""
if [[ -z "$HF_TOKEN" ]]; then
  warn "Variável HF_TOKEN não definida."
  echo "  A diarização de falantes requer um token do HuggingFace."
  echo "  1. Crie uma conta em https://huggingface.co"
  echo "  2. Aceite os termos de uso do modelo pyannote/speaker-diarization-3.1"
  echo "     https://huggingface.co/pyannote/speaker-diarization-3.1"
  echo "  3. Gere um token em https://huggingface.co/settings/tokens"
  echo "  4. Exporte antes de rodar: export HF_TOKEN=hf_xxxxxxxxxxxx"
  echo "     Ou crie um arquivo .env.local na raiz do projeto:"
  echo "     echo 'HF_TOKEN=hf_xxxxxxxxxxxx' >> .env.local"
else
  info "HF_TOKEN detectado."
fi

# ── 8. Teste rápido ──────────────────────────
echo ""
info "Verificando instalação..."
python3 -c "import whisperx; print('whisperx OK')" && info "WhisperX importado com sucesso." || warn "Falha ao importar whisperx."

echo ""
echo "========================================="
echo "  Setup concluído!"
echo "========================================="
echo ""
echo "Para transcrever, acesse http://localhost:3000/transcribe"
echo "e cole a URL de um vídeo do YouTube."
echo ""
