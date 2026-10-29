# Your Cool Model Name

### [Website]() | [Paper]() | [Code]()

## Introduction
My cool model leverages a novel representation of historical keyframes and maintains a memory cache integrated with a diffusion policy.

## Results

**Setting:** ZS / FS (choose one).

ZS = zero-shot, without RoboMME-Plus training examples. FS = few-shot adaptation using
RoboMME-Plus training examples. If reporting both, provide a separate results table for
each setting.

> We evaluate in a multi-task setting, using a single model checkpoint for all tasks.

> For the action space, only `joint_angle`, `ee_pose`, and `waypoint` are allowed. `multi_choice` is not available for RoboMME-Plus evaluation.

### Table

<table>
<tr>
  <th>Suite</th>
  <th>Task</th>
  <th>Run 1</th>
  <th>Run 2 (optional)</th>
  <th>Run 3 (optional)</th>
  <th><b>Avg</b></th>
</tr>
<tr>
  <td rowspan="4">Counting</td>
  <td>BinFill</td><td></td><td></td><td></td><td></td>
</tr>
<tr><td>PickXtimes</td><td></td><td></td><td></td><td></td></tr>
<tr><td>SwingXtimes</td><td></td><td></td><td></td><td></td></tr>
<tr><td>StopCube</td><td></td><td></td><td></td><td></td></tr>
<tr>
  <td rowspan="4">Permanence</td>
  <td>VideoUnmask</td><td></td><td></td><td></td><td></td>
</tr>
<tr><td>VideoUnmaskSwap</td><td></td><td></td><td></td><td></td></tr>
<tr><td>ButtonUnmask</td><td></td><td></td><td></td><td></td></tr>
<tr><td>ButtonUnmaskSwap</td><td></td><td></td><td></td><td></td></tr>
<tr>
  <td rowspan="4">Reference</td>
  <td>PickHighlight</td><td></td><td></td><td></td><td></td>
</tr>
<tr><td>VideoRepick</td><td></td><td></td><td></td><td></td></tr>
<tr><td>VideoPlaceButton</td><td></td><td></td><td></td><td></td></tr>
<tr><td>VideoPlaceOrder</td><td></td><td></td><td></td><td></td></tr>
<tr>
  <td rowspan="4">Imitation</td>
  <td>MoveCube</td><td></td><td></td><td></td><td></td>
</tr>
<tr><td>InsertPeg</td><td></td><td></td><td></td><td></td></tr>
<tr><td>PatternLock</td><td></td><td></td><td></td><td></td></tr>
<tr><td>RouteStick</td><td></td><td></td><td></td><td></td></tr>
<tr>
  <td colspan="2"><b>Overall</b></td><td></td><td></td><td></td><td></td>
</tr>
</table>


> Multiple runs with different seeds are encouraged but not required.


### Training Details

Share any hyperparameters you would like to include.

### Released Checkpoints

List any fine-tuned checkpoints or code you would like to release.

> We highly encourage authors to fully release their training/eval code and checkpoints to help the community accelerate memory-augmented manipulation.

### Citations
```
```
