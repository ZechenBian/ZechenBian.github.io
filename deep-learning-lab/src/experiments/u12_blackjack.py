"""Week 12 · Blackjack: the exact optimal policy by dynamic programming, and what Monte Carlo control finds (numpy only).

The game of Sutton and Barto, Example 5.1 (simulated, no data): an infinite deck (each draw is 1 to 10, a ten with
probability 4/13), the player sees one dealer card, hits or sticks; the dealer hits below 17 and sticks on 17 or more,
counting an ace as 11 when that does not bust. A natural (ace and ten) wins +1 unless the dealer has one too. Rewards are
+1, 0, -1 at the end, no discounting. The player's state: sum 12 to 21, the dealer's card, whether an ace counts as 11.

Part 1 (exact). The dealer's final sum has a computable distribution for each up card, so the Bellman optimality equation
can be solved exactly, from high sums down (section 2). The script reports the exact expected return of the optimal
policy and of the fixed policy "stick on 20 or 21".
Part 2 (sampled). Monte Carlo control with exploring starts (section 3): every episode starts in a random state with a
random first action, then follows the greedy policy; Q is the average of the returns seen. The learned policy is compared
with the exact one, state by state, and its expected return is computed exactly.
"""
import numpy as np

P_CARD = np.array([0] + [1 / 13] * 9 + [4 / 13])  # index 1..10


def dealer_dist():
    """For each up card 1..10: probabilities of final sums 17..21 and bust (index 5)."""
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


def stick_value(D):
    S = np.zeros((22, 11))
    for s in range(4, 22):
        for up in range(1, 11):
            d = D[up]; v = d[5]
            for k in range(5):
                f = 17 + k
                v += d[k] * (1 if s > f else -1 if s < f else 0)
            S[s, up] = v
    return S


def solve(D, policy=None):
    """Values V[s, usable, up] for s = 12..21 under policy (stick = True) or optimal if policy is None."""
    S = stick_value(D)
    V = np.zeros((22, 2, 11)); A = np.zeros((22, 2, 11), dtype=bool)
    for usable in (0, 1):
        for s in range(21, 11, -1):
            for up in range(1, 11):
                hit = 0.0
                for c in range(1, 11):
                    t = s + c
                    if usable:
                        hit += P_CARD[c] * (V[t, 1, up] if t <= 21 else V[t - 10, 0, up])
                    else:
                        hit += P_CARD[c] * (V[t, 0, up] if t <= 21 else -1.0)
                st = S[s, up]
                a = (st >= hit) if policy is None else policy[s, usable, up]
                A[s, usable, up] = a; V[s, usable, up] = st if a else hit
    return V, A


def low_value(V, total, usable, up):
    """Expected return from a hand below 12, which always hits."""
    if total >= 12:
        return V[total, usable, up]
    v = 0.0
    for c in range(1, 11):
        if c == 1 and total + 11 <= 21:
            v += P_CARD[c] * low_value(V, total + 11, 1, up)
        else:
            v += P_CARD[c] * low_value(V, total + c, usable, up)
    return v


def game_value(D, V):
    nat_dealer = {up: (P_CARD[10] if up == 1 else P_CARD[1] if up == 10 else 0.0) for up in range(1, 11)}
    tot = 0.0
    for up in range(1, 11):
        for a in range(1, 11):
            for b in range(1, 11):
                p = P_CARD[up] * P_CARD[a] * P_CARD[b]
                if {a, b} == {1, 10}:
                    tot += p * (1 - nat_dealer[up]); continue
                has_ace = a == 1 or b == 1
                total = a + b
                if has_ace and total + 10 <= 21:
                    tot += p * low_value(V, total + 10, 1, up) if total + 10 >= 12 else p * low_value(V, total, 0, up)
                else:
                    tot += p * low_value(V, total, 0, up)
    return tot


def draw(rng):
    c = int(rng.integers(1, 14))
    return min(c, 10)


def play_dealer(rng, up):
    total, soft = up, up == 1
    c = draw(rng); total += c; soft = soft or c == 1
    while True:
        val = total + 10 if soft and total + 10 <= 21 else total
        if val >= 17:
            return val
        c = draw(rng); total += c; soft = soft or c == 1


def mc_es(rng, episodes, lab, opt=None):
    Q = np.zeros((22, 2, 11, 2)); N = np.zeros((22, 2, 11, 2))
    greedy_stick = np.zeros((22, 2, 11), dtype=bool)
    greedy_stick[20:22] = True
    for ep in range(1, episodes + 1):
        s, u, up = int(rng.integers(12, 22)), int(rng.integers(0, 2)), int(rng.integers(1, 11))
        a = int(rng.integers(0, 2))  # 1 = stick
        visited = []
        while True:
            visited.append((s, u, up, a))
            if a == 1:
                break
            c = draw(rng); t = s + c
            if u and t > 21:
                t -= 10; u = 0
            if t > 21:
                s = None; break
            s = t
            a = int(greedy_stick[s, u, up])
        if s is None:
            g = -1.0
        else:
            f = play_dealer(rng, up)
            g = 1.0 if f > 21 or s > f else -1.0 if s < f else 0.0
        for (vs, vu, vup, va) in visited:  # each state occurs at most once per episode, so first visit = every visit
            N[vs, vu, vup, va] += 1
            Q[vs, vu, vup, va] += (g - Q[vs, vu, vup, va]) / N[vs, vu, vup, va]
            greedy_stick[vs, vu, vup] = Q[vs, vu, vup, 1] >= Q[vs, vu, vup, 0]
        if ep % 5000 == 0 and opt is not None:
            lab.report(ep, agree=float(np.mean(greedy_stick[12:22, :, 1:] == opt[12:22, :, 1:])))
    return Q, greedy_stick


def run(lab):
    rng = lab.rng
    episodes = int(lab.p("episodes", 200000))
    D = dealer_dist()
    Vopt, Aopt = solve(D)
    v_opt = game_value(D, Vopt)
    pol20 = np.zeros((22, 2, 11), dtype=bool); pol20[20:22] = True
    V20, _ = solve(D, pol20)
    v20 = game_value(D, V20)
    Q, learned = mc_es(rng, episodes, lab, Aopt)
    Vl, _ = solve(D, learned)
    v_learned = game_value(D, Vl)
    agree = float(np.mean(learned[12:22, :, 1:] == Aopt[12:22, :, 1:]))
    def row(A, ref, s, u):
        return "".join(("S" if A[s, u, up] else "H") if A[s, u, up] == ref[s, u, up] else ("s" if A[s, u, up] else "h") for up in range(1, 11))
    lab.table("Exact optimal policy (S = stick, H = hit); dealer's card A, 2, ..., 10 from left to right",
              ["player's sum", "usable ace", "no usable ace"], [[s, row(Aopt, Aopt, s, 1), row(Aopt, Aopt, s, 0)] for s in range(21, 11, -1)])
    lab.table("Policy learned by Monte Carlo control, %d episodes (lower case = differs from the exact policy)" % episodes,
              ["player's sum", "usable ace", "no usable ace"], [[s, row(learned, Aopt, s, 1), row(learned, Aopt, s, 0)] for s in range(21, 11, -1)])
    lab.table("Expected return per hand, computed exactly", ["policy", "expected return"],
              [["stick on 20 or 21, otherwise hit", v20], ["exact optimal policy", v_opt], ["learned by Monte Carlo control", v_learned]])
    lab.result(value_optimal=v_opt, value_stick20=v20, value_learned=v_learned, agree=agree, disagree_states=int(np.sum(learned[12:22, :, 1:] != Aopt[12:22, :, 1:])), loss=v_opt - v_learned)
