"""Week 4 · Adversarial examples and dimension: the linear picture (numpy only).

Two classes in R^d: x = y * m * u + noise, with y = +1 or -1, u = (1, ..., 1) / sqrt(d), unit Gaussian noise.
The class means are 2m apart whatever d is, so the clean problem is equally easy in every dimension.
A logistic regression is trained, then attacked with the fast gradient sign method:

    x' = x + eps * sign(grad_x loss) = x - eps * y * sign(w)        (every coordinate moves by eps)

For a linear model this is the worst perturbation with max-norm eps, and it shifts the score w.x by eps * ||w||_1.
With w roughly along u that is eps * sqrt(d): the same per-coordinate budget does more damage in higher dimension.
"""
import math

import numpy as np


def phi(z):
    """Standard normal distribution function."""
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def make_data(rng, n, d, m):
    y = rng.choice([-1.0, 1.0], size=n)
    X = rng.normal(size=(n, d)) + (y * m / np.sqrt(d))[:, None]
    return X, y


def train_logistic(X, y, steps=300, lr=0.5, l2=1e-3):
    """Full-batch gradient descent on the mean logistic loss log(1 + exp(-y w.x)) + (l2 / 2) |w|^2."""
    w = np.zeros(X.shape[1])
    for _ in range(steps):
        margin = y * (X @ w)
        s = 1.0 / (1.0 + np.exp(np.clip(margin, -50, 50)))          # = sigmoid(-margin)
        w -= lr * (-(X * (y * s)[:, None]).mean(axis=0) + l2 * w)
    return w


def run(lab):
    rng = lab.rng
    m, n_train, n_test = float(lab.p("mean_shift", 3.0)), int(lab.p("n_train", 6000)), int(lab.p("n_test", 4000))
    dims = [16, 64, 256, 1024]
    eps_grid = np.linspace(0.0, 0.3, 31)
    curves, theory, rows, at_01 = {}, {}, [], {}
    for d in dims:
        Xtr, ytr = make_data(rng, n_train, d, m)
        Xte, yte = make_data(rng, n_test, d, m)
        w = train_logistic(Xtr, ytr)
        l1, l2 = np.abs(w).sum(), np.linalg.norm(w)
        acc = []
        for eps in eps_grid:
            X_adv = Xte - eps * yte[:, None] * np.sign(w)[None, :]      # FGSM: every coordinate moves by eps against the label
            acc.append(float(np.mean(np.sign(X_adv @ w) == yte)))
        curves["d = %d" % d] = acc
        # prediction from the two numbers that matter: the margin of the class means and the l1/l2 ratio of w
        m_eff = m * (w.sum() / np.sqrt(d)) / l2
        theory["d = %d (theory)" % d] = [phi(m_eff - eps * l1 / l2) for eps in eps_grid]
        i01 = int(np.argmin(np.abs(eps_grid - 0.1)))
        at_01[d] = acc[i01]
        rows.append([d, acc[0], acc[i01], 0.1 * l1 / l2, 0.1 * np.sqrt(d), phi(m_eff - 0.1 * l1 / l2)])
        lab.log("d = %4d: clean accuracy %.3f, under FGSM with eps = 0.1: %.3f  (shift of the score in noise units: %.2f)"
                % (d, acc[0], acc[i01], 0.1 * l1 / l2))
        if lab.time_left() <= 0:
            break
    lab.plot("Accuracy under FGSM as the per-coordinate budget eps grows", eps_grid, curves, xlabel="eps (noise std is 1 per coordinate)", ylabel="accuracy")
    lab.plot("The same curves from the formula Phi(m_eff - eps |w|_1 / |w|_2)", eps_grid, theory, xlabel="eps", ylabel="accuracy")
    lab.table("At eps = 0.1", ["d", "clean accuracy", "accuracy under FGSM", "eps |w|_1 / |w|_2", "eps sqrt(d)", "formula"], rows)
    lab.result(acc_clean_d1024=curves["d = 1024"][0] if "d = 1024" in curves else float("nan"),
               acc_fgsm_d16=at_01.get(16, float("nan")), acc_fgsm_d1024=at_01.get(1024, float("nan")))
