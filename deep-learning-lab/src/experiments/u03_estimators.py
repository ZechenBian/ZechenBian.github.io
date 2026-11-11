"""Week 3 · Biased estimators that win (numpy only).

Part 1, the variance of a Gaussian. Draw many samples of size n from N(0, sigma^2) and estimate sigma^2 from each by
S / d, where S = sum (x_i - mean)^2 and d is n - 1 (unbiased), n (maximum likelihood) or n + 1. For each divisor the
script measures bias, variance and mean squared error over all the samples, on the same samples for every divisor.

Part 2, ten means at once (Stein's paradox). Observe X ~ N(theta, I) in dimension 10, once, and estimate theta either
by X itself (maximum likelihood) or by the James-Stein estimator (1 - (d - 2) / |X|^2) X, which pulls every coordinate
towards 0 by the same data-dependent factor. Theta is fixed: every coordinate equal to 1.
"""
import numpy as np


def run(lab):
    rng = lab.rng
    n, reps, sigma2 = int(lab.p("n", 10)), int(lab.p("samples", 200000)), float(lab.p("sigma2", 1.0))

    # part 1: one matrix of samples, every divisor applied to the same S
    x = rng.normal(0.0, np.sqrt(sigma2), size=(reps, n))
    S = ((x - x.mean(axis=1, keepdims=True)) ** 2).sum(axis=1)
    rows, res = [], {}
    for name, d in (("n - 1 (unbiased)", n - 1), ("n (maximum likelihood)", n), ("n + 1", n + 1)):
        est = S / d
        bias, var = est.mean() - sigma2, est.var()
        mse = ((est - sigma2) ** 2).mean()
        exact = sigma2 ** 2 * ((n - 1 - d) ** 2 + 2 * (n - 1)) / d ** 2      # S / sigma^2 is chi-square with n - 1 degrees of freedom
        rows.append([name, bias, var, bias ** 2 + var, mse, exact])
        key = {n - 1: "unb", n: "mle", n + 1: "np1"}[d]
        res["mse_" + key], res["bias_" + key], res["var_" + key] = mse, bias, var
    lab.table("Estimating sigma^2 = %g from %d draws, over %d samples" % (sigma2, n, reps),
              ["divisor", "bias", "variance", "bias^2 + variance", "mean squared error", "exact value"], rows)
    names = ["unb", "mle", "np1"]
    res["best_divisor"] = n - 1 + int(np.argmin([res["mse_" + k] for k in names]))
    lab.log("smallest mean squared error with divisor %d" % res["best_divisor"])
    edges = np.linspace(0, 3 * sigma2, 31)
    centers = (edges[:-1] + edges[1:]) / 2
    lab.plot("Sampling distributions of the three estimates (true value %g)" % sigma2, [float(c) for c in centers],
             {"divide by n - 1": np.histogram(S / (n - 1), edges)[0] / reps, "divide by n": np.histogram(S / n, edges)[0] / reps,
              "divide by n + 1": np.histogram(S / (n + 1), edges)[0] / reps}, xlabel="estimate of sigma^2", ylabel="share of samples")

    # part 2: Stein's paradox
    d, trials = 10, int(lab.p("stein_trials", 20000))
    theta = np.ones(d)
    X = theta + rng.normal(size=(trials, d))
    js = (1 - (d - 2) / (X ** 2).sum(axis=1, keepdims=True)) * X
    err_mle = ((X - theta) ** 2).sum(axis=1).mean()
    err_js = ((js - theta) ** 2).sum(axis=1).mean()
    lab.table("Ten means from one observation each, theta = (1, ..., 1), %d trials" % trials,
              ["estimator", "average total squared error", "per coordinate"],
              [["X itself (maximum likelihood, unbiased)", err_mle, err_mle / d], ["James-Stein, shrunk towards 0", err_js, err_js / d]])
    res.update(stein_mle=err_mle, stein_js=err_js, stein_ratio=err_js / err_mle, n=n)
    lab.result(**res)
