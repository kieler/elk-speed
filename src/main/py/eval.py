import json
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import sys

x_label = sys.argv[1]
y_label = sys.argv[2]
title = sys.argv[3]
x = json.loads(sys.argv[4])
x_tick_labels = json.loads(sys.argv[5])
filename = sys.argv[6]
y_lim = sys.argv[7]
mode = sys.argv[8] if len(sys.argv) > 8 else "single"

ax = plt.axes()

if mode == "grouped":
    bucket_count = len(x_tick_labels)
    series_count = len(x)
    group_width = 0.75
    step = group_width / max(series_count, 1)
    offsets = [(-group_width / 2) + (i + 0.5) * step for i in range(series_count)]
    centers = list(range(1, bucket_count + 1))
    legend_handles = []

    for series_index, item in enumerate(x):
        color = item['color']
        positions = [center + offsets[series_index] for center in centers]
        bp = ax.boxplot(
            item['values'],
            positions=positions,
            widths=step * 0.85,
            patch_artist=True,
            showfliers=True,
            showmeans=True,
            meanline=True,
            flierprops={
                'markersize': 1,
            },
        )
        for box in bp['boxes']:
            box.set(facecolor=color, edgecolor=color, linewidth=1.4, alpha=0.75)
        for whisker in bp['whiskers']:
            whisker.set(color=color, linewidth=1.2)
        for cap in bp['caps']:
            cap.set(color=color, linewidth=1.2)
        for median in bp['medians']:
            median.set(color='white', linewidth=1.4)
        for mean in bp['means']:
            mean.set(color=color, linewidth=2.0)
        legend_handles.append(Patch(facecolor=color, edgecolor=color, label=item['label']))

    ax.set_xticks(centers)
    ax.set_xticklabels(x_tick_labels, rotation=45)
    ax.legend(handles=legend_handles, loc='upper right', fontsize=8)
else:
    plt.boxplot(
        x,
        flierprops={
            'markersize': 1,
        },
    )
    plt.xticks(rotation=45)
    ax.set_xticklabels(x_tick_labels)

plt.grid(axis='y', color='#eeeeee')

plt.title(title, { 'fontsize': 8 })
plt.xlabel(x_label)
plt.ylabel(y_label)

if y_lim != "auto":
    plt.ylim(top=float(y_lim))

plt.tight_layout()

plt.savefig(filename)
