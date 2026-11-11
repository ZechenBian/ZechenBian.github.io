"""Week 8 · Spending a compute budget (numpy only; no network is trained here).

The script works with the published Chinchilla loss surface L(N, D) = E + A / N^alpha + B / D^beta, in the refit of
Besiroglu et al. (2024): E = 1.82, A = 482.01, B = 2085.43, alpha = 0.3478, beta = 0.3658, and also with the original
fit of Hoffmann et al. (2022): E = 1.69, A = 406.4, B = 410.7, alpha = 0.34, beta = 0.28. N counts parameters, D
training tokens, and a run costs C = 6 N D floating-point operations (section 5).

Part 1. For budgets C from 1e18 to 1e25, find the best N numerically and compare with the closed form of section 5.
Part 2. Kaplan et al. (2020) counted only non-embedding parameters and studied small models. Here models are
transformers of width d = 64 * layers, with 12 * layers * d^2 non-embedding parameters and a 50,257 x d embedding;
the true loss is the refit surface in total parameters. For small budgets, find each budget's best model, then fit
the exponent of non-embedding parameters against compute, as Kaplan et al. did (Pearce and Song 2024).
Part 3. Simulated training runs: losses from the refit surface on a grid of (N, D), with 2% multiplicative noise
drawn from the seed; refit the five constants (a grid over the exponents, least squares for the rest) and see how
well the compute-optimal exponent is recovered.
"""
import numpy as np

REFIT = dict(E=1.82, A=482.01, B=2085.43, a=0.3478, b=0.3658)
ORIG = dict(E=1.69, A=406.4, B=410.7, a=0.34, b=0.28)


def loss(p, N, D):
    return p["E"] + p["A"] / N ** p["a"] + p["B"] / D ** p["b"]


def best_N(p, C, lo=1e5, hi=1e14):
    Ns = np.logspace(np.log10(lo), np.log10(hi), 4001)
    L = loss(p, Ns, C / (6 * Ns))
    return Ns[int(np.argmin(L))]


def closed_form(p, C):
    G = (p["a"] * p["A"] / (p["b"] * p["B"])) ** (1 / (p["a"] + p["b"]))
    return G * (C / 6) ** (p["b"] / (p["a"] + p["b"]))


def run(lab):
    rng = lab.rng
    rows, res = [], {}
    Cs = 10.0 ** np.arange(18, 26)
    for name, p in (("refit", REFIT), ("original", ORIG)):
        Ns = np.array([best_N(p, C) for C in Cs])
        slope = np.polyfit(np.log(Cs), np.log(Ns), 1)[0]
        res["exp_" + name] = float(slope)
        res["exp_closed_" + name] = p["b"] / (p["a"] + p["b"])
        res["growth10_" + name] = float(10 ** slope)
        for C, N in zip(Cs, Ns):
            D = C / (6 * N)
            rows.append([name, "%.0e" % C, "%.3g" % N, "%.3g" % D, D / N, float(loss(p, N, D)), "%.3g" % closed_form(p, C)])
    lab.table("Compute-optimal models (numerical search; the closed form of section 5 in the last column)", ["fit", "compute C", "best N", "tokens D", "tokens per parameter", "loss", "closed form N"], rows)
    i = list(Cs).index(1e24)
    res["tpp_refit_1e24"] = float(rows[i][4]); res["tpp_orig_1e24"] = float(rows[len(Cs) + i][4])

    # part 2: Kaplan's way of counting, at Kaplan's scale
    V = 50257
    layers = np.arange(2, 49)
    d = 64 * layers
    n_non = 12 * layers * d ** 2
    n_tot = n_non + V * d
    smallC = np.logspace(15, 19, 9)
    best_non, best_tot = [], []
    for C in smallC:
        L = loss(REFIT, n_tot, C / (6 * n_tot))
        k = int(np.argmin(L)); best_non.append(n_non[k]); best_tot.append(n_tot[k])
    kap = np.polyfit(np.log(smallC), np.log(best_non), 1)[0]
    tot = np.polyfit(np.log(smallC), np.log(best_tot), 1)[0]
    res.update(exp_kaplan_way=float(kap), exp_small_total=float(tot))
    lab.table("Small budgets (1e15 to 1e19), models of width 64 x layers with a 50,257-token embedding",
              ["compute C", "best model: layers", "non-embedding parameters", "total parameters", "embedding share"],
              [["%.0e" % C, int(n // 1), "%.3g" % a, "%.3g" % b, (b - a) / b] for C, a, b, n in zip(smallC, best_non, best_tot, [layers[list(n_non).index(x)] for x in best_non])])
    lab.log("exponent of best non-embedding parameters against compute: %.3f; of best total parameters: %.3f" % (kap, tot))

    # part 3: refit the surface from noisy simulated runs
    gN = np.logspace(7, 10, 7); gD = np.logspace(9, 12, 7)
    NN, DD = [x.ravel() for x in np.meshgrid(gN, gD)]
    obs = loss(REFIT, NN, DD) * np.exp(rng.normal(0, 0.02, NN.shape))
    best = (np.inf, None)
    for a in np.linspace(0.2, 0.6, 81):
        for b in np.linspace(0.2, 0.6, 81):
            X = np.stack([np.ones_like(NN), NN ** -a, DD ** -b], 1)
            coef, *_ = np.linalg.lstsq(X, obs, rcond=None)
            r = ((X @ coef - obs) ** 2).sum()
            if r < best[0] and coef[1] > 0 and coef[2] > 0:
                best = (r, (a, b, coef))
    a, b, coef = best[1]
    res.update(fit_alpha=float(a), fit_beta=float(b), fit_exp=float(b / (a + b)))
    lab.table("Refitting L(N, D) from 49 simulated runs with 2% noise", ["", "E", "A", "B", "alpha", "beta", "N exponent beta/(alpha+beta)"],
              [["true (refit of Besiroglu et al.)", REFIT["E"], REFIT["A"], REFIT["B"], REFIT["a"], REFIT["b"], REFIT["b"] / (REFIT["a"] + REFIT["b"])],
               ["recovered", float(coef[0]), float(coef[1]), float(coef[2]), float(a), float(b), float(b / (a + b))]])
    lab.result(**res)
