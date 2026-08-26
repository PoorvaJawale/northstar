"""
Phase 2.2 / 2.3 — LoRA fine-tune + before/after evaluation.

This is the MANDATORY domain-adaptation deliverable: the PS disqualifies a
generic model, so you must adapt at least one component on BigEarthNet.txt and
show numbers. LoRA keeps it to a few hours on a single T4/A100.

Requires (only when you actually run it): torch (CUDA), transformers, peft,
accelerate. It is intentionally NOT imported by the app, so the app runs without
these heavy deps.

Run on Kaggle/Colab/college GPU:
    python training/lora_finetune.py --data data/subset --base MBZUAI/GeoChat \
        --out models/lora-geochat --epochs 1
"""
from __future__ import annotations
import argparse


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--base", default="MBZUAI/GeoChat")
    ap.add_argument("--out", default="models/lora-adapter")
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--rank", type=int, default=16)
    args = ap.parse_args()

    # === YOUR INTERVENTION POINT #5 =====================================
    import torch
    from transformers import (AutoModelForCausalLM, AutoProcessor,
                              TrainingArguments, Trainer)
    from peft import LoraConfig, get_peft_model

    processor = AutoProcessor.from_pretrained(args.base)
    model = AutoModelForCausalLM.from_pretrained(
        args.base, torch_dtype=torch.float16, device_map="cuda", load_in_4bit=True)

    lora = LoraConfig(r=args.rank, lora_alpha=args.rank * 2, lora_dropout=0.05,
                      bias="none", task_type="CAUSAL_LM",
                      target_modules=["q_proj", "v_proj"])  # adjust to the arch
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    # --- 1) evaluate BEFORE (baseline) ---------------------------------
    # base_score = evaluate(model_without_adapter, val_set)   # accuracy / BLEU

    # --- 2) build dataset from data/{train,val}.jsonl ------------------
    # train_ds = RSInstructionDataset(f"{args.data}/train.jsonl", processor)

    # --- 3) train ------------------------------------------------------
    # trainer = Trainer(model=model, args=TrainingArguments(
    #     output_dir=args.out, per_device_train_batch_size=4,
    #     num_train_epochs=args.epochs, learning_rate=args.lr, fp16=True,
    #     logging_steps=20, save_strategy="epoch"), train_dataset=train_ds)
    # trainer.train()
    # model.save_pretrained(args.out)   # <- point config.LORA_ADAPTER here

    # --- 4) evaluate AFTER + print the table you put on the slide ------
    # after_score = evaluate(model, val_set)
    # print(f"BEFORE: {base_score:.3f}   AFTER: {after_score:.3f}")

    raise SystemExit(
        "lora_finetune.py is a ready-to-fill template. Implement the dataset "
        "class + eval() for your chosen task, then run on a GPU. See "
        "training/README.md and INTERVENTION.md #5."
    )


if __name__ == "__main__":
    main()
