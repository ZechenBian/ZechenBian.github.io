"""Week 7 · A character-level transformer on Tiny Shakespeare (PyTorch, trains on your Mac).

A decoder-only transformer reads T characters and predicts the next one at every position.
The loss is the mean cross-entropy in nats per character; dividing by ln 2 gives bits per character.
The model is the one in the notes: token + position embeddings, then n_layer blocks of

    x <- x + Attention(LayerNorm(x))        causal: position i only looks at positions j <= i
    x <- x + MLP(LayerNorm(x))              applied to every position separately

then a final LayerNorm and a linear map to one score per character.
Data: Tiny Shakespeare (real text, 1,115,394 characters, 65 distinct); the last 10% is held out for validation.
"""
import math
import time

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


class CausalSelfAttention(nn.Module):
    def __init__(self, d, n_head, block):
        super().__init__()
        assert d % n_head == 0
        self.n_head = n_head
        self.qkv = nn.Linear(d, 3 * d, bias=False)          # W_Q, W_K, W_V stacked in one matrix
        self.out = nn.Linear(d, d)
        self.register_buffer("mask", torch.tril(torch.ones(block, block)).bool())

    def forward(self, x):                                    # x: [B, T, d]
        B, T, d = x.shape
        q, k, v = self.qkv(x).split(d, dim=2)
        # split d into n_head heads of size d_k = d / n_head: [B, n_head, T, d_k]
        q, k, v = (t.view(B, T, self.n_head, d // self.n_head).transpose(1, 2) for t in (q, k, v))
        scores = (q @ k.transpose(-2, -1)) / math.sqrt(k.shape[-1])          # [B, n_head, T, T]
        scores = scores.masked_fill(~self.mask[:T, :T], float("-inf"))      # no looking ahead
        att = scores.softmax(dim=-1)                                         # each row sums to 1
        y = (att @ v).transpose(1, 2).contiguous().view(B, T, d)            # put the heads back side by side
        return self.out(y)


class Block(nn.Module):
    def __init__(self, d, n_head, block):
        super().__init__()
        self.ln1, self.ln2 = nn.LayerNorm(d), nn.LayerNorm(d)
        self.attn = CausalSelfAttention(d, n_head, block)
        self.mlp = nn.Sequential(nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        return x + self.mlp(self.ln2(x))


class CharTransformer(nn.Module):
    def __init__(self, vocab, d, n_layer, n_head, block, use_pos):
        super().__init__()
        self.block, self.use_pos = block, use_pos
        self.tok = nn.Embedding(vocab, d)
        self.pos = nn.Embedding(block, d)
        self.blocks = nn.ModuleList([Block(d, n_head, block) for _ in range(n_layer)])
        self.ln = nn.LayerNorm(d)
        self.head = nn.Linear(d, vocab, bias=False)
        for m in self.modules():                             # small random weights, as in GPT-2
            if isinstance(m, (nn.Linear, nn.Embedding)):
                nn.init.normal_(m.weight, mean=0.0, std=0.02)
            if isinstance(m, nn.Linear) and m.bias is not None:
                nn.init.zeros_(m.bias)

    def forward(self, idx):                                  # idx: [B, T] integers
        x = self.tok(idx)
        if self.use_pos:
            x = x + self.pos(torch.arange(idx.shape[1], device=idx.device))
        for blk in self.blocks:
            x = blk(x)
        return self.head(self.ln(x))                         # [B, T, vocab] scores for the next character

    @torch.no_grad()
    def generate(self, idx, n, temperature=1.0):
        for _ in range(n):
            logits = self(idx[:, -self.block:])[:, -1, :] / temperature
            nxt = torch.multinomial(logits.softmax(dim=-1), num_samples=1)
            idx = torch.cat([idx, nxt], dim=1)
        return idx


def count_model_baselines(train_ids, val_ids, vocab):
    """Validation loss (nats per character) of two models that only count: unigram and bigram tables (add-one smoothing)."""
    uni = np.bincount(train_ids, minlength=vocab) + 1.0
    uni_loss = -np.log(uni / uni.sum())[val_ids].mean()
    big = np.ones((vocab, vocab))
    np.add.at(big, (train_ids[:-1], train_ids[1:]), 1.0)
    big_logp = np.log(big / big.sum(axis=1, keepdims=True))
    return float(uni_loss), float(-big_logp[val_ids[:-1], val_ids[1:]].mean())


def run(lab):
    dev = lab.device
    d, n_layer, n_head = int(lab.p("d_model", 128)), int(lab.p("n_layer", 4)), int(lab.p("n_head", 4))
    block, batch = int(lab.p("block_size", 128)), int(lab.p("batch", 64))
    max_steps, lr = int(lab.p("max_steps", 2000)), float(lab.p("lr", 1e-3))
    use_pos, eval_every = bool(lab.p("positional", True)), int(lab.p("eval_every", 100))

    text = lab.dataset("tinyshakespeare")
    chars = sorted(set(text))
    vocab = len(chars)
    stoi = {c: i for i, c in enumerate(chars)}
    ids = np.array([stoi[c] for c in text], dtype=np.int64)
    n_train = int(0.9 * len(ids))
    uni_loss, bigram_loss = count_model_baselines(ids[:n_train], ids[n_train:], vocab)
    lab.log("%d characters, %d distinct; uniform guess = ln %d = %.3f nats; unigram table %.3f; bigram table %.3f"
            % (len(ids), vocab, vocab, math.log(vocab), uni_loss, bigram_loss))

    data = torch.from_numpy(ids).to(dev)
    train, val = data[:n_train], data[n_train:]
    offsets = torch.arange(block, device=dev)

    def get_batch(split):
        src = train if split == "train" else val
        start = torch.randint(0, len(src) - block - 1, (batch,), device=dev)
        pos = start[:, None] + offsets[None, :]
        return src[pos], src[pos + 1]                        # inputs and the same text shifted by one character

    model = CharTransformer(vocab, d, n_layer, n_head, block, use_pos).to(dev)
    n_params = sum(p.numel() for p in model.parameters())
    lab.log("model: %d layers, %d heads, d = %d, context %d characters, %d parameters, on %s"
            % (n_layer, n_head, d, block, n_params, dev))
    opt = torch.optim.AdamW(model.parameters(), lr=lr, betas=(0.9, 0.99), weight_decay=0.01)
    warmup = min(100, max(1, max_steps // 10))

    def lr_at(step):                                         # linear warm-up, then cosine decay to 10% of lr
        if step < warmup:
            return lr * (step + 1) / warmup
        t = (step - warmup) / max(1, max_steps - warmup)
        return lr * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * min(1.0, t))))

    @torch.no_grad()
    def estimate(split, n_batches=20):
        model.eval()
        total = 0.0
        for _ in range(n_batches):
            x, y = get_batch(split)
            total += F.cross_entropy(model(x).view(-1, vocab), y.view(-1)).item()
        model.train()
        return total / n_batches

    def sample(n, temperature=0.8):
        model.eval()
        start = torch.tensor([[stoi["\n"]]], device=dev)
        out = model.generate(start, n, temperature)[0].tolist()
        model.train()
        return "".join(chars[i] for i in out[1:])

    t0, step, val_loss, train_loss = time.perf_counter(), 0, float("nan"), float("nan")
    first_loss = None
    while step <= max_steps:
        if step % eval_every == 0 or step == max_steps:
            train_loss, val_loss = estimate("train"), estimate("val")
            if first_loss is None:
                first_loss = val_loss
            lab.report(step, train_loss=train_loss, val_loss=val_loss, bigram_table=bigram_loss)
            if step % (5 * eval_every) == 0 and step > 0:
                lab.log("step %d, val %.3f | %s" % (step, val_loss, sample(120).replace("\n", " / ")))
        if step == max_steps:
            break
        if lab.time_left() < 8:
            lab.log("time budget nearly used up: stopping at step %d of %d (raise the budget to train longer)" % (step, max_steps))
            train_loss, val_loss = estimate("train"), estimate("val")
            lab.report(step, train_loss=train_loss, val_loss=val_loss, bigram_table=bigram_loss)
            break
        for group in opt.param_groups:
            group["lr"] = lr_at(step)
        x, y = get_batch("train")
        loss = F.cross_entropy(model(x).view(-1, vocab), y.view(-1))
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        step += 1

    seconds = time.perf_counter() - t0
    lab.text("Sample from the trained model (temperature 0.8)", sample(600))
    lab.result(val_loss=val_loss, train_loss=train_loss, loss_at_step_0=first_loss, bigram_table=bigram_loss, unigram_table=uni_loss,
               uniform=math.log(vocab), bits_per_char=val_loss / math.log(2), steps=step, seconds=seconds,
               steps_per_second=step / max(seconds, 1e-9), n_params=n_params, device=str(dev))
