"""Week 10 · The perfect denoiser memorizes; a network does not (numpy only, backpropagation by hand).

Data (simulated): 20 training points on the unit circle, at random angles drawn from the seed. The distribution they
come from is uniform on the circle.

Diffusion with T = 100 steps and a linear noise schedule, beta from 0.001 to 0.2 (section 1). Two denoisers predict
the noise eps from (x_t, t):
    exact      the optimal predictor for these 20 points, in closed form: E[x_0 | x_t] is a softmax-weighted average
               of the training points (section 4)
    network    a ReLU network with two hidden layers of 128 units, trained on the same 20 points with the simplified
               loss |eps - eps_theta(x_t, t)|^2 (section 3), Adam, 4,000 steps
Each samples 1,000 points by the ancestral sampler of section 2. The script measures how many samples land on the
circle (within 0.05 of radius 1) and how many land on a training point (within 0.05 of one of the 20).
"""
import numpy as np

T = 100
BETA = np.linspace(1e-3, 0.2, T)
ALPHA = 1 - BETA
ABAR = np.cumprod(ALPHA)


def temb(t):
    k = np.arange(8)
    f = (t[:, None] / T) * (2.0 ** k)[None, :] * np.pi
    return np.concatenate([np.sin(f), np.cos(f)], 1)


class MLP:
    def __init__(self, rng, sizes):
        self.P = []
        for a, b in zip(sizes, sizes[1:]):
            self.P += [rng.normal(0, np.sqrt(2 / a), (a, b)), np.zeros(b)]
        self.m = [np.zeros_like(p) for p in self.P]; self.v = [np.zeros_like(p) for p in self.P]; self.t = 0

    def forward(self, x):
        self.cache = []; h = x; n = len(self.P) // 2
        for i in range(n):
            a = h @ self.P[2 * i] + self.P[2 * i + 1]; self.cache.append((h, a))
            h = np.maximum(0, a) if i < n - 1 else a
        return h

    def backward(self, g):
        n = len(self.P) // 2; grads = [None] * len(self.P)
        for i in reversed(range(n)):
            h, a = self.cache[i]
            if i < n - 1:
                g = g * (a > 0)
            grads[2 * i] = h.T @ g; grads[2 * i + 1] = g.sum(0); g = g @ self.P[2 * i].T
        return grads

    def adam(self, grads, lr):
        self.t += 1
        for k, g in enumerate(grads):
            self.m[k] = 0.9 * self.m[k] + 0.1 * g; self.v[k] = 0.999 * self.v[k] + 0.001 * g * g
            self.P[k] -= lr * (self.m[k] / (1 - 0.9 ** self.t)) / (np.sqrt(self.v[k] / (1 - 0.999 ** self.t)) + 1e-8)


def exact_eps(x, t, data):
    ab = ABAR[t]
    d2 = ((x[:, None, :] - np.sqrt(ab) * data[None]) ** 2).sum(2)
    w = np.exp(-(d2 - d2.min(1, keepdims=True)) / (2 * (1 - ab)))
    w /= w.sum(1, keepdims=True)
    x0 = w @ data
    return (x - np.sqrt(ab) * x0) / np.sqrt(1 - ab)


def sample(rng, eps_fn, n):
    x = rng.normal(size=(n, 2))
    for t in reversed(range(T)):
        e = eps_fn(x, t)
        mean = (x - BETA[t] / np.sqrt(1 - ABAR[t]) * e) / np.sqrt(ALPHA[t])
        if t > 0:
            var = BETA[t] * (1 - ABAR[t - 1]) / (1 - ABAR[t])          # the posterior variance of section 2
            x = mean + np.sqrt(var) * rng.normal(size=x.shape)
        else:
            x = mean
    return x


def run(lab):
    rng = lab.rng
    n_train, steps = int(lab.p("points", 20)), int(lab.p("steps", 4000))
    ang = rng.uniform(0, 2 * np.pi, n_train)
    data = np.stack([np.cos(ang), np.sin(ang)], 1)
    net = MLP(rng, [2 + 16, 128, 128, 2])
    for s in range(1, steps + 1):
        x0 = data[rng.integers(0, n_train, 256)]
        t = rng.integers(0, T, 256)
        eps = rng.normal(size=x0.shape)
        xt = np.sqrt(ABAR[t])[:, None] * x0 + np.sqrt(1 - ABAR[t])[:, None] * eps
        out = net.forward(np.concatenate([xt, temb(t)], 1))
        loss = ((out - eps) ** 2).sum(1).mean()
        net.adam(net.backward(2 * (out - eps) / 256), 1e-3)
        if s % 100 == 0 or s == 1:
            lab.report(s, loss=float(loss))
    res, rows, pts = {}, [], {}
    for name, fn in (("exact", lambda x, t: exact_eps(x, t, data)), ("network", lambda x, t: net.forward(np.concatenate([x, temb(np.full(len(x), t))], 1)))):
        x = sample(rng, fn, 1000)
        r = np.linalg.norm(x, axis=1)
        dmin = np.linalg.norm(x[:, None, :] - data[None], axis=2).min(1)
        on, mem = float((np.abs(r - 1) < 0.05).mean()), float((dmin < 0.05).mean())
        res["on_circle_" + name], res["memorized_" + name] = on, mem
        rows.append([{"exact": "exact optimal denoiser", "network": "trained network"}[name], on, mem])
        pts[name] = x
    lab.table("1,000 samples from each denoiser, %d training points" % n_train, ["denoiser", "on the circle (within 0.05)", "on a training point (within 0.05)"], rows)
    lab.scatter("Samples (blue) and the training points (orange)", {"exact optimal denoiser": pts["exact"], "training points": data}, frame="exact denoiser")
    lab.scatter("Samples (blue) and the training points (orange)", {"trained network": pts["network"], "training points": data}, frame="trained network")
    lab.result(**res)
