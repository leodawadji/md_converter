#!/usr/bin/env python3
"""
WhisperX transcription script with speaker diarization.

Diarization strategy (in order of preference):
  1. whisperx + pyannote  — best quality, requires HF_TOKEN env var
  2. simple_diarizer       — good quality, no token needed (pip install simple_diarizer)
  3. no diarization        — single speaker, fastest

Outputs a single JSON line to stdout; everything else goes to stderr.
"""

import sys
import json
import argparse
import os
import io
import threading

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


class _StdoutToStderr:
    def __enter__(self):
        self._real = sys.stdout
        sys.stdout = sys.stderr
        return self
    def __exit__(self, *_):
        sys.stdout = self._real


def _info(msg): print(f"[INFO] {msg}", file=sys.stderr, flush=True)
def _warn(msg): print(f"[WARN] {msg}", file=sys.stderr, flush=True)


def _heartbeat(stop_event, label, interval=30):
    """Emits periodic progress messages to stderr while a blocking call runs."""
    elapsed = 0
    while not stop_event.wait(interval):
        elapsed += interval
        _info(f"{label} ({elapsed}s)...")


# ── Fallback diarization with simple_diarizer ─────────────────────────────────

def _diarize_simple(audio_path, num_speakers=None):
    """Speaker diarization fallback using speechbrain ECAPA + spectral clustering."""
    import torchaudio
    import torch
    import numpy as np
    from speechbrain.inference.speaker import EncoderClassifier
    from sklearn.cluster import SpectralClustering, AgglomerativeClustering
    from pyannote.audio import Pipeline as PyAnnotePipeline
    import tempfile, os

    # Load audio
    waveform, sr = torchaudio.load(audio_path)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(0, keepdim=True)
    if sr != 16000:
        waveform = torchaudio.transforms.Resample(sr, 16000)(waveform)

    # Use 1.5s sliding windows with 0.75s hop to extract speaker embeddings
    window_samples = int(1.5 * 16000)
    hop_samples    = int(0.75 * 16000)
    total_samples  = waveform.shape[1]

    classifier = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        run_opts={"device": "cpu"},
    )

    windows, times = [], []
    start = 0
    while start + window_samples <= total_samples:
        chunk = waveform[:, start:start + window_samples]
        with torch.no_grad():
            emb = classifier.encode_batch(chunk).squeeze().numpy()
        windows.append(emb)
        mid = (start + start + window_samples) / 2 / 16000
        times.append(mid)
        start += hop_samples

    if len(windows) < 2:
        return [{"start": 0, "end": total_samples / 16000, "label": "SPEAKER_0"}]

    X = np.array(windows)
    n = num_speakers or min(max(2, len(windows) // 8), 8)

    try:
        labels = SpectralClustering(n_clusters=n, affinity="cosine", random_state=0).fit_predict(X)
    except Exception:
        labels = AgglomerativeClustering(n_clusters=n).fit_predict(X)

    # Convert window labels back to segments
    segments, cur_label, cur_start = [], labels[0], 0.0
    for i, (t, lbl) in enumerate(zip(times, labels)):
        if lbl != cur_label:
            segments.append({"start": cur_start, "end": t, "label": f"SPEAKER_{int(cur_label)}"})
            cur_label, cur_start = lbl, t
    segments.append({"start": cur_start, "end": total_samples / 16000, "label": f"SPEAKER_{int(cur_label)}"})
    return segments


def _assign_speakers_simple(segments, diar_segments):
    """Assign the most overlapping diarization label to each transcript segment."""
    for seg in segments:
        best_label = "SPEAKER_00"
        best_overlap = -1
        for d in diar_segments:
            # overlap by checking if segment midpoint is inside diarization window
            overlap = min(seg.get("end", 0), d["end"]) - max(seg.get("start", 0), d["start"])
            if overlap > best_overlap:
                best_overlap = overlap
                best_label = d.get("label", "SPEAKER_00")
        # Normalise label: "SPEAKER_0" → "SPEAKER_00" for consistency
        import re
        m = re.match(r".*?(\d+)$", best_label)
        if m:
            best_label = f"SPEAKER_{int(m.group(1)):02d}"
        seg["speaker"] = best_label
    return segments


# ── Main transcription ────────────────────────────────────────────────────────

def transcribe(audio_path, model_size="small", language=None,
               min_speakers=None, max_speakers=None):

    try:
        with _StdoutToStderr():
            import whisperx
    except ImportError as e:
        print(f"[ERRO] whisperx não instalado: {e}", file=sys.stderr)
        sys.exit(1)

    device       = "cpu"
    compute_type = "int8"
    hf_token     = os.environ.get("HF_TOKEN", "")
    cpu_threads  = os.cpu_count() or 4

    _info(f"CPU threads: {cpu_threads} | modelo: {model_size}")

    # ── 1. Transcribe ─────────────────────────────────────────────────────────
    with _StdoutToStderr():
        _info(f"Carregando modelo Whisper '{model_size}' (pode levar 1-5 min na primeira vez)...")
        _stop = threading.Event()
        threading.Thread(
            target=_heartbeat, args=(_stop, "Ainda carregando modelo"), daemon=True
        ).start()
        try:
            model = whisperx.load_model(
                model_size, device,
                compute_type=compute_type,
                language=language,
                asr_options={"beam_size": 1},
                threads=cpu_threads,
            )
        finally:
            _stop.set()

        _info("Carregando áudio...")
        audio = whisperx.load_audio(audio_path)
        _info("Transcrevendo...")
        result = model.transcribe(audio, batch_size=4)

    detected_language = result.get("language", language or "pt")
    _info(f"Idioma detectado: {detected_language}")
    segments = result.get("segments", [])

    # ── 2. Diarization ────────────────────────────────────────────────────────
    num_speakers = None
    if min_speakers and min_speakers == max_speakers:
        num_speakers = min_speakers

    if hf_token:
        # Best quality: whisperx + pyannote (requires HF_TOKEN)
        _info("Alinhando timestamps para diarização (pyannote)...")
        with _StdoutToStderr():
            try:
                align_model, metadata = whisperx.load_align_model(
                    language_code=detected_language, device=device
                )
                result = whisperx.align(
                    segments, align_model, metadata, audio, device,
                    return_char_alignments=False,
                )
                segments = result.get("segments", [])
            except Exception as e:
                _warn(f"Alinhamento falhou ({e}). Usando timestamps brutos.")

        _info("Diarizando com pyannote (HF_TOKEN detectado)...")
        with _StdoutToStderr():
            try:
                from whisperx.diarize import DiarizationPipeline, assign_word_speakers
                diarize_kwargs = {}
                if min_speakers: diarize_kwargs["min_speakers"] = int(min_speakers)
                if max_speakers: diarize_kwargs["max_speakers"] = int(max_speakers)
                # use_auth_token was renamed to token in newer pyannote versions
                try:
                    diarize_model = DiarizationPipeline(token=hf_token, device=device)
                except TypeError:
                    diarize_model = DiarizationPipeline(use_auth_token=hf_token, device=device)
                diarize_segments = diarize_model(audio_path, **diarize_kwargs)
                result = assign_word_speakers(diarize_segments, result)
                segments = result.get("segments", [])
                _info("Diarização pyannote concluída.")
            except Exception as e:
                _warn(f"Pyannote falhou ({e}). Tentando simple_diarizer como fallback...")
                hf_token = ""  # fall through to next block

    if not hf_token:
        # Fallback: simple_diarizer (no token needed)
        try:
            _info("Diarizando com simple_diarizer (sem HF_TOKEN)...")
            with _StdoutToStderr():
                diar_segments = _diarize_simple(audio_path, num_speakers=num_speakers)
            segments = _assign_speakers_simple(segments, diar_segments)
            unique = set(s.get("speaker") for s in segments)
            _info(f"simple_diarizer concluído — {len(unique)} falante(s) detectado(s).")
        except ImportError as ie:
            _warn(f"Fallback de diarização falhou (dependência ausente: {ie}). Saída sem identificação de falantes.")
            _warn("Instale com: pip install scikit-learn speechbrain")
            for seg in segments:
                seg["speaker"] = "SPEAKER_00"
        except Exception as e:
            _warn(f"simple_diarizer falhou ({e}). Saída sem identificação de falantes.")
            for seg in segments:
                seg["speaker"] = "SPEAKER_00"

    # ── 3. Normalize & output ─────────────────────────────────────────────────
    output = []
    for seg in segments:
        output.append({
            "start":   seg.get("start", 0),
            "end":     seg.get("end",   0),
            "text":    seg.get("text",  "").strip(),
            "speaker": seg.get("speaker", "UNKNOWN"),
        })

    speaker_counts = {}
    for seg in output:
        s = seg["speaker"]
        speaker_counts[s] = speaker_counts.get(s, 0) + 1
    _info(f"Concluído — {len(output)} segmentos | speakers: {speaker_counts}")
    print(json.dumps(output, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_path")
    parser.add_argument("--model",        default="small", choices=["tiny", "small", "medium"])
    parser.add_argument("--language",     default=None)
    parser.add_argument("--min-speakers", type=int, default=None)
    parser.add_argument("--max-speakers", type=int, default=None)
    args = parser.parse_args()

    transcribe(
        args.audio_path,
        model_size=args.model,
        language=args.language,
        min_speakers=args.min_speakers,
        max_speakers=args.max_speakers,
    )


if __name__ == "__main__":
    main()
