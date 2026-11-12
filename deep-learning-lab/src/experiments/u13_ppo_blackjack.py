"""Week 13 · PPO for Blackjack, against plain policy gradient (numpy only).

The course's Colab task. Week 12's game (simulated, no data): infinite deck, the dealer hits below 17, a natural wins +1
unless the dealer has one too. The policy is a table of two logits, stick and hit, for each of the 200 states (player's
sum 12 to 21, dealer's card, usable ace), turned into probabilities by a softmax; below 12 the player always hits.
A tabular critic V(s) tracks the average return from each state.

Each iteration plays a batch of hands with the current policy, computes advantages A = G - V(s) from the final reward G,
and updates the logits with Adam on one of three objectives (section 3):
    ppo         the clipped surrogate min(r A, clip(r, 1 - eps, 1 + eps) A), r = pi(a|s) / pi_old(a|s), several epochs
    noclip      the same surrogate r A without the clip, same epochs: nothing keeps the new policy near the old one
    reinforce   one gradient step of A grad log pi per batch, the plain policy gradient with a baseline (section 2)
The expected return of the learned policy is computed exactly, by week 12's dynamic programming, for the stochastic
policy itself and for its greedy version, and compared with the exact optimum.
"""
import numpy as np

P_CARD = np.array([0] + [1 / 13] * 9 + [4 / 13])


def dealer_dist():
    memo = {}

    def go(total, soft):
        key = (total, soft)
        if key in memo:
            return memo[key]
        val = total + 10 if soft and total + 10 <= 21 else total
        out = np.zeros(6)
        if val >= 17:
            out[val - 17 if val <= 21 else 5] = 1.0
        else:
            for c in range(1, 11):
                t = total + c
                out += P_CARD[c] * (np.eye(6)[5] if t > 21 else go(t, soft or c == 1))
        memo[key] = out
        return out
    D = np.zeros((11, 6))
    for up in range(1, 11):
        for c in range(1, 11):
            D[up] += P_CARD[c] * go(up + c, up == 1 or c == 1)
    return D


def evaluate(D, pstick=None):
    """Exact values; pstick[s, usable, up] = probability of sticking, or None for the optimal policy."""
    S = np.zeros((22, 11))
    for s in range(12, 22):
        for up in range(1, 11):
            d = D[up]; S[s, up] = d[5] + sum(d[k] * (1 if s > 17 + k else -1 if s < 17 + k else 0) for k in range(5))
    V = np.zeros((22, 2, 11)); A = np.zeros((22, 2, 11), dtype=bool)
    for u in (0, 1):
        for s in range(21, 11, -1):
            for up in range(1, 11):
                hit = 0.0
                for c in range(1, 11):
                    t = s + c
                    hit += P_CARD[c] * ((V[t, 1, up] if t <= 21 else V[t - 10, 0, up]) if u else (V[t, 0, up] if t <= 21 else -1.0))
                A[s, u, up] = S[s, up] >= hit
                p = float(A[s, u, up]) if pstick is None else pstick[s, u, up]
                V[s, u, up] = p * S[s, up] + (1 - p) * hit
    memo = {}

    def low(total, u, up):
        if total >= 12:
            return V[total, u, up]
        key = (total, u, up)
        if key not in memo:
            memo[key] = sum(P_CARD[c] * (low(total + 11, 1, up) if c == 1 and total + 11 <= 21 else low(total + c, u, up)) for c in range(1, 11))
        return memo[key]
    tot = 0.0
    for up in range(1, 11):
        nat_d = P_CARD[10] if up == 1 else P_CARD[1] if up == 10 else 0.0
        for a in range(1, 11):
            for b in range(1, 11):
                p = P_CARD[up] * P_CARD[a] * P_CARD[b]
                if {a, b} == {1, 10}:
                    tot += p * (1 - nat_d); continue
                t = a + b
                tot += p * (low(t + 10, 1, up) if (a == 1 or b == 1) and t + 10 <= 21 else low(t, 0, up))
    return tot, A


def draw(rng):
    return min(int(rng.integers(1, 14)), 10)


def play(rng, probs):
    """One hand with the policy; returns the list of (state index, action) decisions and the final reward."""
    up = draw(rng); a, b = draw(rng), draw(rng); hid = draw(rng)
    if {a, b} == {1, 10}:
        return [], (0.0 if {up, hid} == {1, 10} else 1.0)
    s, u = a + b, 0
    if (a == 1 or b == 1) and s + 10 <= 21:
        s += 10; u = 1
    dec = []
    while True:
        if s >= 12:
            i = (s - 12) * 20 + u * 10 + (up - 1)
            act = 0 if rng.random() < probs[i, 0] else 1  # 0 = stick, 1 = hit
            dec.append((i, act))
            if act == 0:
                break
        c = draw(rng)
        if c == 1 and s + 11 <= 21:
            s += 11; u = 1
        else:
            s += c
            if s > 21 and u:
                s -= 10; u = 0
        if s > 21:
            return dec, -1.0
    total, soft = up + hid, up == 1 or hid == 1
    while True:
        val = total + 10 if soft and total + 10 <= 21 else total
        if val >= 17:
            break
        c = draw(rng); total += c; soft = soft or c == 1
    return dec, (1.0 if val > 21 or s > val else -1.0 if s < val else 0.0)


def softmax(z):
    z = z - z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)


def run(lab):
    rng = lab.rng
    method, iters, batch = str(lab.p("method", "ppo")), int(lab.p("iterations", 100)), int(lab.p("batch", 2000))
    eps, epochs, lr = float(lab.p("clip", 0.2)), int(lab.p("epochs", 4)), float(lab.p("lr", 0.05))
    if method not in ("ppo", "noclip", "reinforce"):
        raise ValueError("method must be ppo, noclip or reinforce")
    D = dealer_dist()
    v_opt, A_opt = evaluate(D)
    theta = np.zeros((200, 2)); m = np.zeros_like(theta); v2 = np.zeros_like(theta); t_adam = 0
    V = np.zeros(200); nV = np.zeros(200)

    def pstick_of(probs):
        ps = np.zeros((22, 2, 11))
        for s in range(12, 22):
            for u in (0, 1):
                ps[s, u, 1:] = probs[(s - 12) * 20 + u * 10: (s - 12) * 20 + u * 10 + 10, 0]
        return ps
    for it in range(1, iters + 1):
        probs = softmax(theta)
        S, Aa, G = [], [], []
        for _ in range(batch):
            dec, g = play(rng, probs)
            for (i, a) in dec:
                S.append(i); Aa.append(a); G.append(g)
        S, Aa, G = np.array(S), np.array(Aa), np.array(G)
        adv = G - V[S]
        np.add.at(nV, S, 1); np.add.at(V, S, (G - V[S]) / nV[S])          # critic: running average of returns (approximately)
        old = probs[S, Aa]
        for ep in range(epochs if method != "reinforce" else 1):
            pr = softmax(theta); r = pr[S, Aa] / old
            if method == "ppo":
                live = ~(((adv > 0) & (r > 1 + eps)) | ((adv < 0) & (r < 1 - eps)))
            else:
                live = np.ones(len(S), dtype=bool)
            w = (adv * r * live)[:, None] * (np.eye(2)[Aa] - pr[S])        # gradient of r A with respect to the logits of s
            g = np.zeros_like(theta); np.add.at(g, S, w); g /= len(S)
            t_adam += 1; m = 0.9 * m + 0.1 * g; v2 = 0.999 * v2 + 0.001 * g * g
            theta += lr * (m / (1 - 0.9 ** t_adam)) / (np.sqrt(v2 / (1 - 0.999 ** t_adam)) + 1e-8)
        if it % 5 == 0 or it == 1:
            lab.report(it * batch, avg_return=float(G.mean()) if len(G) else 0.0)
    probs = softmax(theta)
    v_stoch, _ = evaluate(D, pstick_of(probs))
    greedy = (probs[:, 0] >= 0.5).astype(float)
    v_greedy, _ = evaluate(D, pstick_of(np.stack([greedy, 1 - greedy], 1)))
    agree = float(np.mean(pstick_of(np.stack([greedy, 1 - greedy], 1))[12:22, :, 1:].astype(bool) == A_opt[12:22, :, 1:]))
    ent = float(-(probs * np.log(np.maximum(probs, 1e-300))).sum(1).mean())
    lab.result(value_optimal=v_opt, value_policy=v_stoch, value_greedy=v_greedy, loss_policy=v_opt - v_stoch, loss_greedy=v_opt - v_greedy, agree=agree, entropy=ent)
