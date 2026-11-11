"""Week 6 · Decoding: the most likely text is not like real text (numpy only).

Model: the character model of week 2's second experiment, built by counting on the first 90% of Tiny Shakespeare
(real data): it predicts the next character from the previous 4, with Witten-Bell smoothing. It is a stand-in for
any trained next-token model; the decoding rules below do not care where the probabilities come from (section 4).

Starting from the same 20 characters, five decoders each write 300 characters:
    greedy        always the most probable next character
    beam search   keeps the 8 most probable partial texts and extends each by every character (section 4)
    sampling      draws the next character from the model, at temperature 1 and at temperature 0.7
    nucleus       draws from the smallest set of characters whose probabilities add up to 0.9 (top-p)
For each output the script measures its surprisal under the model itself (bits per character: how probable the model
finds it) and its variety (the share of distinct 8-character windows), and does the same for 300 characters of real
held-out Shakespeare.
"""
import numpy as np

K, V = 4, 65


class Model:
    def __init__(self, ids):
        self.levels = []
        pos = np.arange(K, len(ids))
        for k in range(K + 1):
            ctx = np.zeros(len(pos), dtype=np.int64)
            for j in range(1, k + 1):
                ctx = ctx * V + ids[pos - j]
            joint = ctx * V + ids[pos]
            uj, nj = np.unique(joint, return_counts=True)
            uc, nc = np.unique(ctx, return_counts=True)
            u = np.bincount(np.searchsorted(uc, uj // V), minlength=len(uc))
            self.levels.append((uc, nc, u, uj, nj))

    @staticmethod
    def _look(keys, vals, q):
        i = np.minimum(np.searchsorted(keys, q), len(keys) - 1)
        return np.where(keys[i] == q, vals[i], 0).astype(float)

    def probs(self, hist):
        """Next-character distributions for a batch of histories (lists of ids): array (batch, V)."""
        B = len(hist)
        p = np.full((B, V), 1.0 / V)
        for k, (uc, nc, u, uj, nj) in enumerate(self.levels):
            ctx = np.zeros(B, dtype=np.int64)
            for j in range(1, k + 1):
                ctx = ctx * V + np.array([h[-j] for h in hist])
            n = self._look(uc, nc, ctx)[:, None]; uu = self._look(uc, u, ctx)[:, None]
            joint = ctx[:, None] * V + np.arange(V)[None, :]
            cnt = self._look(uj, nj, joint.ravel()).reshape(B, V)
            p = np.where(n > 0, (cnt + uu * p) / np.maximum(n + uu, 1), p)
        return p / p.sum(1, keepdims=True)


def surprisal(m, start, text):
    h, bits = list(start), []
    for c in text:
        bits.append(-np.log2(m.probs([h])[0, c])); h.append(c)
    return float(np.mean(bits))


def variety(text, w=8):
    s = "".join(chr(65 + c) for c in text)
    win = [s[i:i + w] for i in range(len(s) - w + 1)]
    return len(set(win)) / len(win)


def run(lab):
    rng = lab.rng
    text = lab.dataset("tinyshakespeare")
    alphabet = sorted(set(text)); lut = {ch: i for i, ch in enumerate(alphabet)}
    ids = np.array([lut[ch] for ch in text], dtype=np.int64)
    n_train, L, width = int(0.9 * len(ids)), int(lab.p("length", 300)), int(lab.p("beam", 8))
    m = Model(ids[:n_train])
    start = list(ids[n_train:n_train + 20])
    real = list(ids[n_train + 20:n_train + 20 + L])
    out = {}
    h = list(start)                                                       # greedy
    for _ in range(L):
        h.append(int(m.probs([h])[0].argmax()))
    out["greedy"] = h[20:]
    beams = [(0.0, list(start))]                                          # beam search on the total log-probability
    for _ in range(L):
        P = np.log(m.probs([b[1] for b in beams]))
        cand = (np.array([b[0] for b in beams])[:, None] + P).ravel()
        top = np.argsort(-cand)[:width]
        beams = [(cand[t], beams[t // V][1] + [int(t % V)]) for t in top]
    out["beam"] = beams[0][1][20:]
    for name, T, top_p in (("sample_t1", 1.0, None), ("sample_t07", 0.7, None), ("nucleus", 1.0, 0.9)):
        h = list(start)
        for _ in range(L):
            p = m.probs([h])[0] ** (1 / T); p /= p.sum()
            if top_p:
                o = np.argsort(-p); keep = o[:int(np.searchsorted(np.cumsum(p[o]), top_p)) + 1]
                q = np.zeros(V); q[keep] = p[keep]; p = q / q.sum()
            h.append(int(rng.choice(V, p=p)))
        out[name] = h[20:]
    names = {"real": "real Shakespeare (held out)", "greedy": "greedy", "beam": "beam search, width %d" % width, "sample_t1": "sampling, temperature 1",
             "sample_t07": "sampling, temperature 0.7", "nucleus": "nucleus (top-p = 0.9)"}
    res, rows = {}, []
    for k in ["real", "greedy", "beam", "sample_t1", "sample_t07", "nucleus"]:
        t = real if k == "real" else out[k]
        s, v = surprisal(m, start, t), variety(t)
        res["bits_" + k], res["variety_" + k] = s, v
        rows.append([names[k], s, v])
    lab.table("%d characters from each decoder, after the same 20 characters" % L, ["text", "surprisal under the model (bits per char)", "distinct 8-character windows"], rows)
    show = lambda t: "".join(alphabet[c] for c in t)
    lab.text("The 20 characters every decoder starts from", show(start))
    for k in ["greedy", "beam", "sample_t1", "nucleus"]:
        lab.text(names[k], show(out[k]))
    lab.text(names["real"], show(real))
    lab.result(**res)
