"""
Iz raw_frames/ izbere raznolike frame ENAKOMERNO iz vseh 3 videov.
Znotraj vsakega videa primerja pixel-wise razliko med zaporednimi frejmi
in obdrzi samo dovolj razlicne.
Rezultat v curated_frames/.
"""

from pathlib import Path

import cv2
import numpy as np

INPUT_DIR = Path(__file__).parent / "raw_frames"
OUTPUT_DIR = Path(__file__).parent / "curated_frames"

DIFF_THRESHOLD = 10.0  # nizje = vec slik sprejmemo
TOTAL_TARGET = 150  # koliko slik zelimo skupaj
SKIP_FIRST_N = 50  # preskoci prvih N frameov na video (title screen)


def compute_mean_diff(img1: np.ndarray, img2: np.ndarray) -> float:
    diff = cv2.absdiff(img1, img2)
    return float(np.mean(diff))


def extract_vid_id(filename: str) -> int:
    """Iz imena 'vid1_frame_03m45s.jpg' dobi 1."""
    # filename starts with 'vid' then a digit
    if filename.startswith("vid"):
        try:
            return int(filename[3])
        except (ValueError, IndexError):
            pass
    return 0


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_frames = sorted(p for p in INPUT_DIR.glob("*.jpg") if p.is_file())
    print(f"Vseh frameov: {len(all_frames)}")

    # Razdeli po videih
    by_video = {}
    for f in all_frames:
        vid = extract_vid_id(f.name)
        by_video.setdefault(vid, []).append(f)

    num_videos = len(by_video)
    per_video_target = TOTAL_TARGET // num_videos
    print(f"Video: {sorted(by_video.keys())}")
    print(f"Frameov po videu: { {k: len(v) for k, v in by_video.items()} }")
    print(f"Cilj: ~{per_video_target} na video, skupaj ~{TOTAL_TARGET}")
    print()

    all_selected = []

    for vid, frames in sorted(by_video.items()):
        # Preskoci prvih N frameov (title screen)
        orig_count = len(frames)
        frames = frames[SKIP_FIRST_N:]
        print(
            f"  vid{vid}: preskocenih {min(SKIP_FIRST_N, orig_count)}, ostalo {len(frames)}"
        )

        selected = []
        prev_img = None

        for frame_path in frames:
            img = cv2.imread(str(frame_path))
            if img is None:
                continue

            if prev_img is None:
                selected.append(frame_path)
                prev_img = img
                continue

            diff = compute_mean_diff(prev_img, img)
            if diff >= DIFF_THRESHOLD:
                selected.append(frame_path)
                prev_img = img

            if len(selected) >= per_video_target:
                break

        print(f"  vid{vid}: izbranih {len(selected)}/{len(frames)}")
        all_selected.extend(selected)

    print(f"\nSkupaj izbranih: {len(all_selected)}")

    if len(all_selected) < 30:
        print("OPOZORILO: premalo! Znizaj DIFF_THRESHOLD in poskusi znova.")

    # Ce jih je prevec, enakomerno skrajsaj
    if len(all_selected) > TOTAL_TARGET:
        step = max(1, len(all_selected) // TOTAL_TARGET)
        all_selected = all_selected[::step]
        print(f"Skrajsano na: {len(all_selected)}")

    # Kopiraj
    for frame in all_selected:
        dest = OUTPUT_DIR / frame.name
        img = cv2.imread(str(frame))
        cv2.imwrite(str(dest), img)

    print(f"Shranjeno v: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
