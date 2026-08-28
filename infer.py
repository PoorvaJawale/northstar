"""
Standalone GeoChat inference — the "prove ONE inference works" script.

This deliberately does NOT use GeoChat's serve/cli.py (which imports the missing
`llava` namespace and contains a leftover pdb breakpoint). It uses the correct
`geochat.*` loader via backend/tools/geochat_runtime.py.

Examples:
    # base geochat-7B, 4-bit (fits ~6 GB), one image:
    python infer.py --image data/images/SOME_PATCH.png \
        --query "Describe the land cover in this image."

    # with your fine-tuned LoRA adapter:
    python infer.py --image data/images/SOME_PATCH.png \
        --query "Is there a water body?" --adapter models/lora-geochat

Requires: torch (CUDA), transformers==4.31.0, and the geochat-7B checkpoint
(downloads on first run, ~14 GB). Run inside .venv311.
"""
from __future__ import annotations
import argparse
from PIL import Image

from backend.tools.geochat_runtime import GeoChatRunner
from backend import config


def main():
    ap = argparse.ArgumentParser()
    # Defaults to config.GEOCHAT_MODEL (set via the GEOCHAT_MODEL env var), so
    # pointing at a local folder avoids any re-download from the Hub.
    ap.add_argument("--model-path", default=None)
    ap.add_argument("--image", required=True)
    ap.add_argument("--query", required=True)
    ap.add_argument("--adapter", default=None, help="path to LoRA adapter (optional)")
    ap.add_argument("--conv-mode", default="llava_v1")
    ap.add_argument("--max-new-tokens", type=int, default=256)
    ap.add_argument("--temperature", type=float, default=0.2)
    ap.add_argument("--load-8bit", action="store_true")
    ap.add_argument("--no-4bit", action="store_true", help="disable 4-bit (needs more VRAM)")
    args = ap.parse_args()

    model_path = args.model_path or config.GEOCHAT_MODEL
    print(f"[infer] loading model from: {model_path}")
    runner = GeoChatRunner(
        model_path=model_path, conv_mode=args.conv_mode,
        load_4bit=not args.no_4bit and not args.load_8bit,
        load_8bit=args.load_8bit, adapter=args.adapter,
    )
    image = Image.open(args.image).convert("RGB")
    text, conf, _ = runner.generate(
        image, args.query,
        max_new_tokens=args.max_new_tokens, temperature=args.temperature)
    print("\n" + "=" * 60)
    print("Q:", args.query)
    print("A:", text)
    print(f"confidence: {conf}")
    print("=" * 60)


if __name__ == "__main__":
    main()
