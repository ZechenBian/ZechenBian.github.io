"""Week 1 · The same network in PyTorch: autograd against your backprop (PyTorch, runs on your Mac).

Part 1 builds the spiral network twice from the same numbers: in numpy with the backward pass of the
previous experiment, and as a PyTorch module. loss.backward() is reverse-mode automatic differentiation,
that is, backpropagation on whatever computation you wrote. The two gradients should agree to rounding error.
Part 2 times one training step on the CPU and on the Apple GPU for three network sizes.
Part 3 trains the network with autograd and Adam on lab.device.

One convention differs. nn.Linear stores its weight with shape (out, in) and computes x W^T + b;
the notes use W of shape (in, out) and compute a W + b. The copy in part 1 transposes.
"""
import time

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


def make_spiral(rng, n_per_class=300, k=3, noise=0.5, turns=5.5):
    """The same simulated 3-arm spiral as in the numpy experiment."""
    X, y = [], []
    for c in range(k):
        r = np.linspace(0.05, 1.0, n_per_class)
        t = np.linspace(0.0, turns, n_per_class) + c * 2 * np.pi / k + rng.normal(0, noise, n_per_class)
        X.append(np.stack([r * np.sin(t), r * np.cos(t)], axis=1))
        y.append(np.full(n_per_class, c))
    X, y = np.concatenate(X), np.concatenate(y)
    perm = rng.permutation(len(y))
    return X[perm], y[perm]


def gradients_by_hand(params, X, y):
    """The backward pass from the notes (ReLU hidden layers, mean cross-entropy), in numpy."""
    a, cache = X, []
    for l, (W, b) in enumerate(params):
        z = a @ W + b
        cache.append((a, z))
        a = z if l == len(params) - 1 else np.maximum(z, 0)
    z = a - a.max(axis=1, keepdims=True)
    p = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True)
    delta = p.copy()
    delta[np.arange(len(y)), y] -= 1.0
    delta /= len(y)
    grads = [None] * len(params)
    for l in reversed(range(len(params))):
        a_prev, z = cache[l]
        if l < len(params) - 1:
            delta = delta * (z > 0)
        grads[l] = (a_prev.T @ delta, delta.sum(axis=0))
        delta = delta @ params[l][0].T
    return grads


def make_net(sizes):
    layers = []
    for i, (n_in, n_out) in enumerate(zip(sizes[:-1], sizes[1:])):
        layers.append(nn.Linear(n_in, n_out))
        if i < len(sizes) - 2:
            layers.append(nn.ReLU())
    return nn.Sequential(*layers)


def run(lab):
    rng, dev = lab.rng, lab.device
    width, steps, lr = int(lab.p("width", 32)), int(lab.p("steps", 1500)), float(lab.p("lr", 0.01))
    X, y = make_spiral(rng)
    Xtr, ytr, Xva, yva = X[:600], y[:600], X[600:], y[600:]
    sizes = [2, width, width, 3]

    # ---- 1) one gradient, computed two ways (float64 on the CPU, so they can agree to about 1e-16)
    params = [(rng.normal(0, np.sqrt(2.0 / n_in), (n_in, n_out)), rng.normal(0, 0.1, n_out))
              for n_in, n_out in zip(sizes[:-1], sizes[1:])]
    by_hand = gradients_by_hand(params, Xtr, ytr)
    net64 = make_net(sizes).double()
    linears = [m for m in net64 if isinstance(m, nn.Linear)]
    with torch.no_grad():
        for lin, (W, b) in zip(linears, params):
            lin.weight.copy_(torch.from_numpy(W.T))            # (in, out) in the notes -> (out, in) in PyTorch
            lin.bias.copy_(torch.from_numpy(b))
    loss = F.cross_entropy(net64(torch.from_numpy(Xtr)), torch.from_numpy(ytr))
    loss.backward()                                            # fills .grad of every parameter
    rows, worst = [], 0.0
    for l, (lin, (gW, gb)) in enumerate(zip(linears, by_hand)):
        dW = float(np.abs(lin.weight.grad.numpy().T - gW).max())
        db = float(np.abs(lin.bias.grad.numpy() - gb).max())
        worst = max(worst, dW, db)
        rows.append(["W%d" % (l + 1), "%d x %d" % gW.shape, float(np.abs(gW).max()), dW])
        rows.append(["b%d" % (l + 1), "%d" % gb.shape[0], float(np.abs(gb).max()), db])
    lab.table("Autograd versus the hand-written backward pass", ["parameter", "shape", "largest gradient entry", "largest difference"], rows)
    lab.log("autograd vs hand-written backprop: largest difference %.2e (loss %.6f)" % (worst, loss.item()))

    # ---- 2) how long does one training step take? CPU versus the Apple GPU, three sizes
    def ms_per_step(device, w, n_steps=30):
        net = make_net([2, w, w, 3]).to(device)
        opt = torch.optim.SGD(net.parameters(), lr=0.01)
        xb = torch.from_numpy(Xtr.astype(np.float32)).to(device)
        yb = torch.from_numpy(ytr).to(device)
        t0 = time.perf_counter()
        for i in range(n_steps + 5):
            if i == 5:                                         # the first steps include one-off setup; time the rest
                t0 = time.perf_counter()
            step_loss = F.cross_entropy(net(xb), yb)
            opt.zero_grad(set_to_none=True)
            step_loss.backward()
            opt.step()
            step_loss.item()                                   # wait until the device has really finished this step
        return (time.perf_counter() - t0) / n_steps * 1e3

    speed, timing = {}, []
    if dev is not None and dev.type != "cpu":
        for w in (32, 256, 2048):
            cpu_ms, gpu_ms = ms_per_step(torch.device("cpu"), w), ms_per_step(dev, w)
            speed[w] = cpu_ms / gpu_ms
            timing.append([w, 2 * w + w + w * w + w + 3 * w + 3, cpu_ms, gpu_ms, cpu_ms / gpu_ms])
            lab.log("width %4d: CPU %.2f ms per step, %s %.2f ms per step" % (w, cpu_ms, dev.type, gpu_ms))
            if lab.time_left() < 15:
                break
        lab.table("One training step on 600 points: CPU versus %s" % dev.type,
                  ["width", "parameters", "CPU ms", "GPU ms", "CPU time / GPU time"], timing)
    else:
        lab.log("no GPU device here (lab.device = %s): skipping the CPU versus GPU timing" % dev)

    # ---- 3) train with autograd: no backward pass to write, any optimizer
    net = make_net(sizes).to(dev)
    opt = torch.optim.Adam(net.parameters(), lr=lr)
    xtr, ytr_t = torch.from_numpy(Xtr.astype(np.float32)).to(dev), torch.from_numpy(ytr).to(dev)
    xva, yva_t = torch.from_numpy(Xva.astype(np.float32)).to(dev), torch.from_numpy(yva).to(dev)
    g = np.linspace(-1.25, 1.25, 60)
    grid = torch.from_numpy(np.stack(np.meshgrid(g, g[::-1]), axis=2).reshape(-1, 2).astype(np.float32)).to(dev)
    val_acc = float("nan")
    for step in range(1, steps + 1):
        loss = F.cross_entropy(net(xtr), ytr_t)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        if step % 25 == 0 or step == steps:
            with torch.no_grad():
                out = net(xva)
                val_loss = F.cross_entropy(out, yva_t).item()
                val_acc = (out.argmax(dim=1) == yva_t).float().mean().item()
            lab.report(step, train_loss=loss.item(), val_loss=val_loss, val_acc=val_acc)
        if lab.time_left() <= 0:
            break
    with torch.no_grad():
        probs = net(grid).softmax(dim=1).reshape(60, 60, 3)
    lab.regions("Decision regions after training with autograd", probs, (-1.25, 1.25, -1.25, 1.25), points=Xva, labels=yva)
    lab.result(autograd_max_difference=worst, val_acc=val_acc, speedup_width_32=speed.get(32, float("nan")),
               speedup_width_2048=speed.get(2048, float("nan")), n_params=sum(p.numel() for p in net.parameters()), device=str(dev))
