"""Week 1 · Backpropagation by hand, checked against finite differences (numpy only).

A small ReLU network learns a 3-class spiral in the plane (simulated data). Nothing is hidden:
the forward pass, the cross-entropy loss, the backward pass from the notes

    delta^L = p - onehot(y)
    delta^l = (delta^{l+1} W^{l+1 T}) * h'(z^l)
    dL/dW^l = a^{l-1 T} delta^l,     dL/db^l = sum over the batch of delta^l

a finite-difference test of those gradients, and minibatch gradient descent.
Row-vector convention as in the notes: a^l = h(a^{l-1} W^l + b^l), and W^l has shape (n_{l-1}, n_l).
"""
import numpy as np


def make_spiral(rng, n_per_class=300, k=3, noise=0.5, turns=5.5):
    """k interleaved spiral arms in the plane (simulated). The angular noise makes neighbouring arms overlap a little,
    so no classifier reaches 100%."""
    X, y = [], []
    for c in range(k):
        r = np.linspace(0.05, 1.0, n_per_class)
        t = np.linspace(0.0, turns, n_per_class) + c * 2 * np.pi / k + rng.normal(0, noise, n_per_class)
        X.append(np.stack([r * np.sin(t), r * np.cos(t)], axis=1))
        y.append(np.full(n_per_class, c))
    X, y = np.concatenate(X), np.concatenate(y)
    perm = rng.permutation(len(y))
    return X[perm], y[perm]


def init_params(rng, sizes, scale):
    """He initialization (variance 2 / n_in) times `scale`; scale = 0 is the all-zeros network."""
    params = []
    for n_in, n_out in zip(sizes[:-1], sizes[1:]):
        W = rng.normal(0, np.sqrt(2.0 / n_in), (n_in, n_out)) * scale
        params.append([W, np.zeros(n_out)])
    return params


def forward(params, X, act):
    """Logits, plus what the backward pass needs: for each layer the input a^{l-1} and the pre-activation z^l."""
    a, cache = X, []
    for l, (W, b) in enumerate(params):
        z = a @ W + b
        cache.append((a, z))
        if l == len(params) - 1:
            a = z                                   # last layer: logits, no activation
        else:
            a = np.maximum(z, 0) if act == "relu" else np.tanh(z)
    return a, cache


def loss_and_probs(logits, y):
    """Mean cross-entropy and the softmax probabilities (computed stably)."""
    z = logits - logits.max(axis=1, keepdims=True)
    logp = z - np.log(np.exp(z).sum(axis=1, keepdims=True))
    return -logp[np.arange(len(y)), y].mean(), np.exp(logp)


def backward(params, cache, probs, y, act):
    """Gradient of the mean cross-entropy with respect to every W and b."""
    n = len(y)
    delta = probs.copy()
    delta[np.arange(n), y] -= 1.0                   # delta^L = p - onehot(y)
    delta /= n                                      # the loss is a mean over the batch
    grads = [None] * len(params)
    for l in reversed(range(len(params))):
        a_prev, z = cache[l]
        if l < len(params) - 1:                     # hidden layer: multiply by h'(z^l)
            delta = delta * ((z > 0) if act == "relu" else (1 - np.tanh(z) ** 2))
        grads[l] = [a_prev.T @ delta, delta.sum(axis=0)]
        delta = delta @ params[l][0].T              # hand delta^l W^{l T} back to layer l-1
    return grads


def grad_check(params, X, y, act, rng, n_checks=40, eps=1e-5):
    """Compare backprop with the central difference (L(theta + eps e) - L(theta - eps e)) / (2 eps) on random coordinates.

    The central difference is only a test where L is smooth between theta - eps e and theta + eps e. With ReLU that
    fails when the step moves some pre-activation across 0 for some training point (a kink): such coordinates are
    not compared, and they are counted."""
    logits, cache = forward(params, X, act)
    _, probs = loss_and_probs(logits, y)
    grads = backward(params, cache, probs, y, act)

    def signs(c):                                   # which hidden units are on, for every training point
        return [z > 0 for _, z in c[:-1]]

    rows, worst, skipped = [], 0.0, 0
    for _ in range(n_checks):
        l, which = int(rng.integers(len(params))), int(rng.integers(2))
        P = params[l][which]
        idx = tuple(int(rng.integers(s)) for s in P.shape)
        name = "%s%d%s" % ("W" if which == 0 else "b", l + 1, list(idx))
        old = P[idx]
        P[idx] = old + eps
        out_up, c_up = forward(params, X, act)
        P[idx] = old - eps
        out_down, c_down = forward(params, X, act)
        P[idx] = old
        fd = (loss_and_probs(out_up, y)[0] - loss_and_probs(out_down, y)[0]) / (2 * eps)
        bp = grads[l][which][idx]
        if act == "relu" and any((a != b).any() for a, b in zip(signs(c_up), signs(c_down))):
            skipped += 1
            rows.append([name, bp, fd, "not compared: the step crosses a kink"])
            continue
        # a relative error only means something where the gradient is resolvable: the difference quotient itself
        # carries rounding noise of about 1e-16 / eps = 1e-11, so coordinates with a (near-)zero gradient count as 0
        rel = abs(fd - bp) / (abs(fd) + abs(bp)) if abs(fd) + abs(bp) > 1e-5 else 0.0
        worst = max(worst, rel)
        rows.append([name, bp, fd, rel])
    return worst, rows, skipped


def accuracy(params, X, y, act):
    return float((forward(params, X, act)[0].argmax(axis=1) == y).mean())


def run(lab):
    rng = lab.rng
    width, depth = int(lab.p("width", 32)), int(lab.p("depth", 2))
    lr, epochs, batch = float(lab.p("lr", 0.3)), int(lab.p("epochs", 300)), int(lab.p("batch", 64))
    act, scale = lab.p("activation", "relu"), float(lab.p("init_scale", 1.0))

    X, y = make_spiral(rng)
    n_train = 600
    Xtr, ytr, Xva, yva = X[:n_train], y[:n_train], X[n_train:], y[n_train:]
    params = init_params(rng, [2] + [width] * depth + [3], scale)
    n_params = sum(W.size + b.size for W, b in params)
    lab.log("data: %d train, %d validation points (simulated spiral); network 2-%s-3, %d parameters"
            % (len(ytr), len(yva), "-".join([str(width)] * depth), n_params))

    # 1) is the hand-written gradient right? (float64, so the two should agree to many digits)
    worst, rows, skipped = grad_check(params, Xtr, ytr, act, rng)
    lab.log("gradient check on 40 random coordinates: largest relative error %.2e" % worst
            + ("; %d of them not compared, because the finite-difference step crossed a kink of ReLU" % skipped if skipped else ""))
    if act == "relu":
        on_kink = sum(int((z == 0).sum()) for _, z in forward(params, Xtr, act)[1][:-1])
        if on_kink:
            lab.log("note: %d hidden pre-activations are exactly 0, the kink of ReLU. At such a point the loss need not be differentiable "
                    "in the parameters; backprop uses h'(0) = 0, and a finite difference may disagree (notes, section 6)." % on_kink)
    lab.table("Backprop vs finite differences (first 8 of 40 coordinates)", ["parameter", "backprop", "finite difference", "relative error"], rows[:8])

    # 2) decision regions are drawn on this grid at a few moments of training
    g = np.linspace(-1.25, 1.25, 60)
    grid = np.stack(np.meshgrid(g, g[::-1]), axis=2).reshape(-1, 2)      # row 0 is the top of the picture

    def snapshot(label):
        probs = loss_and_probs(forward(params, grid, act)[0], np.zeros(len(grid), dtype=int))[1]
        lab.regions("Decision regions during training", probs.reshape(60, 60, 3), (-1.25, 1.25, -1.25, 1.25),
                    points=Xva, labels=yva, frame=label)

    # 3) minibatch gradient descent
    steps_per_epoch = int(np.ceil(n_train / batch))
    total = epochs * steps_per_epoch
    shots = sorted(set([0] + [int(total * f) for f in (0.01, 0.03, 0.1, 0.25, 0.5, 1.0)]))
    step = 0
    for epoch in range(epochs):
        perm = rng.permutation(n_train)
        for i in range(0, n_train, batch):
            if step in shots:
                snapshot("step %d" % step)
            idx = perm[i:i + batch]
            logits, cache = forward(params, Xtr[idx], act)
            loss, probs = loss_and_probs(logits, ytr[idx])
            grads = backward(params, cache, probs, ytr[idx], act)
            for (W, b), (gW, gb) in zip(params, grads):
                W -= lr * gW
                b -= lr * gb
            step += 1
            if step % 25 == 0 or step == total:
                va_loss = loss_and_probs(forward(params, Xva, act)[0], yva)[0]
                lab.report(step, train_loss=loss, val_loss=va_loss, val_acc=accuracy(params, Xva, yva, act))
        if lab.time_left() <= 0:
            lab.log("time budget used up at epoch %d" % epoch)
            break
    snapshot("step %d" % step)

    # a ReLU unit that outputs 0 on every training point has zero gradient and cannot recover: count the ones still alive
    hidden = forward(params, Xtr, act)[1][:-1]
    alive = sum(int((z > 0).any(axis=0).sum()) for _, z in hidden) if act == "relu" else width * depth
    lab.log("hidden units that are active on at least one training point: %d of %d" % (alive, width * depth))
    lab.result(val_acc=accuracy(params, Xva, yva, act), train_acc=accuracy(params, Xtr, ytr, act),
               val_loss=loss_and_probs(forward(params, Xva, act)[0], yva)[0],
               gradcheck_max_rel_err=worst, gradcheck_skipped=skipped, alive_hidden_units=alive, hidden_units=width * depth, n_params=n_params, steps=step)
