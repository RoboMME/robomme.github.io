# RoboMME Website

Static project website. No build step is required.

To preview locally, run this command from the repository root and open
<http://localhost:8851/plus.html>:

```bash
python3 scripts/serve_preview.py --port 8851
```

The preview server supports byte-range requests so video seeking works locally.

The RoboMME-Plus **Blog** button opens `blog/`. Preview it at
<http://localhost:8851/blog/> using the same server. The folder includes the article,
interactive figures, data, logos, and compressed rollout videos as local files.
To refresh it from the blog source without committing or pushing, run
`python3 /home/daiyp/robomme/scripts/blog/publish_github_io.py`.

For a public RoboMME-Plus preview, run `python3 scripts/serve_preview.py --bind 127.0.0.1
--port 8852 --public-plus`, then point a Cloudflare tunnel at
`http://127.0.0.1:8852`. This mode opens directly on RoboMME-Plus and serves only
website pages and assets, excluding repository files and directory listings.

The RoboMME-Plus page lives in `plus.html`. It shares `main.css` with the RoboMME
main page; `plus.css` adds RoboMME-Plus styling and sample carousel controls. Task behavior lives
in `plus.js`. Edit `data/plus.json` to update task descriptions, samples, and the
evaluation methods. Serve the site over HTTP so the page can load that file.

The RoboMME-Plus protocol evaluates zero-shot transfer or few-shot adaptation from
RoboMME. There are 50 training examples and 800 test episodes. The page links to
the [HDF5 training data](https://huggingface.co/datasets/Yinpei/robomme_ood_data_h5)
and the [Hugging Face collection](https://huggingface.co/collections/Yinpei/robomme-ood).

- **Videos:** all 50 training clips and their poster images are included under
  `video/plus/`. These are real files, not symlinks or references to local datasets.
  Front and wrist cameras appear side by side at 512×256, with the full episode
  retained at 20 fps. H.264 compression and fast-start MP4 support browser playback.
  The 50 MP4s total about 57.0 MiB; the largest is about 3.5 MiB.
  A sample's `video` uses a relative path, such as
  `video/plus/BinFill/sample-1.mp4`. Video and poster URLs include a content hash
  so refreshed recordings load even when their seeds and filenames stay the same.
  An optional `poster` path sets its preview image.
  Videos load on demand and use native controls; playing one pauses the others.
  The playback selector offers 1× (default), 2×, and 4×. Episode goals and the
  demonstration/execution boundary come from the training records.
  A red border is embedded in demonstration frames and ends at the first
  execution frame, including in fullscreen and downloaded videos.
- **Teaser:** `video/plus-teaser.mp4` is the supplied overview video with the central title
  panel updated to RoboMME-Plus,
  with `video/plus-teaser.jpg` as its poster. It appears below the main buttons,
  autoplays muted, loops, and defaults to 1.5× playback independently of the task
  examples. Include both files when uploading the website.
- **Grounded subgoals:** “Show grounded subgoals” beside Playback toggles captions
  above all RoboMME-Plus sample videos. They are hidden by default and follow the displayed
  frame when playing, pausing, seeking, changing speed, or switching samples.
  Captions preserve the training record's `grounded_subgoal_online` text and
  coordinates; frames without an annotation display a short unavailable message.
  Each sample's `subgoals` URL points to a local, versioned `.subgoals.json` file
  alongside its MP4. It stores the video frame rate/count and `[frame, text]`
  changes, including the demonstration/execution boundary. Captions load on demand.
- **Leaderboard tracks:** Standard ranks open-source methods; Agentic ranks methods
  that use proprietary frontier models. Standard also shows Agentic methods as
  muted, unranked references; Agentic hides Standard methods. Combined ranking
  compares both tracks. Human Performance is always shown on the regular
  leaderboard, with other oracle references controlled separately. Rankings,
  best-score highlights, and radar plots follow the selected track. RoboMME-Plus
  keeps its ZS/FS setting within each track. Details show model type and parameter
  counts for Standard, API cost for Agentic, and both for Combined ranking.
- **Results:** replace a method's per-task `null` values with success rates
  between `0` and `1`. For example, `"BinFill": 0.5` displays `50.00`.
  Unreported values stay as dashes. Suite and overall means appear only when
  all their tasks have scores; only complete methods receive an overall rank.
  Set each RoboMME-Plus method's `setting` to `"ZS"` (zero-shot) or `"FS"` (few-shot).
  The Setting column is always visible on the RoboMME-Plus leaderboard; `null` displays
  a dash until reported. Use separate entries with unique IDs when reporting
  both settings for one model. Radar labels also include the setting.
  `scripts/prepare_plus_results.py --results-dir /path/to/plus_eval_1019 --note
  "Description of these completed evaluations"` imports the six published runs,
  checking all 800 episode outcomes and their per-task summaries for each method.
  Add `--metrics-json /path/to/blog/site/data/overall_metrics.json` to import the
  blog's API cost estimates for “Show details,” retaining runtime metrics in the
  data snapshot. Episode
  outcomes and timings must match the rollout records. Maintainer-provided
  `api_cost.display_usd` totals take precedence over the recorded usage estimate
  and survive imports of the same evaluation snapshot. Use `--keep-display-costs`
  to retain those approximate totals when refreshing outcomes; stale runtime and
  token-usage estimates are still removed. Without a display total,
  costs with unpriced requests are marked as lower bounds; local models show N/A.
  RoboMME-Plus-finetuned FrameSamp variants are excluded. The snapshot note is retained
  in the JSON for provenance and is not displayed on the leaderboard.
- **Samples:** each task shows one video at a time in the two-column card layout.
  Tasks open on their Medium example by default; MoveCube opens on its first method.
  Arrows cycle through three examples, or all five methods for MoveCube.
  The selected episode's instruction appears above the video. Below it, sample
  labels include Easy, Medium, or Hard, and the comparison shows only that level's
  RoboMME and RoboMME-Plus settings (`task.comparisons.easy`, `.medium`, `.hard`).
  InsertPeg also uses these three levels, with progressively tighter openings.
  MoveCube has no difficulty levels and uses `task.comparison`.
  Each pair of cards shares instruction, subgoal, timeline, and comparison heights so
  videos and card edges stay aligned within that row, including when samples change. Each task keeps its
  selected sample when switching suites.
  “Hide comparisons” / “Show comparisons” beside Playback toggles the comparison
  rows across all tasks, preserving the selected samples and aligned cards.
- **Original examples:** the “RoboMME original sample” bubble opens a movable floating
  card with the original task's instruction and video. Both videos can play at
  once and follow the Playback speed selector, including while the card is open.
  Drag the panel's header to move it; close it with ×, Escape, or the same
  bubble. These examples use `task.robomme_example` and the existing
  `video/<Task>.mp4` files from the main page (`video/DrawPattern.mp4` for
  PatternLock). Include those 16 files when uploading the RoboMME-Plus page separately.

Upload the website with the complete `video/plus/` directory, along with
`plus.html`, `plus.css`, `plus.js`, `main.css`, `data/plus.json`, and `docs/`. The local preview
and GitHub Pages use the same relative asset paths; no media server is needed.

To rebuild examples from the training export, install `h5py` and FFmpeg and run:

```bash
python scripts/prepare_plus_videos.py \
  --training-dir /path/to/robomme_plus_train \
  --metadata-dir /path/to/robomme/src/robomme_plus/env_metadata/train
```

The script checks training seeds, successful episode flags, camera frame counts,
and phase alignment, then writes compressed videos, posters, synchronized grounded
subgoal files, and sample entries. Add `--subgoals-only` to attach captions to
existing matching clips without re-encoding. Rebuild changed recordings first.
It preserves the descriptions, comparisons, and leaderboard results in the JSON.

Both leaderboards live in `leaderboard.html`. The benchmark selector switches
the same table between RoboMME and RoboMME-Plus without navigating away. Open
`leaderboard.html?benchmark=plus` to select RoboMME-Plus directly. Both benchmarks use the
existing table, details, filters, sorting, grouping, and radar view; unreported
RoboMME-Plus scores remain dashes and radar is enabled once a method is fully evaluated.
Their shared appearance lives in `leaderboard.css`: RoboMME uses a blue accent and
📊, while RoboMME-Plus uses an indigo accent and 🧭, on a plain white background.
Method categories keep the same colors in both views.
The six RoboMME-Plus entries are all selected by default: FrameSamp+Modul, SimpleMemVLA,
PonderPounce, Embodied-Astra, One-shot Embodied-Astra, and 3-tier Astra.
One-shot Embodied-Astra is labeled FS; the other five entries are labeled ZS.
Results are maintained in the website data file; the page does not run evaluations
or automatically read local evaluation outputs.

## Naming compatibility

RoboMME-OOD is now RoboMME-Plus. `ood.html` redirects to `plus.html`, preserving
query strings and anchors; the leaderboard accepts `benchmark=ood` and
normalizes it to `benchmark=plus`. New links use the Plus names.
Published Hugging Face dataset and collection URLs retain their existing names.
Result importers accept both `robomme_plus` and legacy `robomme_ood` records.
