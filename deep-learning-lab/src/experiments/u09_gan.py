"""Week 9 · What a GAN's generator is minimizing, and a GAN on eight Gaussians (numpy only, backpropagation by hand).

Part 1 (exact, no randomness). Data N(0, 0.1^2) and a generator N(theta, 0.1^2). With the optimal discriminator the
generator minimizes 2 JS(p_data || p_theta) - log 4 (section 2). The script integrates the Jensen-Shannon divergence
numerically for shifts theta from 0 to 2, next to the Wasserstein distance |theta| that a WGAN uses instead.

Part 2 (simulated data, seeded). Data: a ring of 8 Gaussians of standard deviation 0.05 at radius 2. A generator and
a discriminator, each a ReLU network with two hidden layers of 64 units, are trained against each other with the
non-saturating loss of section 2 (Adam, batches of 256). The script counts how many of the 8 modes the generator's
samples cover, and how many of its samples land near some mode, and shows the samples as training goes on.
"""
import numpy as np


class MLP:
    def __init__(self, rng, sizes):
        self.P = []
        for a, b in zip(sizes, sizes[1:]):
            self.P += [rng.normal(0, np.sqrt(2 / a), (a, b)), np.zeros(b)]
        self.m = [np.zeros_like(p) for p in self.P]; self.v = [np.zeros_like(p) for p in self.P]; self.t = 0

    def forward(self, x):
        self.cache = []
        h = x
        n = len(self.P) // 2
        for i in range(n):
            W, b = self.P[2 * i], self.P[2 * i + 1]
            a = h @ W + b
            self.cache.append((h, a))
            h = np.maximum(0, a) if i < n - 1 else a
        return h

    def backward(self, g):
        """g = d loss / d output; returns (parameter gradients, d loss / d input)."""
        n = len(self.P) // 2
        grads = [None] * len(self.P)
        for i in reversed(range(n)):
            h, a = self.cache[i]
            if i < n - 1:
                g = g * (a > 0)
            grads[2 * i] = h.T @ g; grads[2 * i + 1] = g.sum(0)
            g = g @ self.P[2 * i].T
        return grads, g

    def adam(self, grads, lr=1e-3, b1=0.5, b2=0.999):
        self.t += 1
        for k, g in enumerate(grads):
            self.m[k] = b1 * self.m[k] + (1 - b1) * g; self.v[k] = b2 * self.v[k] + (1 - b2) * g * g
            self.P[k] -= lr * (self.m[k] / (1 - b1 ** self.t)) / (np.sqrt(self.v[k] / (1 - b2 ** self.t)) + 1e-8)


def sig(z):
    return 1 / (1 + np.exp(-np.clip(z, -40, 40)))


def js(theta, s=0.1):
    x = np.linspace(-1.5, theta + 1.5, 200001); dx = x[1] - x[0]
    p = np.exp(-x ** 2 / (2 * s * s)) / (s * np.sqrt(2 * np.pi)); q = np.exp(-(x - theta) ** 2 / (2 * s * s)) / (s * np.sqrt(2 * np.pi))
    m = (p + q) / 2
    with np.errstate(divide="ignore", invalid="ignore"):
        kl = lambda a: np.nansum(np.where(a > 0, a * np.log(a / m), 0)) * dx
    return 0.5 * kl(p) + 0.5 * kl(q)


def run(lab):
    rng = lab.rng
    thetas = [0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0, 2.0]
    J = [js(t) for t in thetas]
    lab.table("Data N(0, 0.1²) against a generator N(θ, 0.1²)", ["shift θ", "Jensen–Shannon divergence (nats; at most ln 2 = 0.6931)", "Wasserstein distance |θ|"],
              [[t, j, t] for t, j in zip(thetas, J)])
    res = {"js_1": J[thetas.index(1.0)], "js_2": J[thetas.index(2.0)], "js_01": J[thetas.index(0.1)]}
    res["js_change_1_2"] = (res["js_1"] - res["js_2"]) / res["js_1"]

    steps, B = int(lab.p("steps", 3000)), 256
    modes = 2 * np.stack([np.cos(2 * np.pi * np.arange(8) / 8), np.sin(2 * np.pi * np.arange(8) / 8)], 1)
    def data(n):
        return modes[rng.integers(0, 8, n)] + rng.normal(0, 0.05, (n, 2))
    G, D = MLP(rng, [2, 64, 64, 2]), MLP(rng, [2, 64, 64, 1])
    def stats(n=4000):
        x = G.forward(rng.normal(size=(n, 2)))
        d = np.linalg.norm(x[:, None, :] - modes[None], axis=2)
        near = d.min(1) < 0.15
        counts = np.bincount(d.argmin(1)[near], minlength=8)
        return x, int((counts >= 0.01 * n).sum()), float(near.mean())
    for t in range(1, steps + 1):
        real, z = data(B), rng.normal(size=(B, 2))
        fake = G.forward(z)
        lr_, lf = D.forward(real), None
        gr, _ = D.backward((sig(lr_) - 1) / B)               # d/dlogit of -log sigmoid(D(real))
        lf = D.forward(fake)
        gf, _ = D.backward(sig(lf) / B)                      # d/dlogit of -log(1 - sigmoid(D(fake)))
        D.adam([a + b for a, b in zip(gr, gf)])
        z = rng.normal(size=(B, 2)); fake = G.forward(z)
        lf = D.forward(fake)
        _, gx = D.backward((sig(lf) - 1) / B)                # non-saturating generator loss -log sigmoid(D(G(z)))
        gG, _ = G.backward(gx)
        G.adam(gG)
        if t % 100 == 0 or t == 1:
            dl = float(np.mean(-np.log(sig(lr_) + 1e-12) - np.log(1 - sig(lf) + 1e-12)))
            lab.report(t, d_loss=dl, g_loss=float(np.mean(-np.log(sig(lf) + 1e-12))))
        if t in (1, steps // 6, steps // 3, steps // 2, steps):
            x, cov, q = stats(1000)
            lab.scatter("Generator samples (blue) and the eight modes (orange)", {"generator": x, "modes": modes}, frame="step %d" % t)
    x, cov, q = stats()
    res.update(modes_covered=cov, near_mode=q)
    lab.log("after %d steps: %d of 8 modes covered, %.0f%% of samples near a mode" % (steps, cov, 100 * q))
    lab.result(**res)
