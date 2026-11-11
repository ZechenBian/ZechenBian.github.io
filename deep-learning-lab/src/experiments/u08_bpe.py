"""Week 8 · Byte-pair encoding, learned on Shakespeare (plain Python and numpy).

Data: Tiny Shakespeare, real text; merges are learned on the first 90% and measured on the held-out 10%.

The text is first cut into words, each with its leading space, as GPT-2 does (section 2). Every word starts as a
sequence of single characters. One merge step finds the most frequent adjacent pair of symbols in the training words,
counted with the words' frequencies, and replaces it everywhere by a new symbol. After M merges the vocabulary has the
65 characters plus M merged symbols. To encode new text, apply the learned merges to each word in the order they were
learned. The script records how many tokens per character the held-out text needs after 0, 100, 300, 1,000 and 3,000
merges.
"""
import re
from collections import Counter, defaultdict

import numpy as np

SPLIT = re.compile(r" ?[A-Za-z]+| ?[0-9]+| ?[^A-Za-z0-9\s]+|\s+")


def learn(word_freq, M, checkpoints, on_checkpoint):
    words = [list(w) for w in word_freq]
    freqs = list(word_freq.values())
    pairs, where = Counter(), defaultdict(set)
    for i, w in enumerate(words):
        for p in zip(w, w[1:]):
            pairs[p] += freqs[i]; where[p].add(i)
    merges = []
    for m in range(1, M + 1):
        if not pairs:
            break
        best = max(pairs, key=pairs.get)
        if pairs[best] <= 0:
            break
        merges.append(best)
        new = best[0] + best[1]
        for i in list(where[best]):
            w, f = words[i], freqs[i]
            if len(w) < 2:
                continue
            for p in zip(w, w[1:]):
                pairs[p] -= f
            out, j = [], 0
            while j < len(w):
                if j + 1 < len(w) and w[j] == best[0] and w[j + 1] == best[1]:
                    out.append(new); j += 2
                else:
                    out.append(w[j]); j += 1
            words[i] = out
            for p in zip(out, out[1:]):
                pairs[p] += f; where[p].add(i)
        del pairs[best]
        if m in checkpoints:
            on_checkpoint(m, merges)
    return merges


def encode_word(word, rank):
    w = list(word)
    while len(w) > 1:
        cand = [(rank.get((a, b), 1 << 30), k) for k, (a, b) in enumerate(zip(w, w[1:]))]
        r, k = min(cand)
        if r == 1 << 30:
            break
        w = w[:k] + [w[k] + w[k + 1]] + w[k + 2:]
    return w


def tokens_per_char(word_freq, merges):
    rank = {p: i for i, p in enumerate(merges)}
    toks = sum(len(encode_word(w, rank)) * f for w, f in word_freq.items())
    chars = sum(len(w) * f for w, f in word_freq.items())
    return toks / chars


def run(lab):
    text = lab.dataset("tinyshakespeare")
    n = int(0.9 * len(text))
    train, held = Counter(SPLIT.findall(text[:n])), Counter(SPLIT.findall(text[n:]))
    M = int(lab.p("merges", 3000))
    checkpoints = sorted({c for c in (100, 300, 1000, 3000, M) if c <= M})
    lab.log("%d distinct words in training, %d in the held-out text; %d of the held-out ones never occur in training"
            % (len(train), len(held), sum(1 for w in held if w not in train)))
    res, rows = {"tpc_0": 1.0}, [[0, 65, 1.0, 1.0]]
    rows_train = {}

    def cp(m, merges):
        t = tokens_per_char(held, merges)
        rows_train[m] = tokens_per_char(train, merges)
        res["tpc_%d" % m] = t
        rows.append([m, 65 + m, rows_train[m], t])
        lab.log("%d merges: %.4f tokens per character on held-out text" % (m, t))

    merges = learn(train, M, set(checkpoints), cp)
    lab.table("Tokens per character after M merges", ["merges M", "vocabulary size", "training text", "held-out text"], rows)
    lab.plot("Held-out tokens per character against the number of merges", [str(r[0]) for r in rows], {"held-out": [r[3] for r in rows], "training": [r[2] for r in rows]},
             xlabel="merges", ylabel="tokens per character")
    show = lambda s: s.replace(" ", "␣").replace("\n", "⏎")
    lab.table("The first 15 merges", ["#", "pair", "new symbol"], [[i + 1, show(a) + " + " + show(b), show(a + b)] for i, (a, b) in enumerate(merges[:15])])
    rank = {p: i for i, p in enumerate(merges)}
    examples = [" the", " king", " Northumberland", " unfortunately", " transformer", " GPU"]
    lab.table("Some words after %d merges" % len(merges), ["word", "tokens"], [[show(w), " | ".join(show(t) for t in encode_word(w, rank))] for w in examples])
    res.update(merges=len(merges), unseen_words=sum(1 for w in held if w not in train))
    if "tpc_1000" in res and "tpc_3000" in res:
        res["gain_1000_3000"] = 1 - res["tpc_3000"] / res["tpc_1000"]
    lab.result(**res)
