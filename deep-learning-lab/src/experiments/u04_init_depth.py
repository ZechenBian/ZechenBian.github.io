"""Week 4 · Why the factor 2 in Kaiming initialization (numpy only).

Push one random batch through a deep ReLU network at initialization, with weights drawn from
N(0, c / n) for fan-in n, and watch the mean square activation layer by layer.
The notes compute the expectation: each ReLU layer multiplies it by exactly c / 2.
So c = 2 (He et al. 2015) keeps the signal at scale 1, c = 1 halves it at every layer, c = 4 doubles it.
The same factor acts on gradients on the way back, which is why depth is untrainable when c is off.
"""
import numpy as np


def run(lab):
    rng = lab.rng
    width, depth, batch = int(lab.p("width", 256)), int(lab.p("depth", 50)), int(lab.p("batch", 256))
    act = lab.p("activation", "relu")
    gains = [1.0, 2.0, 4.0]

    x0 = rng.normal(size=(batch, width))                       # inputs with mean square 1
    layers = np.arange(depth + 1)
    curves, last = {}, {}
    for c in gains:
        a = x0
        ms = [float(np.mean(a * a))]
        for _ in range(depth):
            W = rng.normal(0.0, np.sqrt(c / width), size=(width, width))
            z = a @ W
            a = np.maximum(z, 0.0) if act == "relu" else np.tanh(z)
            ms.append(float(np.mean(a * a)))
        name = "c = %g" % c
        curves[name] = np.maximum(ms, 1e-300)
        last[c] = ms[-1]
        lab.log("variance c/n with c = %g: mean square activation after %d layers = %.3e (theory for ReLU: (c/2)^depth = %.3e)"
                % (c, depth, ms[-1], (c / 2.0) ** depth))
    lab.plot("Mean square activation by layer (one random network per c)", layers, curves, xlabel="layer", ylabel="mean of a^2", logy=True)

    # c = 2 is right in expectation; how much does one network of this width wander around 1?
    finals = []
    for _ in range(20):
        a = x0
        for _ in range(depth):
            a = np.maximum(a @ rng.normal(0.0, np.sqrt(2.0 / width), size=(width, width)), 0.0)
        finals.append(float(np.mean(a * a)))
    finals = np.array(finals)
    lab.table("c = 2, twenty independent networks: mean square activation at the last layer",
              ["smallest", "median", "largest", "std of ln(value)"],
              [[finals.min(), np.median(finals), finals.max(), np.std(np.log(finals))]])
    lab.result(final_c1=last[1.0], final_c2=last[2.0], final_c4=last[4.0], log10_final_c1=np.log10(max(last[1.0], 1e-300)),
               c2_spread_min=finals.min(), c2_spread_max=finals.max(), depth=depth, width=width)
