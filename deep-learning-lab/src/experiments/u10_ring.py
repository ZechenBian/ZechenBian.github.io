"""Week 10 · A diffusion model on a ring of points, every step shown (numpy only, backpropagation by hand).

Data (simulated): points on the unit circle at angles drawn uniformly from the seed, fresh ones at every training step.

Forward process: T = 100 steps, beta linear from 0.001 to 0.2, so that x_t = sqrt(abar_t) x_0 + sqrt(1 - abar_t) eps
(section 1); at t = 100, sqrt(abar) is below 0.005 and x_100 is standard noise to within a fraction of a percent. A ReLU network with two hidden layers of
128 units predicts eps from x_t and a sinusoidal code of t, trained with the simplified loss |eps - eps_theta|^2
(section 3), Adam, 4,000 steps of 256 points. Then 1,000 points start from noise and run back with one of three samplers:
    ancestral   x_{t-1} = mean + sigma_t z, the posterior mean and variance of section 2 (DDPM)
    mean        the same mean, with the fresh noise sigma_t z left out
    ddim        the deterministic sampler of section 5: estimate x_0, then step to the level of noise t - 1
Measured: the mean distance of the samples from the centre, and the share within 0.1 of the circle.
"""
import numpy as np

T = 100
BETA = np.linspace(1e-3, 0.2, T)
ALPHA = 1 - BETA
ABAR = np.cumprod(ALPHA)
NAMES = {"ancestral": "ancestral sampler (DDPM)", "mean": "mean only, no fresh noise", "ddim": "deterministic (DDIM)"}


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


def ring(rng, n):
    a = rng.uniform(0, 2 * np.pi, n)
    return np.stack([np.cos(a), np.sin(a)], 1)


def run(lab):
    rng = lab.rng
    steps, sampler = int(lab.p("steps", 4000)), str(lab.p("sampler", "ancestral"))
    if sampler not in NAMES:
        raise ValueError("sampler must be ancestral, mean or ddim")
    x0 = ring(rng, 1000)
    for t in (0, 10, 25, 50, 75, 100):
        xt = x0 if t == 0 else np.sqrt(ABAR[t - 1]) * x0 + np.sqrt(1 - ABAR[t - 1]) * rng.normal(size=x0.shape)
        lab.scatter("Forward: noise added step by step", {"x_t": xt}, frame="t = %d" % t)
    net = MLP(rng, [2 + 16, 128, 128, 2])
    for s in range(1, steps + 1):
        x0 = ring(rng, 256)
        t = rng.integers(0, T, 256)
        eps = rng.normal(size=x0.shape)
        xt = np.sqrt(ABAR[t])[:, None] * x0 + np.sqrt(1 - ABAR[t])[:, None] * eps
        out = net.forward(np.concatenate([xt, temb(t)], 1))
        loss = ((out - eps) ** 2).sum(1).mean()
        net.adam(net.backward(2 * (out - eps) / 256), 1e-3)
        if s % 100 == 0 or s == 1:
            lab.report(s, loss=float(loss))
    x = rng.normal(size=(1000, 2))
    lab.scatter("Backward: " + NAMES[sampler], {"samples": x}, frame="t = 100")
    for t in reversed(range(T)):
        e = net.forward(np.concatenate([x, temb(np.full(len(x), t))], 1))
        if sampler == "ddim":
            xhat = (x - np.sqrt(1 - ABAR[t]) * e) / np.sqrt(ABAR[t])
            x = np.sqrt(ABAR[t - 1]) * xhat + np.sqrt(1 - ABAR[t - 1]) * e if t > 0 else xhat
        else:
            x = (x - BETA[t] / np.sqrt(1 - ABAR[t]) * e) / np.sqrt(ALPHA[t])
            if t > 0 and sampler == "ancestral":
                x = x + np.sqrt(BETA[t] * (1 - ABAR[t - 1]) / (1 - ABAR[t])) * rng.normal(size=x.shape)
        if t in (75, 50, 25, 10, 0):
            lab.scatter("Backward: " + NAMES[sampler], {"samples": x}, frame="t = %d" % t)
    r = np.linalg.norm(x, axis=1)
    res = {"radius": float(r.mean()), "on_ring": float((np.abs(r - 1) < 0.1).mean()), "radius_sd": float(r.std()), "loss": float(loss)}
    lab.table("1,000 samples, " + NAMES[sampler], ["mean distance from the centre", "share within 0.1 of the circle", "spread of the distance (sd)"], [[res["radius"], res["on_ring"], res["radius_sd"]]])
    lab.result(**res)
