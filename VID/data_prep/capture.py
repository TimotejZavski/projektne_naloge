"""
Zajem frameov iz vseh .mp4 videov v absolutely_raw/.
Vsakih 5 sekund shrani frame v raw_frames/.
Ime: vid1_frame_MMmSSs.jpg (zaporedno glede na vrstni red videov).
"""

from pathlib import Path

import cv2

RAW_DIR = Path(__file__).parent / "absolutely_raw"
OUTPUT_DIR = Path(__file__).parent / "raw_frames"
INTERVAL_SEC = 5

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

videos = sorted(RAW_DIR.glob("*.mp4"))
print(f"Nasel {len(videos)} videov: {[v.name for v in videos]}")

total_saved = 0

for idx, video_path in enumerate(videos, start=1):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"  ERROR: ne morem odpreti {video_path.name}")
        continue

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps if fps > 0 else 0
    interval_frames = int(INTERVAL_SEC * fps)

    print(
        f"\n  [vid{idx}] {video_path.name}: {fps:.1f}fps, {duration_sec:.0f}s, "
        f"frame vsakih {INTERVAL_SEC}s ({interval_frames} frameov)"
    )

    saved = 0
    frame_idx = 0

    while frame_idx < total_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break

        timestamp_sec = frame_idx / fps
        minutes = int(timestamp_sec // 60)
        seconds = int(timestamp_sec % 60)
        out_name = f"vid{idx}_frame_{minutes:02d}m{seconds:02d}s.jpg"
        out_path = OUTPUT_DIR / out_name
        cv2.imwrite(str(out_path), frame)
        saved += 1

        frame_idx += interval_frames

    cap.release()
    total_saved += saved
    print(f"  -> shranjeno {saved} frameov iz vid{idx}")

print(f"\nSkupaj shranjeno: {total_saved} frameov v {OUTPUT_DIR}")
