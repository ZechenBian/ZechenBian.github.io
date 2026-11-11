"""Week 6 · Remembering across a delay: a plain RNN against an additive cell (numpy only, backpropagation through time
written out by hand).

Task (simulated): a sequence of length D + 1. At the first step the input says either "A" or "B"; for the next D steps
the input is noise. After the last step the network must say which letter came first. Chance is 50%.

Two recurrent networks with 16 hidden units, trained the same way (Adam, batches of 64, cross-entropy at the last step):
    plain RNN       h_t = tanh(W x_t + U h_(t-1) + b)
    additive cell   c_t = c_(t-1) + i_t * g_t,  h_t = tanh(c_t), with an input gate i_t = sigmoid(...) and a candidate
                    g_t = tanh(...): the core of the LSTM without its forget gate (section 3)
The script also measures, at initialization, how large the gradient of the loss is with respect to the first hidden
state, compared with the last: the quantity that the product of Jacobians in section 2 controls.
"""
import numpy as np

H, X = 16, 3      # hidden units; inputs: one-hot A, one-hot B, and a noise channel


def batch(rng, n, D):
    x = np.zeros((D + 1, n, X))
    y = rng.integers(0, 2, n)
    x[0, np.arange(n), y] = 1.0
    x[1:, :, 2] = rng.normal(0, 1, (D, n))
    return x, y


def init(rng, kind):
    s = 1 / np.sqrt(H)
    P = {"V": rng.normal(0, s, (H, 2)), "c": np.zeros(2)}
    if kind == "plain":
        P.update(W=rng.normal(0, 1, (X, H)), U=rng.normal(0, s, (H, H)), b=np.zeros(H))
    else:
        P.update(Wi=rng.normal(0, 1, (X, H)), Ui=rng.normal(0, s, (H, H)), bi=np.zeros(H),
                 Wg=rng.normal(0, 1, (X, H)), Ug=rng.normal(0, s, (H, H)), bg=np.zeros(H))
    return P


def sig(z):
    return 1 / (1 + np.exp(-z))


def loss_grad(P, kind, x, y):
    T, n, _ = x.shape
    G = {k: np.zeros_like(v) for k, v in P.items()}
    h = np.zeros((n, H)); c = np.zeros((n, H)); cache = []
    for t in range(T):
        if kind == "plain":
            hn = np.tanh(x[t] @ P["W"] + h @ P["U"] + P["b"])
            cache.append((h, hn)); h = hn
        else:
            i = sig(x[t] @ P["Wi"] + h @ P["Ui"] + P["bi"]); g = np.tanh(x[t] @ P["Wg"] + h @ P["Ug"] + P["bg"])
            cn = c + i * g; hn = np.tanh(cn)
            cache.append((h, c, i, g, cn, hn)); h, c = hn, cn
    z = h @ P["V"] + P["c"]; z = z - z.max(1, keepdims=True); q = np.exp(z) / np.exp(z).sum(1, keepdims=True)
    loss = float(-np.log(q[np.arange(n), y] + 1e-12).mean())
    gz = q.copy(); gz[np.arange(n), y] -= 1; gz /= n
    G["V"] = h.T @ gz; G["c"] = gz.sum(0)
    gh = gz @ P["V"].T; gc = np.zeros((n, H)); norms = []
    for t in reversed(range(T)):
        norms.append(float(np.linalg.norm(gh + (gc if kind != "plain" else 0))))
        if kind == "plain":
            hp, hn = cache[t]
            ga = gh * (1 - hn ** 2)
            G["W"] += x[t].T @ ga; G["U"] += hp.T @ ga; G["b"] += ga.sum(0)
            gh = ga @ P["U"].T
        else:
            hp, cp, i, g, cn, hn = cache[t]
            gcn = gc + gh * (1 - hn ** 2)
            gi = gcn * g * i * (1 - i); gg = gcn * i * (1 - g ** 2)
            G["Wi"] += x[t].T @ gi; G["Ui"] += hp.T @ gi; G["bi"] += gi.sum(0)
            G["Wg"] += x[t].T @ gg; G["Ug"] += hp.T @ gg; G["bg"] += gg.sum(0)
            gh = gi @ P["Ui"].T + gg @ P["Ug"].T
            gc = gcn
    acc = float((q.argmax(1) == y).mean())
    return loss, acc, G, norms[::-1]


class Adam:
    def __init__(self, P, lr):
        self.m = {k: np.zeros_like(v) for k, v in P.items()}; self.v = {k: np.zeros_like(v) for k, v in P.items()}; self.t, self.lr = 0, lr

    def step(self, P, G):
        self.t += 1
        for k in P:
            g = np.clip(G[k], -5, 5)
            self.m[k] = 0.9 * self.m[k] + 0.1 * g; self.v[k] = 0.999 * self.v[k] + 0.001 * g * g
            P[k] -= self.lr * (self.m[k] / (1 - 0.9 ** self.t)) / (np.sqrt(self.v[k] / (1 - 0.999 ** self.t)) + 1e-8)


def run(lab):
    rng = lab.rng
    D, steps = int(lab.p("delay", 60)), int(lab.p("steps", 800))
    res, rows = {}, []
    nets = {k: init(rng, k) for k in ("plain", "additive")}
    xt, yt = batch(rng, 1000, D)
    for k, P in nets.items():
        _, _, _, norms = loss_grad(P, k, xt, yt)
        res["grad_ratio_" + k] = norms[0] / norms[-1]
    opts = {k: Adam(P, 0.01) for k, P in nets.items()}
    for s in range(1, steps + 1):
        x, y = batch(rng, 64, D)
        rep = {}
        for k, P in nets.items():
            loss, acc, G, _ = loss_grad(P, k, x, y)
            opts[k].step(P, G); rep[k] = loss
        if s % 20 == 0 or s == 1:
            lab.report(s, **rep)
    for k, P in nets.items():
        loss, acc, _, _ = loss_grad(P, k, xt, yt)
        res["acc_" + k], res["loss_" + k] = acc, loss
        rows.append([{"plain": "plain RNN", "additive": "additive cell"}[k], acc, loss, res["grad_ratio_" + k]])
    lab.table("After %d steps, on 1,000 new sequences with a delay of %d" % (steps, D),
              ["network", "accuracy (chance 50%)", "loss (chance ln 2 = 0.693)", "at initialization: gradient at the first step / at the last"], rows)
    res["delay"] = D
    lab.result(**res)
