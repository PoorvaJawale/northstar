"""
GeoChat runtime — the ONE correct way to load and run GeoChat in this project.

Used by:
  - backend/tools/geochat_tool.py  (the app's real inference path)
  - infer.py                       (standalone sanity check)
  - training/evaluate_vqa.py       (before/after accuracy)

Why this file exists: GeoChat is a LLaVA-1.5 model. It must be loaded with
`geochat.model.builder.load_pretrained_model` (NOT AutoModel/AutoProcessor), fed
prompts built from the `llava_v1` conversation template with an <image> token,
and tokenised with `tokenizer_image_token`. This wraps all of that.

Requires the GeoChat repo importable (`import geochat`) — it is pip-installed
editable in .venv311 — plus torch/transformers==4.31.0. Import is lazy so the
app still runs in MOCK mode without any of this.
"""
from __future__ import annotations
from typing import Optional

import numpy as np
from PIL import Image


def numpy_to_pil_rgb(arr: np.ndarray) -> Image.Image:
    """Convert an (H,W) / (H,W,C) satellite array to an 8-bit RGB PIL image with
    a 2–98 percentile stretch (handles multi-band GeoTIFF and SAR dynamic range)."""
    a = arr.astype(np.float32)
    if a.ndim == 2:
        a = a[..., None]
    disp = a[..., :3] if a.shape[2] >= 3 else np.repeat(a[..., :1], 3, axis=2)
    chans = []
    for i in range(3):
        c = disp[..., i]
        lo, hi = np.percentile(c, 2), np.percentile(c, 98)
        hi = hi if hi > lo else lo + 1.0
        chans.append(np.clip((c - lo) / (hi - lo), 0, 1))
    rgb = (np.stack(chans, axis=-1) * 255).astype(np.uint8)
    return Image.fromarray(rgb, mode="RGB")


class GeoChatRunner:
    def __init__(self, model_path: str, conv_mode: str = "llava_v1",
                 load_4bit: bool = True, load_8bit: bool = False,
                 adapter: Optional[str] = None, device: str = "cuda") -> None:
        import torch
        from geochat.model.builder import load_pretrained_model
        from geochat.mm_utils import get_model_name_from_path

        self.torch = torch
        self.device = device
        self.conv_mode = conv_mode
        model_name = get_model_name_from_path(model_path)
        # model_base=None -> loads the full geochat-7B checkpoint
        self.tokenizer, self.model, self.image_processor, self.context_len = \
            load_pretrained_model(model_path, None, model_name,
                                  load_8bit=load_8bit, load_4bit=load_4bit, device=device)

        if adapter:
            from peft import PeftModel
            print(f"[GeoChatRunner] attaching LoRA adapter: {adapter}")
            self.model = PeftModel.from_pretrained(self.model, adapter)
        self.model.eval()

    def generate(self, image: Image.Image, question: str,
                 max_new_tokens: int = 256, temperature: float = 0.2) -> tuple[str, float, str]:
        """Return (answer_text, confidence, full_prompt)."""
        import torch
        from geochat.constants import (IMAGE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN,
                                       DEFAULT_IM_START_TOKEN, DEFAULT_IM_END_TOKEN)
        from geochat.conversation import conv_templates, SeparatorStyle
        from geochat.mm_utils import process_images, tokenizer_image_token, KeywordsStoppingCriteria

        image_tensor = process_images([image], self.image_processor, self.model.config)
        if isinstance(image_tensor, list):
            image_tensor = [t.to(self.device, dtype=torch.float16) for t in image_tensor]
        else:
            image_tensor = image_tensor.to(self.device, dtype=torch.float16)

        if getattr(self.model.config, "mm_use_im_start_end", False):
            inp = DEFAULT_IM_START_TOKEN + DEFAULT_IMAGE_TOKEN + DEFAULT_IM_END_TOKEN + "\n" + question
        else:
            inp = DEFAULT_IMAGE_TOKEN + "\n" + question

        conv = conv_templates[self.conv_mode].copy()
        conv.append_message(conv.roles[0], inp)
        conv.append_message(conv.roles[1], None)
        prompt = conv.get_prompt()

        input_ids = tokenizer_image_token(
            prompt, self.tokenizer, IMAGE_TOKEN_INDEX, return_tensors="pt"
        ).unsqueeze(0).to(self.device)

        stop_str = conv.sep if conv.sep_style != SeparatorStyle.TWO else conv.sep2
        stopping = KeywordsStoppingCriteria([stop_str], self.tokenizer, input_ids)

        with torch.inference_mode():
            out = self.model.generate(
                input_ids, images=image_tensor,
                do_sample=temperature > 0, temperature=temperature,
                max_new_tokens=max_new_tokens, use_cache=True,
                stopping_criteria=[stopping],
                return_dict_in_generate=True, output_scores=True,
            )
        seq = out.sequences[0, input_ids.shape[1]:]
        text = self.tokenizer.decode(seq, skip_special_tokens=True).strip()
        text = text.replace(stop_str, "").strip()
        conf = self._confidence(out.scores)
        return text, conf, prompt

    def _confidence(self, scores) -> float:
        """Mean top-token softmax probability over generated steps — a genuine,
        if simple, confidence signal (NOT a constant)."""
        if not scores:
            return 0.0
        import torch
        probs = [torch.softmax(s[0], dim=-1).max().item() for s in scores]
        return round(float(sum(probs) / len(probs)), 3)
