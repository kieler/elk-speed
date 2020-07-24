import json
import matplotlib.pyplot as plt
import sys

x_label = sys.argv[1]
y_label = sys.argv[2]
title = sys.argv[3]
x = json.loads(sys.argv[4])
x_tick_labels = json.loads(sys.argv[5])
filename = sys.argv[6]

ax = plt.axes()
plt.boxplot(x)

plt.grid(axis='y', color='#eeeeee')

plt.title(title, { 'fontsize': 8 })
plt.xlabel(x_label)
plt.ylabel(y_label)

plt.xticks(rotation=45)
ax.set_xticklabels(x_tick_labels)

plt.tight_layout()

plt.savefig(filename)
