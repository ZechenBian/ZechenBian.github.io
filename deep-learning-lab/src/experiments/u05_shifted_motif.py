"""Week 5 · Translation: what a convolution gets for free (numpy only, gradients written out by hand).

Data: sequences of 32 numbers, Gaussian noise with standard deviation 0.5. Half of them contain a fixed motif of
length 5 added somewhere; the task is to say whether the motif is there. In the training set the motif only ever
starts in the left half (positions 0 to 11); the test set puts it in the right half (positions 16 to 27).

Two models, trained the same way (full-batch gradient descent on the cross-entropy):
    convolution   one filter of width 5 slid along the sequence, then the maximum over positions, then a logistic
                  output: 5 + 1 + 2 parameters
    dense         a hidden layer of 32 ReLU units on the whole sequence, then a logistic output: 32 * 32 + 32 + 33
                  parameters
"""
import numpy as np

L, K = 32, 5
MOTIF = np.array([1.0, -1.0, 1.5, -1.0, 1.0])


def make(rng, n, lo, hi):
    x = rng.normal(0, 0.5, (n, L))
    y = (rng.random(n) < 0.5).astype(float)
    pos = rng.integers(lo, hi + 1, n)
    for i in np.nonzero(y)[0]:
        x[i, pos[i]:pos[i] + K] += MOTIF
    return x, y


def sig(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def conv_forward(p, x):
    win = np.lib.stride_tricks.sliding_window_view(x, K, axis=1)       # (n, L - K + 1, K)
    a = win @ p["w"] + p["b"]
    j = a.argmax(axis=1)
    m = a[np.arange(len(x)), j]
    return sig(p["v"] * m + p["c"]), (win, j, m)


def conv_step(p, x, y, lr):
    q, (win, j, m) = conv_forward(p, x)
    g = (q - y) / len(x)                                                # d loss / d logit
    gm = g * p["v"]
    grads = {"v": (g * m).sum(), "c": g.sum(), "w": (gm[:, None] * win[np.arange(len(x)), j]).sum(0), "b": gm.sum()}
    for k in p:
        p[k] = p[k] - lr * grads[k]


def dense_forward(p, x):
    h = np.maximum(0, x @ p["W"] + p["b"])
    return sig(h @ p["v"] + p["c"]), h


def dense_step(p, x, y, lr):
    q, h = dense_forward(p, x)
    g = (q - y) / len(x)
    gh = np.outer(g, p["v"]) * (h > 0)
    grads = {"v": h.T @ g, "c": g.sum(), "W": x.T @ gh, "b": gh.sum(0)}
    for k in p:
        p[k] = p[k] - lr * grads[k]


def acc(q, y):
    return float(((q > 0.5) == (y > 0.5)).mean())


def run(lab):
    rng = lab.rng
    n, steps = int(lab.p("train", 2000)), int(lab.p("steps", 1500))
    xtr, ytr = make(rng, n, 0, 11)
    xin, yin = make(rng, 2000, 0, 11)          # test, same positions as training
    xsh, ysh = make(rng, 2000, 16, 27)         # test, shifted to the right half
    conv = {"w": rng.normal(0, 0.3, K), "b": 0.0, "v": 1.0, "c": 0.0}
    dense = {"W": rng.normal(0, np.sqrt(2 / L), (L, 32)), "b": np.zeros(32), "v": rng.normal(0, np.sqrt(1 / 32), 32), "c": 0.0}
    for t in range(1, steps + 1):
        conv_step(conv, xtr, ytr, 0.5)
        dense_step(dense, xtr, ytr, 0.5)
        if t % 50 == 0 or t == 1:
            lab.report(t, conv_train=acc(conv_forward(conv, xtr)[0], ytr), dense_train=acc(dense_forward(dense, xtr)[0], ytr),
                       conv_shift=acc(conv_forward(conv, xsh)[0], ysh), dense_shift=acc(dense_forward(dense, xsh)[0], ysh))
    res = {}
    rows = []
    for name, f, p in (("convolution + max", conv_forward, conv), ("dense hidden layer", dense_forward, dense)):
        a = [acc(f(p, xtr)[0], ytr), acc(f(p, xin)[0], yin), acc(f(p, xsh)[0], ysh)]
        k = "conv" if name.startswith("conv") else "dense"
        res[k + "_train"], res[k + "_same"], res[k + "_shifted"] = a
        rows.append([name, sum(np.size(v) for v in p.values())] + a)
    lab.table("Accuracy after %d steps" % steps, ["model", "parameters", "training set", "test, motif in the left half", "test, motif in the right half"], rows)
    lab.table("The convolution's learned filter against the motif", ["", "1", "2", "3", "4", "5"],
              [["motif"] + [float(v) for v in MOTIF], ["filter (scaled to the same norm)"] + [float(v) for v in conv["w"] / np.linalg.norm(conv["w"]) * np.linalg.norm(MOTIF)]])
    res["filter_cos"] = float(conv["w"] @ MOTIF / np.linalg.norm(conv["w"]) / np.linalg.norm(MOTIF))
    lab.result(**res)
