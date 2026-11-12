"""Week 13 · Rock, paper, scissors: two policy-gradient learners against each other (numpy only).

No data and no randomness. Two players each hold three logits; a softmax turns them into
probabilities of rock, paper and scissors. A win pays +1, a loss -1, a tie 0, so the game is zero-sum, and its only
equilibrium is to play each move with probability 1/3 (section 5). Both players follow the exact gradient of their own
expected payoff with respect to their logits, the policy gradient of section 2 without sampling noise, at the same time,
with a fixed step size. They start near, not at, the equilibrium: player 1 leans slightly towards rock (logits 0.4, 0,
0, probabilities 0.43, 0.29, 0.29), player 2 plays uniformly.

Measured for player 1: its exploitability, what a best response would win against it (0 at the equilibrium, 1 for any
deterministic policy), both for the current policy (the last iterate) and for the average of all its policies so far.
"""
import numpy as np

A = np.array([[0, -1, 1], [1, 0, -1], [-1, 1, 0]], dtype=float)  # row player's payoff: rock, paper, scissors


def softmax(z):
    e = np.exp(z - z.max()); return e / e.sum()


def exploit(p):
    """What the best reply to p wins: max over the opponent's moves of its payoff -(p^T A)_j."""
    return float(np.max(-(p @ A)))


def run(lab):
    steps, lr = int(lab.p("steps", 5000)), float(lab.p("lr", 0.1))
    x, y = np.array([float(lab.p("lean", 0.4)), 0.0, 0.0]), np.zeros(3)
    p_sum = np.zeros(3); traj, ex_last, ex_avg, t_axis = [], [], [], []
    for t in range(1, steps + 1):
        p, q = softmax(x), softmax(y)
        u, w = A @ q, -(p @ A)                       # payoff of each move for player 1, for player 2
        gx = p * (u - p @ u); gy = q * (w - q @ w)   # gradient of the expected payoff with respect to the logits
        x, y = x + lr * gx, y + lr * gy
        p_sum += p
        if t % max(1, steps // 500) == 0 or t == 1:
            traj.append(p.copy()); t_axis.append(t); ex_last.append(exploit(p)); ex_avg.append(exploit(p_sum / t))
    traj = np.array(traj)
    lab.plot("Player 1's probabilities over time", t_axis, {"rock": traj[:, 0], "paper": traj[:, 1], "scissors": traj[:, 2]}, xlabel="step", ylabel="probability")
    lab.plot("Exploitability of player 1: what a best reply wins", t_axis, {"current policy (last iterate)": ex_last, "average of all policies so far": ex_avg}, xlabel="step", ylabel="best reply's payoff", logy=True)
    p_last, p_avg = softmax(x), p_sum / steps
    lab.table("Player 1 after %d steps" % steps, ["policy", "rock", "paper", "scissors", "exploitability"],
              [["current policy", p_last[0], p_last[1], p_last[2], exploit(p_last)], ["average of all policies", p_avg[0], p_avg[1], p_avg[2], exploit(p_avg)],
               ["always rock (for comparison)", 1, 0, 0, exploit(np.array([1.0, 0, 0]))]])
    lab.result(exploit_last=exploit(p_last), exploit_avg=exploit(p_avg), exploit_start=ex_last[0], min_prob_last=float(p_last.min()))
