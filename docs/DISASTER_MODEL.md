# Disaster SAR Flood Model

This project now supports a real Sentinel-1 SAR flood segmentation model.

## Model

- Architecture: compact UNet
- Input: Sentinel-1 SAR VV/VH, `1x2xHxW`, normalized from dB `[-50, 1]` to `[0, 1]`
- Output: binary flood/water logits, `1x1xHxW`
- Export: `models/flood_unet_sentinel1.onnx`

## Dataset

Use Sen1Floods11 v1.1, a public georeferenced flood dataset for Sentinel-1.
The full Google Cloud Storage bucket is about 14 GB, so the downloader can fetch
a smaller subset first.

```bash
python -m pip install -r requirements-disaster.txt
python training/download_sen1floods11.py --max-train 80 --max-val 20
python training/train_sar_flood_unet.py --epochs 8
```

Run the app with the exported model:

```bash
DISASTER_SAR_MODEL=models/flood_unet_sentinel1.onnx SATQUERY_MOCK=1 python serve.py
```

Ask:

```text
Predict flood risk and disaster impact from this SAR image.
```
