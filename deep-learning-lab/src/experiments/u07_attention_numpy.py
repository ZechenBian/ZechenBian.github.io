"""Week 7 · Self-attention by hand: three claims from the notes, checked numerically (numpy only).

One head of scaled dot-product self-attention on a sequence X (T rows, one per position):

    Q = X W_Q,  K = X W_K,  V = X W_V,     A = softmax_rows(Q K^T / sqrt(d_k)),     Y = A V

1. Causality: with the mask, output i depends on inputs j <= i only (the Jacobian is lower triangular).
2. Symmetry: without the mask, permuting the rows of X permutes the rows of Y the same way;
   with the mask, output i does not notice the ORDER of the earlier positions, only their set.
3. Scale: without the 1 / sqrt(d_k), random scores have standard deviation sqrt(d_k) and softmax collapses onto one key.
"""
import numpy as np


def softmax(S):
    S = S - S.max(axis=-1, keepdims=True)
    E = np.exp(S)
    return E / E.sum(axis=-1, keepdims=True)


def attention(X, Wq, Wk, Wv, causal=True, scale=True):
    Q, K, V = X @ Wq, X @ Wk, X @ Wv
    S = Q @ K.T
    if scale:
        S = S / np.sqrt(K.shape[1])
    if causal:
        S = np.where(np.tril(np.ones_like(S)) > 0, S, -np.inf)        # position i may only look at j <= i
    A = softmax(S)
    return A @ V, A


def run(lab):
    rng = lab.rng
    T, d, dk = int(lab.p("T", 8)), int(lab.p("d", 16)), int(lab.p("d_k", 16))
    X = rng.normal(size=(T, d))
    Wq, Wk, Wv = (rng.normal(size=(d, dk)) / np.sqrt(d) for _ in range(3))

    # 1) causality: J[i, j] = size of d y_i / d x_j, by finite differences
    Y, A = attention(X, Wq, Wk, Wv)
    J, eps = np.zeros((T, T)), 1e-6
    for j in range(T):
        for c in range(d):
            Xp = X.copy()
            Xp[j, c] += eps
            J[:, j] += np.sum(((attention(Xp, Wq, Wk, Wv)[0] - Y) / eps) ** 2, axis=1)
    J = np.sqrt(J)
    upper = float(np.abs(np.triu(J, 1)).max())
    lab.heatmap("How much output i (row) moves when input j (column) changes, causal mask on", J, xlabel="input position j", ylabel="output position i")
    lab.log("causality: largest entry above the diagonal of the Jacobian = %.2e (should be 0)" % upper)

    # 2) symmetry
    perm = rng.permutation(T)
    Y_free = attention(X, Wq, Wk, Wv, causal=False)[0]
    equivariance_err = float(np.abs(attention(X[perm], Wq, Wk, Wv, causal=False)[0] - Y_free[perm]).max())
    causal_err = float(np.abs(attention(X[perm], Wq, Wk, Wv, causal=True)[0] - Y[perm]).max())
    # shuffle only the first T-1 positions: the last output sees the same SET of earlier tokens
    front = np.concatenate([rng.permutation(T - 1), [T - 1]])
    last_err = float(np.abs(attention(X[front], Wq, Wk, Wv, causal=True)[0][-1] - Y[-1]).max())
    lab.table("Permuting the input positions", ["test", "largest difference"],
              [["no mask: Att(PX) versus P Att(X)", equivariance_err],
               ["causal mask: Att(PX) versus P Att(X)", causal_err],
               ["causal mask: last output after shuffling the earlier positions", last_err]])

    # 3) why divide by sqrt(d_k)
    n_keys, dks = 32, [4, 16, 64, 256, 1024]
    rows, top_scaled, top_raw = [], [], []
    for k in dks:
        q = rng.normal(size=(2000, k))
        keys = rng.normal(size=(n_keys, k))
        S = q @ keys.T                                         # each score has variance k
        stats = []
        for scores in (S / np.sqrt(k), S):
            P = softmax(scores)
            entropy = -(P * np.log(P + 1e-300)).sum(axis=1).mean()
            stats += [float(P.max(axis=1).mean()), float(entropy)]
        top_scaled.append(stats[0])
        top_raw.append(stats[2])
        rows.append([k, stats[0], stats[1], stats[2], stats[3]])
    lab.plot("Average weight on the best-matching key (32 random keys)", dks,
             {"with 1/sqrt(d_k)": top_scaled, "without": top_raw}, xlabel="d_k", ylabel="largest attention weight", logx=True)
    lab.table("Attention over 32 random keys (uniform attention has entropy ln 32 = %.2f)" % np.log(n_keys),
              ["d_k", "top weight, scaled", "entropy, scaled", "top weight, unscaled", "entropy, unscaled"], rows)
    lab.result(jacobian_upper_max=upper, equivariance_error=equivariance_err, causal_equivariance_error=causal_err,
               last_output_shuffle_error=last_err, top_weight_scaled_dk256=top_scaled[3], top_weight_unscaled_dk256=top_raw[3])
