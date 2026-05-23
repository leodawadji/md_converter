@echo off
setlocal EnableDelayedExpansion
:: Setup script para dependencias de transcricao YouTube + WhisperX (Windows)

echo.
echo =========================================
echo   Setup: Transcricao YouTube + WhisperX
echo =========================================
echo.

:: ── 1. Python ──────────────────────────────
python --version >nul 2>&1
IF !ERRORLEVEL! NEQ 0 (
  echo [ERRO] Python nao encontrado. Baixe em https://python.org
  pause & exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo [OK] %%v

:: Descobre pasta Scripts do Python (sistema)
for /f "tokens=*" %%p in ('python -c "import sys,os; print(os.path.join(os.path.dirname(sys.executable),\"Scripts\"))" 2^>nul') do set "SYS_SCRIPTS=%%p"

:: Descobre pasta Scripts do usuario (pip install --user)
for /f "tokens=*" %%p in ('python -c "import site,os; s=site.getusersitepackages(); print(os.path.join(os.path.dirname(s),\"Scripts\"))" 2^>nul') do set "USER_SCRIPTS=%%p"

echo [INFO] Scripts sistema : !SYS_SCRIPTS!
echo [INFO] Scripts usuario : !USER_SCRIPTS!

:: Adiciona ambas ao PATH desta sessao
set "PATH=!SYS_SCRIPTS!;!USER_SCRIPTS!;!PATH!"

:: ── 2. ffmpeg ──────────────────────────────
ffmpeg -version >nul 2>&1
IF !ERRORLEVEL! NEQ 0 (
  echo [INFO] ffmpeg nao encontrado. Tentando instalar via winget...
  winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
  ffmpeg -version >nul 2>&1
  IF !ERRORLEVEL! NEQ 0 (
    echo.
    echo [AVISO] ffmpeg ainda nao encontrado no PATH.
    echo   Instale manualmente e reinicie o terminal:
    echo   1. Baixe ffmpeg-master-latest-win64-gpl.zip em:
    echo      https://github.com/BtbN/FFmpeg-Builds/releases
    echo   2. Extraia e copie ffmpeg.exe para uma pasta no PATH, ex:
    echo      !SYS_SCRIPTS!
    echo.
  ) ELSE (
    echo [OK] ffmpeg instalado com sucesso.
  )
) ELSE (
  echo [OK] ffmpeg ja instalado.
)

:: ── 3. yt-dlp ──────────────────────────────
yt-dlp --version >nul 2>&1
IF !ERRORLEVEL! NEQ 0 (
  echo [INFO] Instalando yt-dlp...
  python -m pip install -U yt-dlp
  yt-dlp --version >nul 2>&1
  IF !ERRORLEVEL! NEQ 0 (
    echo [AVISO] yt-dlp instalado mas nao encontrado no PATH desta sessao.
    echo   Isso e normal — sera resolvido ao adicionar Scripts ao PATH permanente (passo 7).
  ) ELSE (
    echo [OK] yt-dlp instalado e funcionando.
  )
) ELSE (
  for /f "tokens=*" %%v in ('yt-dlp --version 2^>^&1') do echo [OK] yt-dlp %%v
)

:: ── 4. PyTorch (CPU) ───────────────────────
echo.
echo [INFO] Instalando PyTorch (CPU only)... pode demorar alguns minutos.
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
IF !ERRORLEVEL! NEQ 0 (
  echo [ERRO] Falha ao instalar PyTorch. Verifique a conexao com a internet.
  pause & exit /b 1
)
echo [OK] PyTorch instalado.

:: ── 5. WhisperX ────────────────────────────
echo [INFO] Instalando WhisperX...
python -m pip install whisperx
IF !ERRORLEVEL! NEQ 0 (
  echo [ERRO] Falha ao instalar WhisperX.
  pause & exit /b 1
)
echo [OK] WhisperX instalado.

:: ── 6. HF_TOKEN ────────────────────────────
echo.
IF "!HF_TOKEN!"=="" (
  echo [AVISO] HF_TOKEN nao definido. Diarizacao ficara desativada.
  echo   Para ativar, crie o arquivo .env.local na raiz do projeto:
  echo   echo HF_TOKEN=hf_xxxxxxxxxxxx ^> .env.local
) ELSE (
  echo [OK] HF_TOKEN detectado.
)

:: ── 7. Adiciona Scripts ao PATH permanente ─
echo.
echo [INFO] Adicionando pastas Scripts ao PATH permanente do usuario...

:: Le o PATH atual do registro
for /f "skip=2 tokens=2,*" %%a in ('reg query HKCU\Environment /v PATH 2^>nul') do set "REG_PATH=%%b"
IF "!REG_PATH!"=="" set "REG_PATH=%PATH%"

set "UPDATED=0"

:: Adiciona Scripts sistema se nao estiver
echo !REG_PATH! | findstr /i /c:"!SYS_SCRIPTS!" >nul 2>&1
IF !ERRORLEVEL! NEQ 0 (
  set "REG_PATH=!SYS_SCRIPTS!;!REG_PATH!"
  set "UPDATED=1"
  echo [OK] Adicionado: !SYS_SCRIPTS!
) ELSE (
  echo [OK] Ja no PATH: !SYS_SCRIPTS!
)

:: Adiciona Scripts usuario se nao estiver
echo !REG_PATH! | findstr /i /c:"!USER_SCRIPTS!" >nul 2>&1
IF !ERRORLEVEL! NEQ 0 (
  set "REG_PATH=!USER_SCRIPTS!;!REG_PATH!"
  set "UPDATED=1"
  echo [OK] Adicionado: !USER_SCRIPTS!
) ELSE (
  echo [OK] Ja no PATH: !USER_SCRIPTS!
)

IF !UPDATED! EQU 1 (
  setx PATH "!REG_PATH!" >nul 2>&1
  echo [OK] PATH atualizado no registro.
)

:: ── 8. Teste final ──────────────────────────
echo.
echo [INFO] Verificando instalacao...
python -c "import whisperx; print('[OK] WhisperX importado com sucesso.')" 2>&1
IF !ERRORLEVEL! NEQ 0 echo [AVISO] whisperx nao importou. Verifique erros acima.

echo.
echo =========================================
echo   Setup concluido!
echo =========================================
echo.
echo PROXIMOS PASSOS:
echo   1. Feche este terminal completamente.
echo   2. Abra um NOVO terminal.
echo   3. Execute: npm run dev
echo.
echo Isso e necessario para que o servidor encontre yt-dlp e ffmpeg no PATH.
echo.
pause
