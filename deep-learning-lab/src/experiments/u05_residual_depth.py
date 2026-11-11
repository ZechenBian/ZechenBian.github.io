"""Week 5 · Deeper is worse, until the layers are residual (numpy only, gradients written out by hand).

Data (simulated in the script): 512 inputs x in R^8 and targets y = x + 0.3 sin(A x) for a fixed random matrix A,
a map that is mostly the identity.

Four networks of width 32, each with a linear input layer, a stack of blocks, and a linear output layer, trained the
same way (Adam, learning rate 0.003, full batch, 1,500 steps) on the mean squared error:
    plain       each block is h -> relu(W h + b), weights drawn with the He initialization of week 4
    residual    each block is h -> h + V relu(W h + b), the same W, and V drawn small, so that each block starts
                close to the identity (section 5)
at depths of 4 and 32 blocks. The question is the training loss: how well can each network fit the data it sees?
"""
import numpy as np


def near_identity(rng, n=512, d=8):
    """Inputs x in R^8 and targets y = x + 0.3 sin(A x): a map that is mostly the identity."""
    A = rng.normal(0, 1 / np.sqrt(d), (d, d))
    x = rng.normal(size=(n, d))
    return x, x + 0.3 * np.sin(x @ A)


class Net:
    def __init__(self, rng, depth, residual, width=32):
        self.res, self.depth = residual, depth
        self.P = {"Win": rng.normal(0, np.sqrt(1 / 8), (8, width)), "bin": np.zeros(width), "Wout": rng.normal(0, np.sqrt(1 / width), (width, 8)), "bout": np.zeros(8)}
        for l in range(depth):
            self.P["W%d" % l] = rng.normal(0, np.sqrt(2 / width), (width, width))
            self.P["b%d" % l] = np.zeros(width)
            if residual:
                self.P["V%d" % l] = rng.normal(0, np.sqrt(2 / width) / depth, (width, width))
        self.m = {k: np.zeros_like(v) for k, v in self.P.items()}
        self.v = {k: np.zeros_like(v) for k, v in self.P.items()}
        self.t = 0

    def loss_grad(self, x, y):
        P, cache = self.P, []
        h = x @ P["Win"] + P["bin"]
        for l in range(self.depth):
            a = h @ P["W%d" % l] + P["b%d" % l]
            r = np.maximum(0, a)
            cache.append((h, a, r))
            h = h + r @ P["V%d" % l] if self.res else r
        z = h @ P["Wout"] + P["bout"]
        n = len(x)
        loss = float(((z - y) ** 2).sum(1).mean())
        G = {}
        gz = 2 * (z - y) / n
        G["Wout"] = h.T @ gz
        G["bout"] = gz.sum(0)
        gh = gz @ P["Wout"].T
        norms = []
        for l in reversed(range(self.depth)):
            hin, a, r = cache[l]
            if self.res:
                G["V%d" % l] = r.T @ gh
                ga = (gh @ P["V%d" % l].T) * (a > 0)
                G["W%d" % l] = hin.T @ ga
                G["b%d" % l] = ga.sum(0)
                gh = gh + ga @ P["W%d" % l].T
            else:
                ga = gh * (a > 0)
                G["W%d" % l] = hin.T @ ga
                G["b%d" % l] = ga.sum(0)
                gh = ga @ P["W%d" % l].T
            norms.append(float(np.linalg.norm(G["W%d" % l])))
        G["Win"] = x.T @ gh
        G["bin"] = gh.sum(0)
        return loss, G, norms[::-1]

    def adam(self, G, lr=3e-3, b1=0.9, b2=0.999):
        self.t += 1
        for k in self.P:
            self.m[k] = b1 * self.m[k] + (1 - b1) * G[k]
            self.v[k] = b2 * self.v[k] + (1 - b2) * G[k] ** 2
            mh, vh = self.m[k] / (1 - b1 ** self.t), self.v[k] / (1 - b2 ** self.t)
            self.P[k] -= lr * mh / (np.sqrt(vh) + 1e-8)


def run(lab):
    rng = lab.rng
    x, y = near_identity(rng)
    steps, deep = int(lab.p("steps", 1500)), int(lab.p("deep", 32))
    nets = {"plain_4": Net(rng, 4, False), "plain_%d" % deep: Net(rng, deep, False), "res_4": Net(rng, 4, True), "res_%d" % deep: Net(rng, deep, True)}
    first = {}
    final = {}
    for t in range(1, steps + 1):
        rep = {}
        for k, net in nets.items():
            loss, G, norms = net.loss_grad(x, y)
            if t == 1:
                first[k] = norms
            if not np.isfinite(loss):
                loss = 99.0
            net.adam(G)
            rep[k] = loss
            final[k] = loss
        if t % 10 == 0 or t == 1:
            lab.report(t, **{k.replace("_", "") : v for k, v in rep.items()})
    rows = []
    for k in nets:
        kind, d = k.split("_")
        nm = first[k]
        rows.append([("plain" if kind == "plain" else "residual") + ", " + d + " blocks", final[k], nm[0], nm[-1], nm[0] / nm[-1]])
    lab.table("Training loss (mean squared error) after %d steps; predicting y = x would score %.3f" % (steps, float(((y - x) ** 2).sum(1).mean())),
              ["network", "final training loss", "gradient norm, first block (step 1)", "gradient norm, last block (step 1)", "ratio first / last"], rows)
    res = {"loss_" + k: v for k, v in final.items()}
    res.update(identity_loss=float(((y - x) ** 2).sum(1).mean()), plain_ratio=final["plain_%d" % deep] / final["plain_4"], deep=deep, plain_gap=final["plain_%d" % deep] - final["plain_4"], res_gap=final["res_%d" % deep] - final["res_4"])
    lab.result(**res)
