// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The experiments. Each one is a Python script (src/experiments/*.py, embedded by the build as DL.SCRIPTS) plus what the
 * page needs to run it: parameters, how to draw its curves, and presets.
 *
 * A preset is a question put to the run before it starts:
 *   q, opts         the prediction the reader is asked to make
 *   judge(r, run)   which option turned out true, computed from the numbers of THIS run (so it stays honest when the
 *                   reader edits the script or the parameters); null = this run cannot decide the question
 *   happened(r)     one plain sentence with the measured numbers
 *   why             the explanation, with pointers back into the notes
 *   ref             the reference run recorded for it (src/reference.json), shown when no engine is connected
 * Why the sample presets are built this way (keep to these when adding units):
 *   1. One question, one number. The run must be able to answer the question by itself, and the answer should surprise
 *      at least some careful readers.
 *   2. The explanation names the mechanism and the place in the notes where it is proved or sourced.
 *   3. Every dataset says "simulated" or "real", with its source, next to the experiment.
 *   4. The default run is short (seconds for numpy, a few minutes for the one real training run).
 *   5. The answer must not depend on the random seed, which the reader can change: the boundaries between the options
 *      stay clear of where the number lands (node test/seed_audit.js runs every numpy preset with 40 seeds), and
 *      every number quoted in an explanation is one that the run or its reference run shows. */
(function () {
  "use strict";
  var num = DL.num, pct = DL.pct;
  function isNum(v) { return typeof v === "number" && v === v; }
  var SPIRAL = "Three interleaved spiral arms in the plane, 900 points generated in the script from the seed (600 for training, 300 for validation). Neighbouring arms overlap a little, so no classifier reaches 100%.";
  var LOSS_ACC = { panels: [{ label: "loss (nats)", keys: ["train_loss", "val_loss"] }, { label: "validation accuracy", keys: ["val_acc"], domain: [0, 1], weight: 0.7 }], names: { train_loss: "training loss", val_loss: "validation loss", val_acc: "validation accuracy" } };

  DL.EXPERIMENTS = [
    /* ------------------------------ week 1 ------------------------------ */
    { id: "u01_backprop_numpy", unit: "u1", lib: "numpy", budget: 30, time: "under a second",
      title: "Backpropagation by hand, checked against finite differences",
      data: { kind: "simulated", text: SPIRAL },
      desc: "A ReLU network with two hidden layers of 32 units learns to separate three spiral arms. Everything is written out in numpy: the forward pass, the loss, the backward pass of section 6, a finite-difference test of that backward pass, and minibatch gradient descent. The script is the theorem, line by line. Open the Code tab and compare.",
      params: [
        { k: "width", label: "hidden width", type: "int", def: 32, min: 1, max: 256 },
        { k: "depth", label: "hidden layers", type: "int", def: 2, min: 1, max: 6 },
        { k: "lr", label: "step size η", type: "float", def: 0.3, min: 0, max: 100 },
        { k: "epochs", label: "epochs", type: "int", def: 300, min: 1, max: 2000 },
        { k: "batch", label: "minibatch size", type: "int", def: 64, min: 1, max: 600 },
        { k: "activation", label: "activation", type: "choice", def: "relu", choices: ["relu", "tanh"] },
        { k: "init_scale", label: "initial weight scale", type: "float", def: 1, min: 0, max: 5 }],
      chart: LOSS_ACC,
      tiles: [{ k: "val_acc", label: "validation accuracy", f: "pct" }, { k: "train_acc", label: "training accuracy", f: "pct" }, { k: "val_loss", label: "validation loss (nats)" },
        { k: "gradcheck_max_rel_err", label: "largest gradient-check error", f: "sci" }, { k: "gradcheck_skipped", label: "of the 40 coordinates, not compared (on a kink)", nz: true }, { k: "alive_hidden_units", label: "hidden units still active", of: "hidden_units" }, { k: "n_params", label: "parameters" }],
      presets: [
        { id: "grad", name: "Check the gradient, then train", set: {}, ref: "u01_backprop_numpy/default",
          q: "Before training, the script compares its hand-written backward pass with finite differences on 40 random parameters, in 64-bit arithmetic. How large is the largest relative disagreement?",
          opts: ["Around 1e-2: good enough to train, but only approximately equal", "Around 1e-4", "Below 1e-5: equal up to rounding"],
          judge: function (r) { var e = r.gradcheck_max_rel_err; return !isNum(e) ? null : e < 1e-5 ? 2 : e < 1e-3 ? 1 : 0; },
          happened: function (r) { return "The largest relative error was " + num(r.gradcheck_max_rel_err) + (r.gradcheck_skipped ? " (" + num(r.gradcheck_skipped) + " of the 40 coordinates " + (r.gradcheck_skipped === 1 ? "was" : "were") + " not compared: there the finite-difference step crossed a kink)" : "") + ". The network then reached " + pct(r.val_acc) + " validation accuracy."; },
          why: "The backward pass is not an approximation. It computes the exact derivative of the function that the forward pass computes, so the two numbers can differ only by rounding and by the truncation error of the finite difference: typically about $10^{-8}$ relative here (section 6, *Checking a gradient*). A disagreement near $10^{-2}$ would mean a bug. One caveat comes with ReLU: where the finite-difference step moves a pre-activation across its kink, the loss is not smooth and the comparison says nothing, so the script leaves such coordinates out and counts them. The picture frames show the decision regions forming; the network is piecewise linear, so the boundaries are polygons." },
        { id: "zero", name: "Start from all zeros", set: { init_scale: 0 }, ref: "u01_backprop_numpy/zero",
          q: "Every weight and bias starts at exactly 0 instead of at small random values. After 300 epochs the validation accuracy is…",
          opts: ["At chance: about one in three", "Clearly worse, but above chance", "About the same as with random initialization"],
          judge: function (r) { var a = r.val_acc; return !isNum(a) ? null : a < 0.4 ? 0 : a < 0.85 ? 1 : 2; },
          happened: function (r) { return "Validation accuracy " + pct(r.val_acc) + ", validation loss " + num(r.val_loss) + " (ln 3 = 1.0986). Hidden units active at the end: " + num(r.alive_hidden_units) + " of " + num(r.hidden_units) + "."; },
          why: "With zero weights every hidden activation is 0, so the gradient of the last weight matrix, $(a^{L-1})^\\top\\delta^L$, vanishes; and $\\delta^{L-1} = (\\delta^L (W^L)^\\top)\\odot h'$ vanishes because $W^L = 0$. Only the last bias ever moves. The network learns the class frequencies and nothing else, and its loss settles at the entropy of the labels, $\\ln 3$ (first check question of the notes). Random initialization exists to break this symmetry. Note that the gradient check still passes on the coordinates it compares: backpropagation correctly reports a gradient that is almost entirely zero. It leaves out about half of the 40, because every hidden pre-activation starts exactly on the kink of ReLU, so a step in a first-layer weight or in a hidden bias switches units on or off." },
        { id: "bigstep", name: "A step size ten times larger", set: { lr: 3 }, ref: "u01_backprop_numpy/bigstep",
          q: "The step size goes from 0.3 to 3.0. What happens to training?",
          opts: ["It reaches about the same accuracy", "It ends clearly worse, but still classifies most points correctly", "It fails: fewer than half of the points end up right (chance is one in three)"],
          judge: function (r) { var a = r.val_acc; return !isNum(a) ? null : a >= 0.85 ? 0 : a >= 0.5 ? 1 : 2; },
          happened: function (r) { return "Validation accuracy " + pct(r.val_acc) + ". Hidden units still active on at least one training point: " + num(r.alive_hidden_units) + " of " + num(r.hidden_units) + "."; },
          why: "Nothing overflowed; the loss stays finite. A few oversized steps threw most hidden units into the region where they output 0 on every training point. Such a unit has $h'(z) = 0$ everywhere, its incoming weights receive zero gradient, and it never comes back: a *dead ReLU*. What survives is too small a network to separate the arms. The descent lemma (section 5) guarantees progress only while the step size stays below a threshold set by curvature; above it nothing is promised, and this is one thing that can happen in a ReLU network. How many units survive depends on the random seed: over the seeds 1 to 40 between 1 and 20 of the 64 stayed alive, and the accuracy ended between 30% and 48%. Try the step sizes 1.0 and 2.0 next: the first trains as well as 0.3, the second ends in between, with part of the units dead. The failure sets in gradually, not at one sharp step size." }]
    },
    { id: "u01_autograd_torch", unit: "u1", lib: "torch", budget: 60, time: "a few seconds",
      title: "The same network in PyTorch: autograd against your backprop",
      data: { kind: "simulated", text: SPIRAL },
      desc: "Three short parts. First, one gradient computed twice on the same numbers: by the numpy backward pass, and by `loss.backward()`. Second, the time of one training step on the CPU and on the Apple GPU, for three network sizes. Third, the network trained with autograd and Adam.",
      params: [
        { k: "width", label: "hidden width", type: "int", def: 32, min: 2, max: 512 },
        { k: "steps", label: "training steps", type: "int", def: 1500, min: 50, max: 10000 },
        { k: "lr", label: "step size (Adam)", type: "float", def: 0.01, min: 0, max: 10 }],
      chart: LOSS_ACC,
      tiles: [{ k: "autograd_max_difference", label: "largest difference, autograd vs by hand", f: "sci" }, { k: "speedup_width_32", label: "CPU time ÷ GPU time, width 32", f: "x" }, { k: "speedup_width_2048", label: "CPU time ÷ GPU time, width 2048", f: "x" },
        { k: "val_acc", label: "validation accuracy", f: "pct" }, { k: "device", label: "device" }],
      presets: [
        { id: "speed", name: "CPU or GPU for a tiny network?", set: {}, ref: "u01_autograd_torch/default",
          q: "One training step of the 32-unit network on 600 points. How does the Apple GPU compare with the CPU?",
          opts: ["The GPU is at least twice as slow", "About the same: within a factor of 2", "The GPU is at least twice as fast"],
          judge: function (r) { var s = r.speedup_width_32; return !isNum(s) ? null : s >= 2 ? 2 : s > 0.5 ? 1 : 0; },
          happened: function (r) {
            var s = r.speedup_width_32, b = r.speedup_width_2048;
            return "At width 32 a GPU step took " + num(1 / s, 1) + " times as long as a CPU step" + (isNum(b) ? "; at width 2048 the GPU was " + (b >= 1 ? num(b, 2) + " times faster" : num(1 / b, 1) + " times slower") : "") + ". Autograd and the hand-written backward pass differed by at most " + num(r.autograd_max_difference) + ".";
          },
          why: "Every operation sent to the GPU pays a fixed cost to be dispatched, and for matrices this small that overhead dwarfs the arithmetic. The GPU wins only when the matrices are large: here at width 2048, where one layer holds four million weights. The first table is the real point of the experiment: `loss.backward()` is the backward pass of section 6 applied to the operations PyTorch recorded, and the two gradients agree to about $10^{-16}$, the rounding error of 64-bit arithmetic." }]
    },
    /* ------------------------------ week 4 ------------------------------ */
    { id: "u04_optimizers_quadratic", unit: "u4", lib: "numpy", budget: 30, time: "under a second",
      title: "Four optimizers on an ill-conditioned quadratic",
      data: { kind: "simulated", text: "A quadratic function defined in the script. There are no data." },
      desc: "$f(\\theta) = \\frac12\\theta^\\top H\\theta$ in 50 dimensions, with the eigenvalues of $H$ spread between 1 and $\\kappa$. Gradient descent and heavy ball run with their best constant settings from sections 1 and 2; RMSProp and Adam share one step size. The curves show $f/f_0$ on a logarithmic axis. With *rotate* on, the curves are for the same quadratic in randomly rotated coordinates; the script always runs both versions and compares them in a table.",
      params: [
        { k: "kappa", label: "condition number κ", type: "float", def: 100, min: 2, max: 100000 },
        { k: "steps", label: "steps", type: "int", def: 500, min: 20, max: 5000 },
        { k: "rotate", label: "rotate the coordinates", type: "bool", def: false },
        { k: "lr_adaptive", label: "step size of RMSProp and Adam", type: "float", def: 0.02, min: 0, max: 10 },
        { k: "dim", label: "dimension", type: "int", def: 50, min: 2, max: 200 }],
      chart: { panels: [{ label: "f ÷ f at the start (logarithmic)", keys: ["gd", "heavy_ball", "rmsprop", "adam"], log: true, floor: 1e-14 }], names: { gd: "gradient descent", heavy_ball: "heavy ball", rmsprop: "RMSProp", adam: "Adam" } },
      tiles: [{ k: "gd_steps", label: "gradient descent: steps to a millionth" }, { k: "heavy_ball_steps", label: "heavy ball: steps to a millionth" }, { k: "rmsprop_final", label: "RMSProp: f ÷ f₀ at the end", f: "sci" }, { k: "adam_final", label: "Adam: f ÷ f₀ at the end", f: "sci" },
        { k: "gd_growth_100_to_1000", label: "κ 100 → 1000: growth, gradient descent", f: "x" }, { k: "heavy_ball_growth_100_to_1000", label: "κ 100 → 1000: growth, heavy ball", f: "x" }],
      presets: [
        { id: "steps", name: "How slow is plain gradient descent?", set: {}, ref: "u04_optimizers_quadratic/default",
          q: "Condition number 100, best possible constant step size. How many steps does gradient descent need to shrink f a million-fold?",
          opts: ["Around 30", "Around 300", "Around 3,000"],
          judge: function (r) { var n = r.gd_steps; return !isNum(n) ? 2 : n < 100 ? 0 : n < 1000 ? 1 : 2; },
          happened: function (r) { return "Gradient descent needed " + (isNum(r.gd_steps) ? num(r.gd_steps) : "more than the allotted") + " steps, heavy ball " + (isNum(r.heavy_ball_steps) ? num(r.heavy_ball_steps) : "more than the allotted") + "."; },
          why: "The slowest coordinate shrinks by $(\\kappa-1)/(\\kappa+1) = 0.980$ per step and its share of the loss by the square of that, so a factor $10^6$ takes about $\\ln(10^6)/(2\\cdot0.02)\\approx 345$ steps for that coordinate alone. The run needs fewer because only the two extreme coordinates are that slow: the best step size balances them, so the softest creeps while the stiffest overshoots and flips sign at every step, and everything in between dies out faster. Here the two extremes hold about a tenth of the initial loss. Heavy ball contracts by $(\\sqrt\\kappa-1)/(\\sqrt\\kappa+1) = 0.818$ per step instead (sections 1 and 2)." },
        { id: "scale", name: "Ten times worse conditioning", set: {}, ref: "u04_optimizers_quadratic/default",
          q: "The condition number goes from 100 to 1,000, and gradient descent needs ten times as many steps. By what factor does heavy ball's step count grow?",
          opts: ["About 10 as well", "About 3", "It hardly changes"],
          judge: function (r) { var g = r.heavy_ball_growth_100_to_1000; return !isNum(g) ? null : g > 6 ? 0 : g > 1.5 ? 1 : 2; },
          happened: function (r) { return "From κ = 100 to κ = 1000 the step count grew by a factor " + num(r.gd_growth_100_to_1000, 1) + " for gradient descent and " + num(r.heavy_ball_growth_100_to_1000, 1) + " for heavy ball (last table)."; },
          why: "Step counts are proportional to $\\kappa$ for gradient descent and to $\\sqrt\\kappa$ for heavy ball, and $\\sqrt{10}\\approx3.2$. The measured factor is a little larger because at the two extreme eigenvalues the heavy-ball recurrence has a double root, which contributes a factor linear in $t$ (proposition in section 2). No method that uses only gradients beats $\\sqrt\\kappa$ in the worst case." },
        { id: "rotate", name: "Rotate the coordinates", set: { rotate: true }, ref: "u04_optimizers_quadratic/rotate",
          q: "The same quadratic is written in randomly rotated coordinates: same eigenvalues, same starting distance. Which optimizers get slower?",
          opts: ["Only RMSProp and Adam", "All four", "None: it is the same problem"],
          judge: function (r) {
            if (!isNum(r.adam_final_rotated) || !isNum(r.adam_final_axis)) return null;
            var first = Math.abs(r.gd_steps_rotated - r.gd_steps_axis) > 2 || Math.abs(r.heavy_ball_steps_rotated - r.heavy_ball_steps_axis) > 2 || (isNum(r.gd_steps_axis) !== isNum(r.gd_steps_rotated));
            var adaptive = r.adam_final_rotated > 100 * Math.max(r.adam_final_axis, 1e-30) || r.rmsprop_final_rotated > 100 * Math.max(r.rmsprop_final_axis, 1e-30);
            return first && adaptive ? 1 : adaptive ? 0 : first ? null : 2;
          },
          happened: function (r) { return "Gradient descent: " + num(r.gd_steps_axis) + " steps before, " + num(r.gd_steps_rotated) + " after. Heavy ball: " + num(r.heavy_ball_steps_axis) + " and " + num(r.heavy_ball_steps_rotated) + ". Adam's final f ÷ f₀: " + num(r.adam_final_axis) + " before, " + num(r.adam_final_rotated) + " after. RMSProp's: " + num(r.rmsprop_final_axis) + " and " + num(r.rmsprop_final_rotated) + "."; },
          why: "Gradient descent and heavy ball commute with rotations: their iterates in the new coordinates are the rotated old iterates, so nothing changes. RMSProp and Adam rescale each coordinate separately. When the eigenvectors of $H$ are the coordinate axes that rescaling removes the bad conditioning entirely; when they are not, it cannot (proposition in section 3). The advantage of the adaptive methods is a statement about the coordinates. That they help on real networks says that curvature there is, to a useful degree, aligned with individual parameters." }]
    },
    { id: "u04_init_depth", unit: "u4", lib: "numpy", budget: 90, time: "a few seconds",
      title: "Why the factor 2 in Kaiming initialization",
      data: { kind: "simulated", text: "Gaussian random inputs and weights generated in the script. Nothing is trained." },
      desc: "A batch of random inputs is pushed through a ReLU network with 50 layers of width 256 at initialization, with weight variance $c/n$ for $c = 1, 2, 4$. The plot shows the mean square activation layer by layer on a logarithmic axis. Then twenty independent networks with $c = 2$ show how far a single network wanders from the expectation.",
      params: [
        { k: "width", label: "width n", type: "int", def: 256, min: 8, max: 1024 },
        { k: "depth", label: "layers", type: "int", def: 50, min: 2, max: 200 },
        { k: "batch", label: "inputs in the batch", type: "int", def: 256, min: 8, max: 1024 },
        { k: "activation", label: "activation", type: "choice", def: "relu", choices: ["relu", "tanh"] }],
      chart: null,
      tiles: [{ k: "final_c1", label: "c = 1: mean square after the last layer", f: "sci" }, { k: "final_c2", label: "c = 2: after the last layer" }, { k: "final_c4", label: "c = 4: after the last layer", f: "sci" },
        { k: "c2_spread_min", label: "c = 2, twenty networks: smallest" }, { k: "c2_spread_max", label: "c = 2, twenty networks: largest" }],
      presets: [
        { id: "half", name: "Variance 1/n instead of 2/n", set: {}, ref: "u04_init_depth/default",
          q: "The weights have variance 1/n and the inputs have mean square 1. After 50 ReLU layers the mean square activation is about…",
          opts: ["10⁻¹⁵", "One thousandth", "0.5: it is halved once"],
          judge: function (r) { var L = r.log10_final_c1; return !isNum(L) ? null : L < -9 ? 0 : L < -1.5 ? 1 : 2; },
          happened: function (r) { return "After " + num(r.depth) + " layers the mean square was " + num(r.final_c1) + " with c = 1, " + num(r.final_c2) + " with c = 2, and " + num(r.final_c4) + " with c = 4."; },
          why: "Each ReLU layer multiplies the expected mean square by $c/2$, because half of the pre-activations are cut off (proposition in section 4). With $c = 1$ that is $2^{-50}\\approx9\\times10^{-16}$ after 50 layers, and gradients shrink by a comparable factor on the way back, so such a network cannot train. $c = 4$ fails in the other direction. Only $c = 2$ sits on the knife edge, which is why it is the standard initialization for ReLU networks (`torch.nn.init.kaiming_normal_`)." },
        { id: "spread", name: "How exact is c = 2?", set: {}, ref: "u04_init_depth/default",
          q: "With c = 2 the expectation is preserved exactly. Across twenty independent networks (50 layers, width 256), the largest and the smallest final mean square differ by a factor of…",
          opts: ["Less than 1.5", "Between 1.5 and 5", "More than 5"],
          judge: function (r) { var f = r.c2_spread_max / r.c2_spread_min; return !isNum(f) ? null : f > 5 ? 2 : f > 1.5 ? 1 : 0; },
          happened: function (r) { return "The twenty values ranged from " + num(r.c2_spread_min) + " to " + num(r.c2_spread_max) + ": a factor " + num(r.c2_spread_max / r.c2_spread_min, 1) + "."; },
          why: "Each layer multiplies the mean square by an independent random factor with mean 1 and variance $5/n$. Over $L$ layers the logarithm performs a random walk of variance about $5L/n$, which is $0.98$ here: a typical network is off by a factor $e^{\\pm1}$, and the largest and smallest of twenty typically differ by a factor in the tens. What matters is depth divided by width. Rerun with width 1024 (about half a minute) and the spread narrows. Averaging over the batch hides almost none of this, because the fluctuation belongs to the network, not to the input." }]
    },
    { id: "u04_fgsm_dimension", unit: "u4", lib: "numpy", budget: 90, time: "about 10 seconds",
      title: "Adversarial examples and dimension",
      data: { kind: "simulated", text: "Two Gaussian classes generated in the script: 6,000 training and 4,000 test points in each of the dimensions 16, 64, 256, 1024." },
      desc: "Two Gaussian classes in $\\mathbb{R}^d$ whose means are 6 noise standard deviations apart in every dimension $d$, so the clean problem is equally easy for $d = 16$ and for $d = 1024$. A logistic regression is trained in each dimension, and then every test point is attacked by the fast gradient sign method with budget $\\varepsilon$ per coordinate.",
      params: [
        { k: "mean_shift", label: "margin m (noise std)", type: "float", def: 3, min: 0.5, max: 6 },
        { k: "n_train", label: "training points", type: "int", def: 6000, min: 500, max: 20000 },
        { k: "n_test", label: "test points", type: "int", def: 4000, min: 500, max: 20000 }],
      chart: null,
      tiles: [{ k: "acc_clean_d1024", label: "clean accuracy, d = 1024", f: "pct" }, { k: "acc_fgsm_d16", label: "under attack (ε = 0.1), d = 16", f: "pct" }, { k: "acc_fgsm_d1024", label: "under attack (ε = 0.1), d = 1024", f: "pct" }],
      presets: [
        { id: "dim", name: "A tenth of the noise, in 1,024 dimensions", set: {}, ref: "u04_fgsm_dimension/default",
          q: "Every coordinate of a test point is moved by ε = 0.1, a tenth of the noise it already carries. In d = 1024 the clean accuracy is 99.8%. Under the attack it is…",
          opts: ["Below 60%", "Between 60% and 95%", "Still above 95%"],
          judge: function (r) { var a = r.acc_fgsm_d1024; return !isNum(a) ? null : a < 0.6 ? 0 : a < 0.95 ? 1 : 2; },
          happened: function (r) { return "Accuracy under attack: " + pct(r.acc_fgsm_d16) + " at d = 16 and " + pct(r.acc_fgsm_d1024) + " at d = 1024 (clean: " + pct(r.acc_clean_d1024) + ")."; },
          why: "The attack moves the score $w\\cdot x$ by $\\varepsilon\\lVert w\\rVert_1$, and for a weight vector spread over all coordinates $\\lVert w\\rVert_1\\approx\\sqrt d\\,\\lVert w\\rVert_2$. In units of the noise the shift is $\\varepsilon\\sqrt d = 3.2$ at $d = 1024$, more than the margin $m = 3$ between a class mean and the boundary, so most points cross: the accuracy is $\\Phi(m - \\varepsilon\\sqrt d) = \\Phi(-0.2) = 42\\%$ (proposition in section 8). At $d = 16$ the same $\\varepsilon$ shifts the score by 0.4. Random noise of the same size per coordinate would shift it by about 0.1 in any dimension. The second plot draws the same curves from the formula alone; compare it with the first." }]
    },
    /* ------------------------------ week 7 ------------------------------ */
    { id: "u07_attention_numpy", unit: "u7", lib: "numpy", budget: 30, time: "under a second",
      title: "Self-attention by hand: three claims, checked numerically",
      data: { kind: "simulated", text: "Gaussian random vectors and weights generated in the script. Nothing is trained." },
      desc: "One head of scaled dot-product self-attention in a dozen lines of numpy, and three numerical checks of the notes: the causal mask makes the Jacobian triangular; without the mask, permuting the input permutes the output; and without the factor $1/\\sqrt{d_k}$ the softmax saturates as $d_k$ grows.",
      params: [
        { k: "T", label: "sequence length T", type: "int", def: 8, min: 2, max: 32 },
        { k: "d", label: "width d", type: "int", def: 16, min: 2, max: 128 },
        { k: "d_k", label: "key dimension d_k", type: "int", def: 16, min: 1, max: 128 }],
      chart: null,
      tiles: [{ k: "jacobian_upper_max", label: "mask on: Jacobian above the diagonal", f: "sci" }, { k: "equivariance_error", label: "no mask: Att(PX) − P·Att(X)", f: "sci" }, { k: "causal_equivariance_error", label: "mask on: Att(PX) − P·Att(X)" },
        { k: "last_output_shuffle_error", label: "mask on: last output after shuffling the earlier inputs", f: "sci" }, { k: "top_weight_scaled_dk256", label: "top weight, d_k = 256, with 1/√d_k", f: "pct" }, { k: "top_weight_unscaled_dk256", label: "top weight, d_k = 256, without", f: "pct" }],
      presets: [
        { id: "scale", name: "Leave out the 1/√d_k", set: {}, ref: "u07_attention_numpy/default",
          q: "One random query, 32 random keys, d_k = 256, and no division by √d_k. On average, how much of the attention goes to the single best-matching key? (Uniform attention would give it 3%.)",
          opts: ["Under 10%: still close to uniform", "Between 10% and 60%", "Over 60%: close to a hard lookup"],
          judge: function (r) { var w = r.top_weight_unscaled_dk256; return !isNum(w) ? null : w > 0.6 ? 2 : w >= 0.1 ? 1 : 0; },
          happened: function (r) { return "Without the scaling the top weight averaged " + pct(r.top_weight_unscaled_dk256) + "; with it, " + pct(r.top_weight_scaled_dk256) + "."; },
          why: "A dot product of two random vectors in $\\mathbb{R}^{d_k}$ has standard deviation $\\sqrt{d_k} = 16$ (proposition in section 1). Scores spread over tens of units make the softmax nearly one-hot: the best of 32 scores is typically several units ahead of the next, and the weights go like $e^{\\text{gap}}$. Dividing by $\\sqrt{d_k}$ brings the scores back to unit scale, where attention starts soft and gradients flow. The last table shows the entropy collapsing as $d_k$ grows." },
        { id: "shuffle", name: "Does a masked layer see order?", set: {}, ref: "u07_attention_numpy/default",
          q: "The causal mask is on and there is no positional information. Shuffle the first seven of the eight input positions. The output at the last position…",
          opts: ["Changes: the layer was given a different sequence", "Does not change at all, up to rounding"],
          judge: function (r) { var e = r.last_output_shuffle_error; return !isNum(e) ? null : e < 1e-9 ? 1 : 0; },
          happened: function (r) { return "The last output moved by " + num(r.last_output_shuffle_error) + ". For comparison: permuting all positions changed the masked layer's outputs by " + num(r.causal_equivariance_error) + " and the unmasked layer's by " + num(r.equivariance_error) + ", after undoing the permutation."; },
          why: "The last position attends to all positions, and its output is a weighted average over the *set* of earlier vectors: each weight depends on what a vector is, not on where it sits (proposition in section 2). One attention layer is therefore blind to the order of what came before. Order has to come from elsewhere: from positional encodings (section 4), or from depth, since after one masked layer each position's vector depends on what preceded it, and a second layer can tell orders apart (third check question)." }]
    },
    { id: "u07_char_transformer", unit: "u7", lib: "torch", budget: 600, time: "2 to 4 minutes", needs: ["tinyshakespeare"],
      title: "A character-level transformer on Tiny Shakespeare",
      data: { kind: "real", text: "Tiny Shakespeare: 1,115,394 characters of Shakespeare's plays in one text file, from Andrej Karpathy's char-rnn repository (github.com/karpathy/char-rnn, retrieved 2026-11-10). The last 10% is held out for validation. The page sends the text to the engine with each run; nothing is written to your disk." },
      desc: "A decoder-only transformer with 4 blocks, 4 heads and width 128, about 0.8 million parameters, reads 128 characters and predicts the next one at every position. It trains with AdamW on your Mac's GPU. The script computes three baselines from counts, and logs samples of generated text as training proceeds. This is the course's Colab task for the week, sized for a laptop.",
      params: [
        { k: "max_steps", label: "training steps", type: "int", def: 2000, min: 20, max: 20000 },
        { k: "d_model", label: "width d", type: "int", def: 128, min: 16, max: 512 },
        { k: "n_layer", label: "blocks", type: "int", def: 4, min: 1, max: 12 },
        { k: "n_head", label: "heads", type: "int", def: 4, min: 1, max: 16 },
        { k: "block_size", label: "context (characters)", type: "int", def: 128, min: 8, max: 512 },
        { k: "batch", label: "minibatch size", type: "int", def: 64, min: 4, max: 256 },
        { k: "lr", label: "peak step size", type: "float", def: 0.001, min: 0, max: 1 },
        { k: "positional", label: "positional embeddings", type: "bool", def: true },
        { k: "eval_every", label: "evaluate every (steps)", type: "int", def: 100, min: 10, max: 2000 }],
      chart: { panels: [{ label: "loss (nats per character)", keys: ["train_loss", "val_loss", "bigram_table"] }], names: { train_loss: "training loss", val_loss: "validation loss", bigram_table: "bigram table (counting pairs)" }, dash: { bigram_table: [5, 4] } },
      tiles: [{ k: "val_loss", label: "validation loss (nats per character)", d: 3 }, { k: "train_loss", label: "training loss", d: 3 }, { k: "bits_per_char", label: "bits per character", d: 2 }, { k: "bigram_table", label: "bigram table", d: 3 }, { k: "loss_at_step_0", label: "loss at step 0", d: 3 },
        { k: "steps", label: "steps" }, { k: "seconds", label: "training time", f: "secs" }, { k: "steps_per_second", label: "steps per second", d: 1 }, { k: "n_params", label: "parameters" }, { k: "device", label: "device" }],
      presets: [
        { id: "quick", name: "300 steps: can it beat counting?", set: { max_steps: 300, eval_every: 50 }, budget: 180, time: "under a minute", ref: "u07_char_transformer/quick",
          q: "A table of next-character frequencies given the previous character scores 2.48 nats per character. Starting from random weights, where is the transformer after only 300 steps (well under a minute)?",
          opts: ["Still above 2.48: 300 steps are far too few", "Below 2.48, but still above 2.0", "Already below 2.0"],
          judge: function (r) { var v = r.val_loss, b = r.bigram_table; return !isNum(v) || !isNum(b) ? null : v >= b ? 0 : v >= 2.0 ? 1 : 2; },
          happened: function (r) { return "After " + num(r.steps) + " steps the validation loss was " + num(r.val_loss, 3) + "; the bigram table scores " + num(r.bigram_table, 3) + ". The loss at step 0 was " + num(r.loss_at_step_0, 3) + " (ln 65 = 4.174)."; },
          why: "The loss starts near $\\ln 65$, the loss of a uniform guess, and the first things a model picks up are the cheap statistics: which characters are frequent, then which follow which. Reaching the level of the bigram table means the model has caught up with counting pairs. Going below it requires context longer than one character, and that is what attention provides. Read the sample in the log: at this stage the text has word-like shapes and little else." },
        { id: "train", name: "The full run: 2,000 steps", set: {}, budget: 600, ref: "u07_char_transformer/default",
          q: "Now 2,000 steps: two to four minutes on a MacBook Air. The bigram table stands at 2.48 nats per character. Where does the validation loss end?",
          opts: ["Between 2.2 and 2.48", "Between 1.8 and 2.2", "Below 1.8"],
          judge: function (r) { var v = r.val_loss; return !isNum(v) ? null : v < 1.8 ? 2 : v < 2.2 ? 1 : 0; },
          happened: function (r) { return "Validation loss " + num(r.val_loss, 3) + " nats per character (" + num(r.bits_per_char, 2) + " bits), training loss " + num(r.train_loss, 3) + "; " + num(r.steps) + " steps in " + DL.secs(r.seconds) + " on " + r.device + "."; },
          why: "Around 1.6 nats the model has learned spelling, word boundaries and the layout of a play: speaker names, line breaks, punctuation. The sample at the end shows it. The training loss is below the validation loss, and the gap (about 0.2 nats in the reference run) is still widening. A little of it belongs to the text: the held-out last tenth is harder even for the bigram table, by 0.03 nats. The rest is the model fitting the text it trained on more closely than text it has not seen, which with 0.8 million parameters and one million characters is the beginning of overfitting (week 4, section 6). The end point barely depends on the seed: three seeds on a MacBook Air M5 ended at 1.576, 1.578 and 1.577. In bits, 1.58 nats is 2.27 bits per character: an arithmetic coder driven by this model would compress the text to under a third of its 8 bits per character (week 2)." },
        { id: "nopos", name: "Remove the position table", set: { positional: false }, budget: 600, ref: "u07_char_transformer/nopos",
          q: "Train the same model with no positional information at all. Compared with the full run, the validation loss…",
          opts: ["Falls back to about the bigram table: without order the model can only count", "Gets worse, but stays far below the bigram table", "Does not change measurably"],
          base: { preset: "train", ref: "u07_char_transformer/default", key: "val_loss" },
          judge: function (r, run) { var v = r.val_loss, b = r.bigram_table, base = run && run.base; return !isNum(v) || !isNum(b) || !isNum(base) ? null : v >= b - 0.2 ? 0 : v - base > 0.03 ? 1 : 2; },
          happened: function (r, run) { return "Validation loss " + num(r.val_loss, 3) + " without positions, against " + num(run && run.base, 3) + " with them (" + ((run && run.baseFrom) || "the reference run") + "); the bigram table scores " + num(r.bigram_table, 3) + "."; },
          why: "Without the mask this model could not know order at all (permutation equivariance, section 2). With the causal mask it can: position $i$ averages over exactly $i$ positions, so a head that attends uniformly produces a signal that depends on $i$, and deeper layers see what earlier layers computed from each prefix (third check question; Haviv et al. 2022). Having to discover position costs something, but not much: on a MacBook Air M5 the loss rose from 1.576 to 1.663 with seed 1 and from 1.578 to 1.644 with seed 2. Two pairs of runs fix the direction, not the size of the gap: change the seed and see how far it moves." }]
    }
  ];

  /* A place to try things: one per unit, no presets. The docstring is the API reference. */
  DL.SCRATCH = '"""Scratch: a place to try things.\n\nWrite run(lab). What the lab object gives you:\n    lab.p("name", default)        a parameter\n    lab.rng                       numpy random generator, seeded by the page\n    lab.torch, lab.device         PyTorch and the Apple GPU device (when PyTorch is installed)\n    lab.dataset("tinyshakespeare")   the text shipped with the page, as one string\n    lab.report(step, loss=...)    one point on the live curves\n    lab.log("text")               a line in the log\n    lab.result(name=value)        headline numbers\n    lab.table(title, columns, rows)     lab.plot(title, x, {name: y})      lab.text(title, string)\n    lab.scatter(title, {name: points})  lab.heatmap(title, z)              lab.images(title, imgs)\n    lab.regions(title, probs, extent, points, labels)\n    lab.time_left()               seconds left in the time budget\nThe script must not read or write files and must not download anything; the page shows only what you hand to lab.\n"""\nimport numpy as np\n\n\ndef run(lab):\n    rng = lab.rng\n    # fit y = 3x - 1 + noise by gradient descent on the mean squared error\n    x = rng.uniform(-1, 1, 200)\n    y = 3 * x - 1 + 0.2 * rng.normal(size=200)\n    w, b, lr = 0.0, 0.0, 0.1\n    for step in range(1, 201):\n        err = w * x + b - y\n        w -= lr * 2 * np.mean(err * x)\n        b -= lr * 2 * np.mean(err)\n        lab.report(step, loss=np.mean(err ** 2))\n    lab.scatter("Data and fitted line", {"data": np.stack([x, y], axis=1), "fit": np.stack([x, w * x + b], axis=1)}, xlabel="x", ylabel="y")\n    lab.result(w=w, b=b, loss=np.mean((w * x + b - y) ** 2))\n';
  function scratch(unit) {
    return { id: "scratch_" + unit, unit: unit, lib: "any", scratch: true, budget: 120, time: "", title: "Scratch: your own experiment",
      data: { kind: "simulated", text: "The starting script generates its own data. If you change it to use other data, say so in the script." },
      desc: "An empty bench. Edit the script in the Code tab, or describe what you want to try and let the tutor draft it. Curves, tables and pictures appear here as soon as the script hands them to `lab`.",
      params: [], chart: "auto", tiles: [], presets: [] };
  }
  DL.exp = function (id) {
    for (var i = 0; i < DL.EXPERIMENTS.length; i++) if (DL.EXPERIMENTS[i].id === id) return DL.EXPERIMENTS[i];
    var m = /^scratch_(u\d+)$/.exec(id); return m && DL.unit(m[1]) ? scratch(m[1]) : null;
  };
  DL.expsOf = function (unit) { return DL.EXPERIMENTS.filter(function (e) { return e.unit === unit; }).concat([scratch(unit)]); };
  DL.scriptOf = function (id) { return /^scratch_/.test(id) ? DL.SCRATCH : (DL.SCRIPTS && DL.SCRIPTS[id]) || ""; };
})();
