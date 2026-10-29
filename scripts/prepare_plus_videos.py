"""Prepare website examples from the released RoboMME-Plus training split."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import subprocess

import h5py


ROOT = Path(__file__).resolve().parents[1]
METHODS = {"hook": "Hook", "poke": "Poke", "scoop": "Pan scoop",
           "ball": "Rolling ball", "cue": "Cue strike"}


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def asset_url(path):
    version = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    return f"{path.relative_to(ROOT)}?v={version}"


def grounded_subgoals(episode, source):
    """Use the same native frames as the paired 20 Hz training videos."""
    frequency = int(source["control_freq"])
    if frequency % 20 or not 20 <= frequency <= 100:
        raise ValueError("Expected a native frame rate divisible by 20, up to 100 Hz")
    stride = frequency // 20
    native_frames = int(episode.attrs["frames"])
    demo = int(episode.attrs["demonstration_frames"])
    # Restart sampling at execution, just as the LeRobot video export does.
    indices = [*range(0, demo, stride), *range(demo, native_frames, stride)]
    if len(indices) != source["frames"]:
        raise ValueError("Grounded subgoals do not match the exported video length")
    cues = []
    for frame, native in enumerate(indices):
        value = episode[f"timestep_{native}/info/grounded_subgoal_online"][()]
        if hasattr(value, "reshape"):
            value = value.reshape(-1)[0]
        text = value.decode("utf-8") if isinstance(value, bytes) else str(value)
        if not cues or text != cues[-1][1]:
            cues.append([frame, text])
    return dict(fps=20, frame_count=len(indices), cues=cues)


def prepare(source, training, metadata, existing=None):
    task, episode = source["task"], source["task_episode"]
    record = next(row for row in metadata[task] if row["episode"] == episode)
    if record["seed"] != source["seed"]:
        raise ValueError(f"{task}/{episode}: video seed differs from training metadata")
    with h5py.File(training / "h5" / f"record_dataset_{task}.h5") as h5:
        row = h5[f"episode_{episode}"]
        if not row.attrs["success"] or int(row["setup/seed"][()]) != source["seed"]:
            raise ValueError(f"{task}/{episode}: expected a successful training episode")
        goal = row["setup/task_goal"][()].reshape(-1)[0]
        goal = goal.decode() if isinstance(goal, bytes) else str(goal)
        native_demo = int(row.attrs["demonstration_frames"])
        native_frames = int(row.attrs["frames"])
        subgoals = grounded_subgoals(row, source)
    ratio = source["control_freq"] / 20
    demo_frames = math.ceil(native_demo / ratio)
    frames = demo_frames + math.ceil((native_frames - native_demo) / ratio)
    if frames != source["frames"]:
        raise ValueError(f"{task}/{episode}: training video frame alignment differs")
    videos = training / "lerobot/videos"
    filename = f"chunk-000/file-{source['episode_index']:03d}.mp4"
    front = videos / "observation.images.front" / filename
    wrist = videos / "observation.images.wrist" / filename
    for path in (front, wrist):
        info = json.loads(run("ffprobe", "-v", "error", "-select_streams", "v:0",
                              "-show_entries", "stream=nb_frames,r_frame_rate",
                              "-of", "json", str(path)))["streams"][0]
        if int(info["nb_frames"]) != frames or info["r_frame_rate"] != "20/1":
            raise ValueError(f"Unexpected video frame count/rate: {path}")
    folder = ROOT / "video/plus" / task
    folder.mkdir(parents=True, exist_ok=True)
    stem = record.get("variant") if task == "MoveCube" else f"sample-{episode + 1}"
    output = folder / f"{stem}.mp4"
    subgoal_path = folder / f"{stem}.subgoals.json"
    if existing is not None:
        if (existing["seed"] != source["seed"]
                or existing["video"].split("?")[0] != str(output.relative_to(ROOT))
                or not math.isclose(existing["duration_seconds"], frames / 20)
                or not math.isclose(existing["demonstration_seconds"], demo_frames / 20)):
            raise ValueError(f"{task}/{episode}: rebuild the video before adding subgoals")
        info = json.loads(run("ffprobe", "-v", "error", "-select_streams", "v:0",
                              "-show_entries", "stream=nb_frames,r_frame_rate",
                              "-of", "json", str(output)))["streams"][0]
        if int(info["nb_frames"]) != frames or info["r_frame_rate"] != "20/1":
            raise ValueError(f"{task}/{episode}: existing video does not match the subgoals")
        subgoal_path.write_text(json.dumps(subgoals, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"Prepared subgoals for {task}: {existing['label']}", flush=True)
        return task, dict(existing, subgoals=asset_url(subgoal_path))
    temporary = folder / f"{stem}.tmp.mp4"
    video_filter = "[0:v][1:v]hstack=inputs=2"
    if demo_frames:
        video_filter += (
            ",drawbox=x=0:y=0:w=iw:h=ih:color=red:t=4"
            f":enable='lt(n,{demo_frames})'"
        )
    video_filter += "[v]"
    run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-threads", "1",
        "-i", str(front), "-threads", "1", "-i", str(wrist),
        "-filter_complex_threads", "1", "-filter_complex", video_filter,
        "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "28",
        "-pix_fmt", "yuv420p", "-threads", "2", "-movflags", "+faststart", str(temporary))
    temporary.replace(output)
    poster = folder / f"{stem}.jpg"
    run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(output),
        "-frames:v", "1", "-q:v", "3", "-threads", "1", str(poster))
    subgoal_path.write_text(json.dumps(subgoals, ensure_ascii=False, separators=(",", ":")) + "\n")
    sample = dict(label=METHODS.get(record.get("variant"), f"Sample {episode + 1}"),
                  video=asset_url(output), poster=asset_url(poster),
                  subgoals=asset_url(subgoal_path),
                  caption="Successful training rollout", goal=goal, seed=source["seed"],
                  training_episode=episode, duration_seconds=frames / 20,
                  demonstration_seconds=demo_frames / 20)
    if record.get("difficulty"):
        sample["difficulty"] = record["difficulty"]
    if record.get("variant"):
        sample["method"] = record["variant"]
    print(f"Prepared {task}: {sample['label']}", flush=True)
    return task, sample


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--training-dir", type=Path, required=True)
    parser.add_argument("--metadata-dir", type=Path, required=True,
                        help="The benchmark's env_metadata/train directory")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--subgoals-only", action="store_true",
                        help="Add captions to matching existing videos without re-encoding")
    args = parser.parse_args()
    sources = json.loads((args.training_dir / "lerobot/meta/source_episodes.json").read_text())
    data_path = ROOT / "data/plus.json"
    data = json.loads(data_path.read_text())
    metadata = {task["id"]: json.loads((args.metadata_dir /
                f"record_dataset_{task['id']}_metadata.json").read_text())["records"]
                for task in data["tasks"]}
    if len(sources) != 50 or {row["task"] for row in sources} != set(metadata):
        raise ValueError("Expected all 50 training episodes across 16 tasks")
    existing = {(task["id"], sample["training_episode"]): sample
                for task in data["tasks"] for sample in task["samples"]}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        prepared = list(pool.map(lambda row: prepare(
            row, args.training_dir, metadata,
            existing[(row["task"], row["task_episode"])] if args.subgoals_only else None,
        ), sources))
    for task in data["tasks"]:
        samples = [sample for name, sample in prepared if name == task["id"]]
        if len(samples) != len(metadata[task["id"]]):
            raise ValueError(f"Missing examples for {task['id']}")
        task["samples"] = sorted(samples, key=lambda sample: sample["training_episode"])
    data_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print("Updated data/plus.json with all 50 training examples.")


if __name__ == "__main__":
    main()
