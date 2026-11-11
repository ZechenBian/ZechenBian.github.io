"""Week 3 · The noise picks the loss, the prior picks the penalty (numpy only).

Part 1. Data y = 2 x + noise with x uniform on [-1, 1], 100 points, the noise either Gaussian or Laplace, both with
variance 1. Least squares is maximum likelihood for Gaussian noise; least absolute deviations is maximum likelihood for
Laplace noise (section 3). Each is fitted on many simulated datasets, and the script measures how far the fitted slope
lands from 2 on average.

Part 2. Linear regression with 50 coefficients and 60 observations, y = X w + noise, noise variance 1. The true
coefficients are drawn from the prior N(0, tau^2) with tau^2 = 0.04, afresh for each dataset. Ridge regression with
penalty lam |w|^2 is the MAP estimate for this prior exactly when lam = sigma^2 / tau^2 = 25 (section 4). The script
sweeps lam and measures the error |w_hat - w|^2, which is the expected test error on a fresh input with independent
N(0, 1) features, minus the noise.
"""
import numpy as np


def lad(X, y, iters=60):
    """Least absolute deviations by iteratively reweighted least squares."""
    w = np.linalg.lstsq(X, y, rcond=None)[0]
    for _ in range(iters):
        r = np.abs(y - X @ w)
        sw = 1.0 / np.sqrt(np.maximum(r, 1e-6))
        w = np.linalg.lstsq(X * sw[:, None], y * sw, rcond=None)[0]
    return w


def run(lab):
    rng = lab.rng
    n, reps = int(lab.p("points", 100)), int(lab.p("datasets", 1500))
    res, rows = {}, []
    for noise in ("gaussian", "laplace"):
        err = {"ls": [], "lad": []}
        for _ in range(reps):
            x = rng.uniform(-1, 1, n)
            e = rng.normal(0, 1, n) if noise == "gaussian" else rng.laplace(0, 1 / np.sqrt(2), n)
            y = 2 * x + e
            X = np.stack([np.ones(n), x], axis=1)
            err["ls"].append((np.linalg.lstsq(X, y, rcond=None)[0][1] - 2) ** 2)
            err["lad"].append((lad(X, y)[1] - 2) ** 2)
        ls, la = float(np.mean(err["ls"])), float(np.mean(err["lad"]))
        res["slope_mse_ls_" + noise], res["slope_mse_lad_" + noise], res["ratio_" + noise] = ls, la, la / ls
        rows.append([noise + " noise", ls, la, la / ls])
    lab.table("Mean squared error of the fitted slope over %d datasets of %d points" % (reps, n),
              ["noise (variance 1)", "least squares", "least absolute deviations", "ratio LAD / LS"], rows)

    p, m, tau2, sig2, trials = 50, 60, 0.04, 1.0, int(lab.p("trials", 400))
    lams = [0.0, 1.0, 3.0, 10.0, 25.0, 60.0, 150.0, 400.0]
    errs = np.zeros(len(lams))
    for _ in range(trials):
        w = rng.normal(0, np.sqrt(tau2), p)
        X = rng.normal(size=(m, p))
        y = X @ w + rng.normal(0, np.sqrt(sig2), m)
        G, b = X.T @ X, X.T @ y
        for i, lam in enumerate(lams):
            wh = np.linalg.solve(G + lam * np.eye(p), b)
            errs[i] += ((wh - w) ** 2).sum() / trials
    best = int(np.argmin(errs))
    lab.plot("Error |w_hat - w|^2 against the penalty (50 coefficients, 60 observations)", [str(l) for l in lams],
             {"ridge, penalty lam |w|^2": [float(v) for v in errs]}, xlabel="lam (0 is least squares; 25 = sigma^2 / tau^2 is the MAP)", ylabel="average |w_hat - w|^2")
    lab.table("Ridge regression, averaged over %d draws of w, X and the noise" % trials, ["lam", "average |w_hat - w|^2"],
              [[("%g" % l) + ("  (least squares)" if l == 0 else "  (MAP for the true prior)" if l == 25 else ""), float(e)] for l, e in zip(lams, errs)])
    res.update(err_ls=float(errs[0]), err_map=float(errs[lams.index(25.0)]), map_over_ls=float(errs[lams.index(25.0)] / errs[0]),
               best_lam=lams[best], err_best=float(errs[best]), prior_norm=p * tau2)
    lab.log("least squares %.3f, MAP %.3f; the lowest error in the sweep at lam = %g" % (errs[0], errs[lams.index(25.0)], lams[best]))
    lab.result(**res)
