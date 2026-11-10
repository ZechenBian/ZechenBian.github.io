"""Week 2 · Arithmetic coding, exactly (numpy only for the random letters; the coder uses Python's whole numbers).

A source writes letters A and B, B with probability p. A model believes B has probability q. The coder narrows the
interval [0, 1) letter by letter, as in section 5 of the notes:

    the interval [low, low + width) is split in the proportions q(A) : q(B); keep the part of the letter that came
    after n letters the width is Q(message) = product of the model's probabilities of the letters that came
    the codeword is the shortest binary fraction 0.b1 b2 ... bl whose dyadic interval fits inside

Probabilities are rounded to multiples of 2^-16, so every interval end is an exact fraction with denominator 2^(16 t):
nothing is approximated, and the decoder below recovers the message from the codeword to check it.
"""
import math

import numpy as np

B = 16                 # probabilities are whole multiples of 2^-B
ONE = 1 << B


def quantize(q):
    """The model as two whole-number frequencies that add up to 2^B: (frequency of A, frequency of B)."""
    fb = min(ONE - 1, max(1, int(round(q * ONE))))
    return ONE - fb, fb


def log2_int(x):
    """log2 of a positive whole number of any size."""
    shift = max(0, x.bit_length() - 53)
    return math.log2(x >> shift) + shift


def encode(msg, freq):
    """msg: array of 0 (A) and 1 (B). Returns the codeword (k, l), meaning the binary fraction k / 2^l, and the
    model's total surprisal sum of -log2 q(letter) in bits."""
    fa, fb = freq
    low, width = 0, 1                              # the interval is [low, low + width) / 2^(B t) after t letters
    for x in msg:
        if x == 0:
            low, width = low << B, width * fa      # A: the lower part
        else:
            low, width = (low << B) + width * fa, width * fb      # B: the upper part
    E = B * len(msg)
    ideal = E - log2_int(width)                    # -log2 of the final width = sum of -log2 q over the letters
    # the shortest l such that some [k / 2^l, (k + 1) / 2^l) lies inside the interval; at most -log2 Q + 2 (section 5)
    for l in range(max(0, E - width.bit_length() + 1), E + 1):
        s = E - l
        k = (low + (1 << s) - 1) >> s              # the first multiple of 2^-l at or above low
        if (k + 1) << s <= low + width:
            return (k, l), ideal
    raise AssertionError("no dyadic interval found")


def decode(code, n, freq):
    """Read n letters back from the codeword: at each step, which part of the interval holds the number k / 2^l?"""
    (k, l), (fa, fb) = code, freq
    low, width, out = 0, 1, np.zeros(n, dtype=np.int8)
    for t in range(1, n + 1):
        split = (low << B) + width * fa            # boundary between A and B, in units of 2^-(B t)
        if (k << (B * t)) < (split << l):          # k / 2^l < split / 2^(B t)
            low, width = low << B, width * fa
        else:
            low, width, out[t - 1] = split, width * fb, 1
    return out


def entropy(p):
    return -(p * math.log2(p) + (1 - p) * math.log2(1 - p))


def kl(p, q):
    return p * math.log2(p / q) + (1 - p) * math.log2((1 - p) / (1 - q))


def run(lab):
    rng = lab.rng
    p, q, n = float(lab.p("p_b", 0.01)), float(lab.p("q_b", 0.01)), int(lab.p("letters", 10000))
    freq = quantize(q)
    qa, qb = freq[0] / ONE, freq[1] / ONE
    msg = (rng.random(n) < p).astype(np.int8)
    n_b = int(msg.sum())
    lab.log("source: B with probability %g; model: B with probability %g (rounded to %d / 2^%d); %d letters, %d of them B"
            % (p, q, freq[1], B, n, n_b))

    # the running cost, letter by letter: what the chart shows
    cost = np.where(msg == 1, -math.log2(qb), -math.log2(qa))
    run_avg = np.cumsum(cost) / np.arange(1, n + 1)
    H = entropy(p)
    for t in range(max(1, n // 200), n + 1, max(1, n // 200)):
        lab.report(t, model=float(run_avg[t - 1]), entropy=H, symbol_code=1.0)

    code, ideal = encode(msg, freq)
    k, l = code
    ok = bool(np.array_equal(decode(code, n, freq), msg))
    bits = "{:0{}b}".format(k, l) if l else ""
    lab.log("codeword: %d bits; the decoder %s" % (l, "recovers the message exactly" if ok else "FAILED"))
    lab.table("What the letters cost under the model", ["letter", "model's probability", "cost -log2 q (bits)", "times it came", "bits spent on it"],
              [["A", qa, -math.log2(qa), n - n_b, (n - n_b) * -math.log2(qa)], ["B", qb, -math.log2(qb), n_b, n_b * -math.log2(qb)]])
    lab.table("The codeword against the bounds", ["", "bits", "bits per letter"],
              [["sum of the model's surprisals, -log2 Q(message)", ideal, ideal / n],
               ["the arithmetic codeword", l, l / n],
               ["entropy of the source times the number of letters", n * H, H],
               ["any code that spends whole bits on each letter (at least 1 per letter)", n, 1.0]])
    lab.text("The codeword: first and last 64 of its %d bits" % l, bits[:64] + (" … " + bits[-64:] if l > 128 else bits[64:]))

    # a model that is wrong by a factor of ten about B, in both directions, on fresh messages of the same length
    rows, extra = [], {}
    for name, (ps, qs) in (("underrates", (0.1, 0.01)), ("overrates", (0.01, 0.1))):
        m = (rng.random(n) < ps).astype(np.int8)
        right, _ = encode(m, quantize(ps))
        wrong, _ = encode(m, quantize(qs))
        extra[name] = (wrong[1] - right[1]) / n
        rows.append(["B has %g, the model says %g (it %s B)" % (ps, qs, name), right[1] / n, wrong[1] / n, extra[name], kl(ps, qs)])
    lab.table("A model wrong by a factor of ten, both ways (fresh messages of %d letters)" % n,
              ["case", "bits per letter, right model", "bits per letter, wrong model", "extra bits per letter", "D(p||q) in bits"], rows)

    lab.result(bits=l, ideal_bits=ideal, overhead_bits=l - ideal, bits_per_letter=l / n, entropy_per_letter=H,
               cost_a=-math.log2(qa), cost_b=-math.log2(qb), letters=n, b_count=n_b, decoded=int(ok),
               kl_model=kl(p, qb), extra_underrate=extra["underrates"], extra_overrate=extra["overrates"],
               kl_underrate=kl(0.1, 0.01), kl_overrate=kl(0.01, 0.1), extra_ratio=extra["underrates"] / extra["overrates"])
