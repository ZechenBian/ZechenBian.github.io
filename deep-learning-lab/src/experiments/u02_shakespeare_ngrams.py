"""Week 2 · How predictable is Shakespeare? Counting estimates of the entropy rate (numpy only, plus the standard library's
compressors for comparison).

Data: Tiny Shakespeare, real text (1,115,394 characters, 65 distinct). The first 90% are for counting, the last 10% are
held out: the same split as week 7's transformer.

For each context length k = 0, 1, ..., the script estimates H(next character | previous k characters) in two ways:

    in-sample (plug-in)   count every (context, next character) pair in the training text and compute the conditional
                          entropy of those frequencies, on the same text (section 7)
    held-out              predict each character of the held-out text from the training counts, smoothed by Witten-Bell
                          interpolation, and average -log2 of the probability it gave the character that came

The held-out number is a code length: arithmetic coding with this model would compress the held-out text to that many
bits per character, plus two bits in total (sections 5 and 6).
"""
import bz2
import lzma
import math
import zlib

import numpy as np


def keys(ids, k, positions):
    """Whole-number codes of the k characters before each position, and of those k characters plus the next one."""
    V = 65
    ctx = np.zeros(len(positions), dtype=np.int64)
    for j in range(1, k + 1):
        ctx = ctx * V + ids[positions - j]
    return ctx, ctx * V + ids[positions]


def plugin_conditional_entropy(ctx, joint):
    """Plug-in estimate of H(next | context) in bits from the observed pairs, and the share of positions whose context
    was seen exactly once (there the estimate is 0: one observation leaves no doubt)."""
    M = len(joint)
    _, nj = np.unique(joint, return_counts=True)
    _, inv, nc = np.unique(ctx, return_inverse=True, return_counts=True)
    Hj = -np.sum(nj / M * np.log2(nj / M))
    Hc = -np.sum(nc / M * np.log2(nc / M))
    return Hj - Hc, float(np.mean(nc[inv] == 1))


class Counts:
    """Training counts for one context length: n(context, next), n(context), u(context) = distinct next characters."""
    def __init__(self, ids, k, positions):
        ctx, joint = keys(ids, k, positions)
        self.k = k
        self.joint, self.nj = np.unique(joint, return_counts=True)
        self.ctx, self.nc = np.unique(ctx, return_counts=True)
        self.uc = np.bincount(np.searchsorted(self.ctx, self.joint // 65), minlength=len(self.ctx))

    def lookup(self, sorted_keys, values, q):
        i = np.minimum(np.searchsorted(sorted_keys, q), len(sorted_keys) - 1)
        return np.where(sorted_keys[i] == q, values[i], 0)

    def interpolate(self, ctx, joint, lower):
        """Witten-Bell: P_k = (n(ctx, c) + u(ctx) P_(k-1)) / (n(ctx) + u(ctx)); an unseen context keeps P_(k-1)."""
        n = self.lookup(self.ctx, self.nc, ctx).astype(float)
        u = self.lookup(self.ctx, self.uc, ctx).astype(float)
        nj = self.lookup(self.joint, self.nj, joint).astype(float)
        return np.where(n > 0, (nj + u * lower) / np.maximum(n + u, 1), lower)


def run(lab):
    K = int(lab.p("max_context", 9))
    text = lab.dataset("tinyshakespeare")
    alphabet = sorted(set(text))
    V = len(alphabet)
    ids = np.frombuffer(text.encode("ascii"), dtype=np.uint8)
    ids = np.searchsorted(np.frombuffer("".join(alphabet).encode("ascii"), dtype=np.uint8), ids).astype(np.int64)
    N = len(ids)
    n_train = int(0.9 * N)
    lab.log("%d characters, %d distinct; %d for counting, %d held out" % (N, V, n_train, N - n_train))

    train_pos = np.arange(K, n_train)                    # the same positions for every k, so the estimates compare
    valid_pos = np.arange(n_train, N)
    rows, plug, held, single = [], [], [], []
    lower = np.full(len(valid_pos), 1.0 / V)            # order -1: every character equally likely
    sample_counts = []
    for k in range(K + 1):
        ctx, joint = keys(ids, k, train_pos)
        h, s = plugin_conditional_entropy(ctx, joint)
        c = Counts(ids, k, np.arange(k, n_train))
        vctx, vjoint = keys(ids, k, valid_pos)
        lower = c.interpolate(vctx, vjoint, lower)
        hv = float(np.mean(-np.log2(lower)))
        plug.append(h); held.append(hv); single.append(s); sample_counts.append(c)
        rows.append([k, len(c.ctx), 100 * s, h, hv])
        lab.log("k = %d: %d distinct contexts; in-sample %.3f, held-out %.3f bits per character" % (k, len(c.ctx), h, hv))
    best = int(np.argmin(held))
    lab.plot("Bits per character, by the number of preceding characters used", list(range(K + 1)),
             {"in-sample (plug-in)": plug, "held-out (Witten-Bell)": held}, xlabel="context length k (characters)", ylabel="bits per character")
    lab.table("By context length", ["k", "distinct contexts", "positions whose context occurs once (%)", "in-sample (bits per char)", "held-out (bits per char)"], rows)

    # general-purpose compressors on the held-out text, for scale (they are not given the training text)
    valid = text[n_train:].encode("ascii")
    comp = {"zlib, level 9 (gzip, PNG)": len(zlib.compress(valid, 9)), "bz2, level 9": len(bz2.compress(valid, 9)),
            "lzma, preset 9 (xz)": len(lzma.compress(valid, preset=9))}
    with_train = len(lzma.compress(text.encode("ascii"), preset=9)) - len(lzma.compress(text[:n_train].encode("ascii"), preset=9))
    crow = [[name, b, 8 * b / len(valid)] for name, b in comp.items()]
    crow.append(["lzma, preset 9, after reading the training text (difference of two file sizes)", with_train, 8 * with_train / len(valid)])
    crow.append(["counting model, k = %d, as a code length (sections 5 and 6)" % best, int(round(held[best] * len(valid) / 8)), held[best]])
    lab.table("The held-out text ({:,} characters) compressed".format(len(valid)), ["method", "bytes", "bits per character"], crow)

    # what the best model writes, character by character: sample from P_k(. | the k characters so far)
    out = list(text[n_train - K:n_train])
    for _ in range(400):
        p = np.full(V, 1.0 / V)
        for c in sample_counts[:best + 1]:
            k = c.k
            prev = [alphabet.index(ch) for ch in out[len(out) - k:]] if k else []
            code = 0
            for v in reversed(prev):
                code = code * 65 + v
            ctxq = np.full(V, code, dtype=np.int64)
            p = c.interpolate(ctxq, ctxq * 65 + np.arange(V), p)
        out.append(alphabet[int(lab.rng.choice(V, p=p / p.sum()))])
    lab.text("Written by the k = %d counting model (seeded by the random seed), continuing from the end of the training text" % best, "".join(out[K:]))

    res = {"best_k": best, "best_heldout": held[best], "max_context": K, "rise_after_best": held[K] - held[best], "n_train": n_train, "n_valid": N - n_train,
           "zlib_bpc": 8 * comp["zlib, level 9 (gzip, PNG)"] / len(valid), "bz2_bpc": 8 * comp["bz2, level 9"] / len(valid),
           "lzma_bpc": 8 * comp["lzma, preset 9 (xz)"] / len(valid), "lzma_with_train_bpc": 8 * with_train / len(valid)}
    for k in range(K + 1):
        res["plugin_%d" % k], res["heldout_%d" % k], res["single_%d" % k] = plug[k], held[k], single[k]
    lab.result(**res)
