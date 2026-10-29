"""Refresh RoboMME-Plus scores from complete published evaluations, excluding RoboMME-Plus-finetuned FrameSamp."""

import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
METHODS = ["framesamp-modul", "simplememvla", "ponderpounce", "embodied-astra",
           "embodied-astra-fs", "3-tier-astra"]


def read_scores(folder, tasks):
    counts = Counter()
    per_task = {task: Counter() for task in tasks}
    episodes = set()
    measured = Counter()
    latest = ""
    for path in sorted(folder.glob("*_ep*/result.json")):
        row = json.loads(path.read_text())
        task, episode = row["task"], row["episode"]
        identity = (task, episode)
        if (row["method"] != folder.name or row["benchmark"] not in {"robomme_plus", "robomme_ood"}
                or row["dataset"] != "test" or task not in per_task
                or type(episode) is not int or not 0 <= episode < 50
                or identity in episodes or path.parent.name != f"{task}_ep{episode}"):
            raise ValueError(f"Invalid or duplicate episode: {path}")
        if (row["status"] not in {"success", "fail", "timeout"}
                or row["success"] is not (row["status"] == "success")
                or not row.get("artifacts_complete")):
            raise ValueError(f"Incomplete or inconsistent outcome: {path}")
        episodes.add(identity)
        counts[row["status"]] += 1
        per_task[task][row["status"]] += 1
        latest = max(latest, row["finished_utc"])
        metrics = row["metrics"]
        measured.update(wall_seconds=row["elapsed_seconds"], steps=row["steps"],
                        model_seconds=metrics["latency"]["model"]["total_seconds"],
                        api_seconds=metrics["latency"]["api"]["total_seconds"],
                        api_requests=metrics["latency"]["api"]["count"],
                        api_attempts=metrics["api"]["attempts"])
    if episodes != {(task, episode) for task in tasks for episode in range(50)}:
        raise ValueError(f"Expected exactly 50 completed episodes per task: {folder}")
    raw = (folder / "summary.json").read_bytes()
    summary = json.loads(raw)
    if (summary["method"] != folder.name or not summary["complete"]
            or summary["completed"] != 800 or summary["requested"] != 800
            or summary["pending"] != 0 or summary["counts"].get("error", 0)
            or any(summary["counts"].get(key, 0) != counts[key]
                   for key in ("success", "fail", "timeout"))
            or abs(summary["success_rate"] - counts["success"] / 800) > 1e-12):
        raise ValueError(f"Published summary disagrees with episode outcomes: {folder}")
    scores = {task: per_task[task]["success"] / 50 for task in tasks}
    for task, score in scores.items():
        reported = summary["per_task"][task]
        if reported["completed"] != 50 or abs(reported["success_rate"] - score) > 1e-12:
            raise ValueError(f"Published task summary disagrees: {folder.name}/{task}")
    return scores, dict(completed=800, counts=dict(counts),
                        latest_episode_finished_utc=latest,
                        summary_sha256=hashlib.sha256(raw).hexdigest()), measured


def add_runtime_metrics(method, snapshot, measured):
    """Use the blog's token-priced totals only when its snapshot matches the rollouts."""
    rows = [row for row in snapshot["rows"] if row["method"] == method["id"]]
    if len(rows) != 1:
        raise ValueError(f"Expected one metrics row for {method['id']}")
    row = rows[0]
    evaluation = method["evaluation"]
    if (row["completed"] != evaluation["completed"] or row["planned"] != 800
            or any(row["counts"].get(key, 0) != evaluation["counts"].get(key, 0)
                   for key in ("success", "fail", "timeout", "error"))
            or not math.isclose(row["success_rate"], evaluation["counts"].get("success", 0) / 800)):
        raise ValueError(f"Metrics snapshot has different episode outcomes: {method['id']}")
    expected = dict(wall_per_episode=measured["wall_seconds"] / 800,
                    model_per_step=measured["model_seconds"] / measured["steps"],
                    api_per_request=(measured["api_seconds"] / measured["api_requests"]
                                     if measured["api_requests"] else None),
                    api_attempts=measured["api_attempts"])
    for key, value in expected.items():
        reported = row[key]
        if ((value is None and reported is not None)
                or (value is not None and (not isinstance(reported, (int, float))
                    or not math.isfinite(reported) or not math.isclose(value, reported, rel_tol=1e-9)))):
            raise ValueError(f"Metrics snapshot disagrees with rollouts: {method['id']}/{key}")
    applicable = bool(row["api_applicable"])
    if applicable != bool(measured["api_attempts"]):
        raise ValueError(f"Inconsistent API applicability: {method['id']}")
    method["runtime"] = dict(episodes=800, episode_seconds=expected["wall_per_episode"],
                             model_seconds_per_step=expected["model_per_step"],
                             api_seconds_per_request=expected["api_per_request"],
                             api_attempts=expected["api_attempts"], api_applicable=applicable,
                             metrics_snapshot_utc=snapshot["fetched_utc"])
    cost = row["cost_usd"] if applicable else None
    lower_bound = bool(row["cost_lower_bound"]) if applicable else False
    unpriced = row["api_unpriced_attempts"]
    if applicable and (not isinstance(cost, (int, float)) or not math.isfinite(cost) or cost < 0
                       or lower_bound != (unpriced > 0)
                       or not math.isclose(cost, row["api_known_cost"] if lower_bound else row["api_cost"])):
        raise ValueError(f"Invalid API cost or coverage: {method['id']}")
    note = "Estimated from recorded token usage across all 800 RoboMME-Plus test episodes; excludes local GPU compute."
    if lower_bound:
        note += f" Lower bound: {unpriced:,} API attempts have no recorded price or usage."
    method["api_cost"] = dict(total_usd=cost, approximate=True, lower_bound=lower_bound,
                              unpriced_attempts=unpriced,
                              note=note if applicable else "This model does not use a paid inference API.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results-dir", type=Path, required=True)
    parser.add_argument("--note", required=True, help="Public note describing this evaluation snapshot")
    parser.add_argument("--metrics-json", type=Path,
                        help="Blog overall_metrics.json with token-priced API costs; checked against the rollouts")
    parser.add_argument("--keep-display-costs", action="store_true",
                        help="Keep maintainer-provided approximate API display totals when refreshing outcomes")
    args = parser.parse_args()
    path = ROOT / "data/plus.json"
    original = path.read_bytes()
    data = json.loads(original)
    metrics_snapshot = json.loads(args.metrics_json.read_text()) if args.metrics_json else None
    tasks = [task["id"] for task in data["tasks"]]
    if len(set(tasks)) != 16:
        raise ValueError("Expected all 16 benchmark tasks")
    templates = {method["id"]: method for method in data["methods"]}
    methods = []
    for name in METHODS:
        template = "embodied-astra" if name == "embodied-astra-fs" else name
        method = deepcopy(templates.get(name, templates[template]))
        method["id"] = name
        method["setting"] = "FS" if name == "embodied-astra-fs" else "ZS"
        if name == "embodied-astra-fs":
            method["name"] = "One-shot Embodied-Astra"
        previous_evaluation = method.get("evaluation")
        previous_api_cost = method.get("api_cost", {})
        method["results"], method["evaluation"], measured = read_scores(args.results_dir / name, tasks)
        if metrics_snapshot is not None:
            add_runtime_metrics(method, metrics_snapshot, measured)
        elif previous_evaluation != method["evaluation"]:
            # Do not carry timing or billing from a different evaluation snapshot.
            method.pop("runtime", None)
            method.pop("api_cost", None)
        if previous_evaluation == method["evaluation"] or args.keep_display_costs:
            for key in ("display_usd", "display_note"):
                if key in previous_api_cost:
                    method.setdefault("api_cost", {"approximate": True})[key] = previous_api_cost[key]
        methods.append(method)
        print(f"{method['name']} ({method['setting']}): "
              f"{method['evaluation']['counts'].get('success', 0)}/800", flush=True)
    data["methods"] = methods
    data["evaluation"] = dict(updated_utc=datetime.now(timezone.utc).isoformat(),
                              episodes_per_task=50, note=args.note)
    if path.read_bytes() != original:
        raise RuntimeError("Website data changed while reading results; rerun to preserve those edits")
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


if __name__ == "__main__":
    main()
