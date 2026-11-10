"""Week 4 · Four optimizers on an ill-conditioned quadratic (numpy only).

f(theta) = 1/2 theta^T H theta in d dimensions, eigenvalues of H spread between 1 and kappa.
Near a minimum every smooth loss looks like this, and here everything can be computed exactly:

    gradient descent   theta <- theta - eta g                       mode i is multiplied by (1 - eta lambda_i) each step
    heavy ball         v <- mu v + g;  theta <- theta - eta v        every mode shrinks like sqrt(mu)^t when tuned
    RMSProp            r <- beta r + (1 - beta) g^2;  theta <- theta - eta g / (sqrt(r) + eps)
    Adam               heavy ball and RMSProp together, both averages bias-corrected

With "rotate" on, H = Q diag(lambda) Q^T for a random rotation Q: same eigenvalues, different coordinates.
"""
import numpy as np


def tuned_steps(kappa, d=50, target=1e-6, max_steps=20000):
    """Steps that gradient descent and heavy ball need to shrink f by `target`, each with its best constant settings.
    Both are rotation-invariant, so this runs in the eigenbasis where H is diagonal."""
    lam = np.logspace(0.0, np.log10(kappa), d)
    f = lambda th: 0.5 * np.sum(lam * th * th)
    eta_gd = 2.0 / (lam[0] + lam[-1])
    eta_hb = (2.0 / (np.sqrt(lam[0]) + np.sqrt(lam[-1]))) ** 2
    mu = ((np.sqrt(kappa) - 1) / (np.sqrt(kappa) + 1)) ** 2
    out = []
    for method in ("gd", "heavy_ball"):
        th, v, f0 = np.ones(d), np.zeros(d), f(np.ones(d))
        for t in range(1, max_steps + 1):
            if method == "gd":
                th = th - eta_gd * lam * th
            else:
                v = mu * v + lam * th
                th = th - eta_hb * v
            if f(th) <= target * f0:
                break
        out.append(t)
    return out


def simulate(H, theta0, lam, steps, lr_adaptive, report=None):
    """The four optimizers on f = 1/2 theta^T H theta from theta0. Returns, per optimizer, the first step at which
    f has dropped by a factor 1e6 (None if it never does) and the final f / f0."""
    d, kappa = len(lam), lam[-1] / lam[0]
    f = lambda th: 0.5 * th @ H @ th
    grad = lambda th: H @ th
    f0 = f(theta0)
    # the best constant settings for the two methods that have a complete theory on quadratics
    eta_gd = 2.0 / (lam[0] + lam[-1])
    eta_hb = (2.0 / (np.sqrt(lam[0]) + np.sqrt(lam[-1]))) ** 2
    mu_hb = ((np.sqrt(kappa) - 1) / (np.sqrt(kappa) + 1)) ** 2
    th = {name: theta0.copy() for name in ("gd", "heavy_ball", "rmsprop", "adam")}
    v_hb, r_rms, m_adam, v_adam = np.zeros(d), np.zeros(d), np.zeros(d), np.zeros(d)
    beta, b1, b2, eps = 0.99, 0.9, 0.999, 1e-8
    hit = {}
    for t in range(1, steps + 1):
        th["gd"] -= eta_gd * grad(th["gd"])

        v_hb = mu_hb * v_hb + grad(th["heavy_ball"])
        th["heavy_ball"] -= eta_hb * v_hb

        g = grad(th["rmsprop"])
        r_rms = beta * r_rms + (1 - beta) * g * g
        th["rmsprop"] -= lr_adaptive * g / (np.sqrt(r_rms) + eps)

        g = grad(th["adam"])
        m_adam = b1 * m_adam + (1 - b1) * g
        v_adam = b2 * v_adam + (1 - b2) * g * g
        th["adam"] -= lr_adaptive * (m_adam / (1 - b1 ** t)) / (np.sqrt(v_adam / (1 - b2 ** t)) + eps)

        vals = {name: max(f(x) / f0, 1e-300) for name, x in th.items()}      # floor so that a log axis can show it
        for name, val in vals.items():
            if val <= 1e-6 and name not in hit:
                hit[name] = t
        if report is not None:
            report(t, **vals)
    return hit, {name: f(x) / f0 for name, x in th.items()}


def run(lab):
    rng = lab.rng
    d, kappa, steps = int(lab.p("dim", 50)), float(lab.p("kappa", 100.0)), int(lab.p("steps", 500))
    rotate, lr_adaptive = bool(lab.p("rotate", False)), float(lab.p("lr_adaptive", 0.02))

    lam = np.logspace(0.0, np.log10(kappa), d)                 # eigenvalues from 1 to kappa
    Q = np.linalg.qr(rng.normal(size=(d, d)))[0]               # a random rotation
    problems = {"axis": (np.diag(lam), np.ones(d)),            # eigenvectors = coordinate axes
                "rotated": (Q @ np.diag(lam) @ Q.T, Q @ np.ones(d))}   # same eigenvalues, same start in the eigenbasis
    shown = "rotated" if rotate else "axis"
    lab.log("kappa = %g: gradient descent factor per step (kappa-1)/(kappa+1) = %.4f; heavy ball sqrt(mu) = %.4f"
            % (kappa, (kappa - 1) / (kappa + 1), (np.sqrt(kappa) - 1) / (np.sqrt(kappa) + 1)))
    lab.log("the curves show the %s problem; the other one is run as well, for the comparison table"
            % ("rotated" if rotate else "axis-aligned"))

    out = {}
    for name, (H, theta0) in problems.items():
        out[name] = simulate(H, theta0, lam, steps, lr_adaptive, report=lab.report if name == shown else None)
    never = "not within %d steps" % steps
    rows = []
    for opt in ("gd", "heavy_ball", "rmsprop", "adam"):
        rows.append([opt, out["axis"][0].get(opt, never), out["axis"][1][opt], out["rotated"][0].get(opt, never), out["rotated"][1][opt]])
    lab.table("Axis-aligned versus rotated: steps until f has dropped a million-fold, and f / f0 at the end",
              ["optimizer", "steps (axis-aligned)", "final (axis-aligned)", "steps (rotated)", "final (rotated)"], rows)

    # how the two tuned methods scale with the condition number
    rows, counts = [], {}
    for k in (10.0, 100.0, 1000.0):
        counts[k] = tuned_steps(k, d)
        rows.append([k, counts[k][0], counts[k][1], counts[k][0] / counts[k][1]])
    lab.table("Scaling with the condition number (steps to shrink f by a factor of one million)",
              ["kappa", "gradient descent", "heavy ball", "ratio"], rows)

    hit, final = out[shown]
    nan = float("nan")
    lab.result(gd_steps=hit.get("gd", nan), heavy_ball_steps=hit.get("heavy_ball", nan),
               rmsprop_final=final["rmsprop"], adam_final=final["adam"], rotate=int(rotate), kappa=kappa,
               gd_steps_axis=out["axis"][0].get("gd", nan), gd_steps_rotated=out["rotated"][0].get("gd", nan),
               heavy_ball_steps_axis=out["axis"][0].get("heavy_ball", nan), heavy_ball_steps_rotated=out["rotated"][0].get("heavy_ball", nan),
               rmsprop_final_axis=out["axis"][1]["rmsprop"], rmsprop_final_rotated=out["rotated"][1]["rmsprop"],
               adam_final_axis=out["axis"][1]["adam"], adam_final_rotated=out["rotated"][1]["adam"],
               gd_growth_100_to_1000=counts[1000.0][0] / counts[100.0][0], heavy_ball_growth_100_to_1000=counts[1000.0][1] / counts[100.0][1])
