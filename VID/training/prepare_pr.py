"""
SCRUM-65: Izdelava 2-razrednega Player+Ref dataseta za fine-tune.

Iz polnega dataseta (VID/dataset, 5 razredov) zgradi dataset_pr/ z razredoma:
    Player (stari id 3) -> 0
    Ref    (stari id 4) -> 1
Ball/Court/Hoop okvirje izpusti. Slike kopira, oznake prepise, data.yaml zapise
z absolutnimi potmi (brez tezav z relativnim razresevanjem v ultralytics).

Zakaj Player+Ref: model se sodnika nauci iz oznak (991 instanc v train) in ga
loci od igralcev po videzu — robustno tudi, ko se barva sodnika ujema z dresom
ene ekipe (cesar barvna hevristika ne zmore).

Uporaba:
    .venv/Scripts/python.exe training/prepare_pr.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "dataset"
DST = ROOT / "dataset_pr"
SPLITS = ("train", "valid", "test")

REMAP = {"3": "0", "4": "1"}   # Player -> 0, Ref -> 1
NEW_NAMES = ["Player", "Ref"]


def convert_label(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) == 5 and parts[0] in REMAP:
            out.append(REMAP[parts[0]] + " " + " ".join(parts[1:]))
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Ni izvornega dataseta: {SRC}")

    print("Izdelava 2-razrednega Player+Ref dataseta")
    print("=" * 50)
    grand_imgs = 0
    grand_cnt = [0, 0]

    for split in SPLITS:
        src_img = SRC / split / "images"
        src_lbl = SRC / split / "labels"
        dst_img = DST / split / "images"
        dst_lbl = DST / split / "labels"
        dst_img.mkdir(parents=True, exist_ok=True)
        dst_lbl.mkdir(parents=True, exist_ok=True)

        n_img = 0
        cnt = [0, 0]
        for lbl in src_lbl.glob("*.txt"):
            img = src_img / f"{lbl.stem}.jpg"
            if not img.exists():
                continue
            lines = convert_label(lbl.read_text())
            if not lines:
                continue          # slika brez Player/Ref okvirjev — preskoci
            (dst_lbl / lbl.name).write_text("\n".join(lines) + "\n")
            shutil.copy2(img, dst_img / img.name)
            n_img += 1
            for ln in lines:
                cnt[int(ln.split()[0])] += 1

        grand_imgs += n_img
        grand_cnt = [a + b for a, b in zip(grand_cnt, cnt)]
        print(f"{split:6} | slik {n_img:4} | Player: {cnt[0]:5} | Ref: {cnt[1]:4}")

    yaml = (
        f"train: {(DST / 'train' / 'images').as_posix()}\n"
        f"val: {(DST / 'valid' / 'images').as_posix()}\n"
        f"test: {(DST / 'test' / 'images').as_posix()}\n"
        f"\nnc: 2\nnames: {NEW_NAMES}\n"
    )
    (DST / "data.yaml").write_text(yaml)
    print("-" * 50)
    print(f"skupaj: {grand_imgs} slik | Player: {grand_cnt[0]} | Ref: {grand_cnt[1]}")
    print(f"data.yaml -> {DST / 'data.yaml'}")


if __name__ == "__main__":
    main()
