"""Week 12 · Monte Carlo against temporal-difference learning on a random walk (numpy only).

The random walk of Sutton and Barto, Example 6.2 (simulated, no data): five states A to E in a row, every episode starts
in the middle state C and steps left or right with probability 1/2 each. Leaving on the left ends the episode with reward
0, leaving on the right with reward 1; there is no discounting. The true values are 1/6, 2/6, ..., 5/6. Every estimate
starts at 0.5.

Part 1 (online). Constant-step Monte Carlo, V(s) += alpha (G - V(s)) at the end of each episode for every state visited,
and TD(0), V(s) += alpha (r + V(s') - V(s)) after every step (section 4), for several step sizes. The error is the root
mean square over the five states, averaged over independent runs.
Part 2 (batch). After each episode, both methods are run to convergence on all episodes seen so far. Batch Monte Carlo
converges to the average return observed from each state; batch TD to the values of the Markov chain estimated from the
counts of observed transitions, the certainty-equivalence estimate (section 4). Both limits are computed directly.
"""
import numpy as np

TRUE = np.arange(1, 6) / 6.0


def episode(rng):
    s, path = 2, [2]
    while True:
        s += 1 if rng.random() < 0.5 else -1
        if s < 0:
            return path, 0.0
        if s > 4:
            return path, 1.0
        path.append(s)


def rms(V):
    return float(np.sqrt(np.mean((V - TRUE) ** 2)))


def run(lab):
    rng = lab.rng
    runs, n_ep = int(lab.p("runs", 100)), int(lab.p("episodes", 100))
    td_alphas, mc_alphas = [0.05, 0.1, 0.15], [0.01, 0.02, 0.03, 0.04]
    err = {("TD", a): np.zeros(n_ep + 1) for a in td_alphas}
    err.update({("MC", a): np.zeros(n_ep + 1) for a in mc_alphas})
    b_td, b_mc = np.zeros(n_ep + 1), np.zeros(n_ep + 1)
    for r in range(runs):
        eps = [episode(rng) for _ in range(n_ep)]
        for (kind, a) in err:
            V = np.full(5, 0.5); e = err[(kind, a)]; e[0] += rms(V)
            for k, (path, g) in enumerate(eps, 1):
                if kind == "TD":
                    for i, s in enumerate(path):
                        target = V[path[i + 1]] if i + 1 < len(path) else g
                        V[s] += a * (target - V[s])
                else:
                    for s in path:
                        V[s] += a * (g - V[s])
                e[k] += rms(V)
        # batch: counts of transitions and of returns, then the two limits directly
        C = np.zeros((5, 7)); G = np.zeros(5); n = np.zeros(5)
        b_td[0] += rms(np.full(5, 0.5)); b_mc[0] += rms(np.full(5, 0.5))
        for k, (path, g) in enumerate(eps, 1):
            for i, s in enumerate(path):
                nxt = path[i + 1] + 1 if i + 1 < len(path) else (6 if g == 1.0 else 0)  # columns: 0 = left exit, 1..5 = A..E, 6 = right exit
                C[s, nxt] += 1; G[s] += g; n[s] += 1
            seen = n > 0
            Vmc = np.where(seen, G / np.maximum(n, 1), 0.5)
            P = C / np.maximum(C.sum(1, keepdims=True), 1)
            # V = P[:, 1:6] V + P[:, 6] * 1 on the seen states; unseen states keep 0.5
            idx = np.where(seen)[0]
            A = np.eye(len(idx)) - P[np.ix_(idx, idx + 1)]
            b = P[idx, 6] + P[np.ix_(idx, np.where(~seen)[0] + 1)].sum(1) * 0.5
            Vtd = np.full(5, 0.5); Vtd[idx] = np.linalg.solve(A, b)
            b_td[k] += rms(Vtd); b_mc[k] += rms(Vmc)
    x = list(range(n_ep + 1))
    lab.plot("Online learning: RMS error over the five states, averaged over %d runs" % runs, x,
             {("TD(0), α = %g" % a if k == "TD" else "Monte Carlo, α = %g" % a): err[(k, a)] / runs for (k, a) in err},
             xlabel="episodes", ylabel="RMS error")
    lab.plot("Batch learning: RMS error after training to convergence on all episodes so far", x,
             {"batch TD (certainty equivalence)": b_td / runs, "batch Monte Carlo (average return)": b_mc / runs}, xlabel="episodes", ylabel="RMS error")
    best_td = min(td_alphas, key=lambda a: err[("TD", a)][n_ep]); best_mc = min(mc_alphas, key=lambda a: err[("MC", a)][n_ep])
    res = {"td_best": float(err[("TD", best_td)][n_ep] / runs), "td_best_alpha": best_td, "mc_best": float(err[("MC", best_mc)][n_ep] / runs),
           "mc_best_alpha": best_mc, "batch_td": float(b_td[n_ep] / runs), "batch_mc": float(b_mc[n_ep] / runs)}
    lab.table("RMS error after %d episodes, averaged over %d runs" % (n_ep, runs), ["method", "step size", "RMS error"],
              [["TD(0)", a, err[("TD", a)][n_ep] / runs] for a in td_alphas] + [["Monte Carlo", a, err[("MC", a)][n_ep] / runs] for a in mc_alphas]
              + [["batch TD", "to convergence", res["batch_td"]], ["batch Monte Carlo", "to convergence", res["batch_mc"]]])
    lab.result(**res)
