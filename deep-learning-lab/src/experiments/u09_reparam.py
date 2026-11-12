"""Week 9 · Two unbiased gradients of an expectation, and the gap in the ELBO (numpy only).

Part 1 (simulated, seeded). Estimate the derivative of E_{z ~ N(mu, I)} f(z) with respect to mu_1 at mu = 0, for
f(z) = sum_i (z_i - 2)^2 in dimension d, from 200,000 draws of z, in three ways (section 4):
    reparametrization   z = mu + eps, gradient d f / d z_1 at that z
    score function      f(z) * (z_1 - mu_1)   (REINFORCE)
    score + baseline    (f(z) - b) * (z_1 - mu_1), with b = E f, the best constant baseline here
All three have the same mean, the true derivative -4. The script measures the variance of each, per sample, in
dimension 1 and in dimension 50.

Part 2 (exact, no randomness). A model where everything can be computed: z ~ N(0, 1), x | z ~ N(z, 0.5), and the
observation x = 1.5. The exact log p(x) and the exact posterior are Gaussian. For approximate posteriors
q = N(m, v), the script computes the evidence lower bound and its gap to log p(x), which section 3 identifies as
KL(q || p(z | x)).
"""
import numpy as np


def run(lab):
    rng = lab.rng
    n = int(lab.p("draws", 200000))
    res, rows = {}, []
    for d in (1, 50):
        eps = rng.normal(size=(n, d))
        z = eps                                          # mu = 0
        f = ((z - 2) ** 2).sum(1)
        g_rep = 2 * (z[:, 0] - 2)
        g_sf = f * z[:, 0]
        b = d * 5.0                                      # E f = d (1 + 4)
        g_base = (f - b) * z[:, 0]
        vr, vs, vb = g_rep.var(), g_sf.var(), g_base.var()
        res["var_rep_%d" % d], res["var_sf_%d" % d], res["var_base_%d" % d] = float(vr), float(vs), float(vb)
        res["ratio_%d" % d], res["ratio_base_%d" % d] = float(vs / vr), float(vb / vr)
        for name, g, v in (("reparametrization", g_rep, vr), ("score function", g_sf, vs), ("score function with baseline", g_base, vb)):
            rows.append([d, name, float(g.mean()), float(v), float(v / vr)])
    lab.table("Gradient of E f(z) with respect to μ₁ (true value −4), %d draws" % n, ["dimension", "estimator", "mean", "variance per draw", "variance / reparametrization's"], rows)

    s2, x = 0.5, 1.5
    logp = -0.5 * np.log(2 * np.pi * (1 + s2)) - x * x / (2 * (1 + s2))
    pm, pv = x / (1 + s2), s2 / (1 + s2)
    def elbo(m, v):
        return (-0.5 * np.log(2 * np.pi * s2) - ((x - m) ** 2 + v) / (2 * s2) - 0.5 * np.log(2 * np.pi) - (m * m + v) / 2 + 0.5 * np.log(2 * np.pi * np.e * v))
    def kl(m, v):
        return 0.5 * (v / pv + (m - pm) ** 2 / pv - 1 + np.log(pv / v))
    cases = [("the exact posterior", pm, pv), ("right mean, variance 1", pm, 1.0), ("mean 0, right variance", 0.0, pv), ("the prior N(0, 1)", 0.0, 1.0)]
    erows = []
    for name, m, v in cases:
        e = elbo(m, v)
        erows.append([name, m, v, float(e), float(logp - e), float(kl(m, v))])
    lab.table("x = 1.5 under z ~ N(0, 1), x | z ~ N(z, 0.5): log p(x) = %.4f" % logp, ["q", "mean", "variance", "ELBO", "log p(x) − ELBO", "KL(q ‖ posterior)"], erows)
    res.update(logp=float(logp), gap_prior=float(logp - elbo(0.0, 1.0)), kl_prior=float(kl(0.0, 1.0)), gap_exact=float(logp - elbo(pm, pv)))
    lab.result(**res)
