// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The course map. Source: the public course page, schedule and project list of
 *   Tony Feng, Math 270 "A Survey of Deep Learning for Mathematicians", UC Berkeley, Fall 2025
 *   https://math.berkeley.edu/~fengt/2025F_270.html  (read 2026-11-10)
 * Topics are the schedule's topic lists; papers are the ones the project list assigns. Nothing from the lecture notes,
 * slides or notebooks is reproduced here: the page links to them.
 * status "full" = this lab has written notes and experiments for the week; "planned" = syllabus, sources and the tutor only. */
(function () {
  "use strict";
  var F = "https://math.berkeley.edu/~fengt/";
  var ax = function (id) { return "https://arxiv.org/abs/" + id; };
  DL.COURSE = {
    title: "A Survey of Deep Learning for Mathematicians",
    code: "Math 270", who: "Tony Feng", where: "UC Berkeley, Fall 2025",
    page: F + "2025F_270.html", notes: F + "2025F_270_notes.pdf", schedule: F + "2025F_270_Schedule.pdf", projects: F + "2025F_270_Projects.pdf",
    general: [
      { t: "Bishop and Bishop, Deep Learning: Foundations and Concepts (2024)", u: "https://www.bishopbook.com/" },
      { t: "Kaplan, Notes on Contemporary Machine Learning for Physicists" },
      { t: "Distill", u: "https://distill.pub/" },
      { t: "colah's blog", u: "https://colah.github.io/" },
      { t: "Hastie, Tibshirani, Friedman, The Elements of Statistical Learning" },
      { t: "MacKay, Information Theory, Inference, and Learning Algorithms" }
    ],
    parts: [
      { id: "p1", name: "Part 1 · Background", units: ["u1", "u2", "u3", "u4"] },
      { id: "p2", name: "Part 2 · Architectures", units: ["u5", "u6", "u7"] },
      { id: "p3", name: "Part 3 · Generative models", units: ["u8", "u9", "u10"] },
      { id: "p4", name: "Part 4 · Reinforcement learning", units: ["u12", "u13"] }
    ],
    units: [
      { id: "u1", week: 1, date: "Sep 8", title: "Introduction to neural networks", status: "full", sec: "§1",
        blurb: "What it means to learn from data, why a network of ReLUs can fit anything, and how one backward pass yields every derivative.",
        topics: ["Supervised learning: regression and classification", "Neural networks: activation functions", "Loss functions", "Gradient descent", "Backpropagation"],
        refs: [{ t: "Bishop and Bishop, chapters 1 and 4–8" }] },
      { id: "u2", week: 2, date: "Sep 15", title: "Information theory", status: "planned", sec: "§2",
        blurb: "Entropy as the length of the best code, and why a good compressor and a good generative model are the same object.",
        topics: ["Shannon information and entropy", "Conditional entropy and mutual information", "KL divergence and Gibbs' inequality", "Compression and arithmetic coding", "Relation to generative modeling"],
        refs: [{ t: "MacKay, chapters 1–6" }],
        asks: ["Why is $-\\log p$ the right measure of information? State the characterization and sketch the proof.", "Prove Gibbs' inequality and explain what KL divergence measures that is not symmetric.", "How does arithmetic coding turn a next-symbol predictor into a compressor, and what does that say about language models?"],
        task: "No Colab task this week. A natural experiment: estimate the entropy rate of Tiny Shakespeare with n-gram tables and compare with a neural model's loss." },
      { id: "u3", week: 3, date: "Sep 22", title: "Statistical inference", status: "planned", sec: "§3",
        blurb: "Where loss functions come from: maximum likelihood gives cross-entropy and squared error, a prior gives weight decay.",
        topics: ["Central Limit Theorem", "Estimators and maximum likelihood", "Cross-entropy as likelihood", "Bayesian inference", "Evaluating estimators: MSE and MAE"],
        refs: [{ t: "Casella and Berger, Statistical Inference, chapter 7" }],
        asks: ["Show that minimizing cross-entropy is maximum likelihood, and that least squares is maximum likelihood under Gaussian noise.", "Why does a Gaussian prior on the weights give $L^2$ weight decay and a Laplace prior give $L^1$?", "Decompose the mean squared error of an estimator into bias and variance and give an example where a biased estimator wins."],
        task: "No Colab task this week. A natural experiment: simulate the sampling distribution of two variance estimators and compare their mean squared errors." },
      { id: "u4", week: 4, date: "Sep 29", title: "Optimization", status: "full", sec: "§4 and §5.4",
        blurb: "Why plain gradient descent is slow, what momentum and Adam change, why initialization needs a factor of 2, and how small input changes fool a model.",
        topics: ["Optimizers: momentum, RMSProp, Adam", "Normalization: Kaiming initialization, batch normalization, layer normalization", "Regularization: weight decay, dropout", "Adversarial attacks"],
        refs: [{ t: "Bishop and Bishop, chapter 9" }, { t: "Kaplan, section 4" }] },
      { id: "u5", week: 5, date: "Oct 6", title: "Convolutional neural networks", status: "planned", sec: "§5",
        blurb: "Building locality and translation symmetry into the architecture, and what depth and residual connections bought on ImageNet.",
        topics: ["Inductive bias: locality, equivariance and invariance", "CNN architecture: filters, feature maps, pooling", "Case study: the ImageNet challenge, AlexNet, VGGNet, ResNet, residual learning, interpretability"],
        refs: [{ t: "Bishop and Bishop, chapter 10" }],
        slides: F + "MATH_270_CNN.pdf", colab: [{ t: "Colab tutorial", u: "https://colab.research.google.com/drive/19Q2JKs_wab38xbEGhgEnVE_p6fH038gF?usp=sharing" }],
        papers: [
          { t: "Krizhevsky, Sutskever, Hinton, ImageNet classification with deep convolutional neural networks (2012; Communications of the ACM 2017)", u: "https://doi.org/10.1145/3065386" },
          { t: "Simonyan and Zisserman, Very deep convolutional networks for large-scale image recognition (2014)", u: ax("1409.1556") },
          { t: "He, Zhang, Ren, Sun, Deep residual learning for image recognition (2015)", u: ax("1512.03385") }],
        asks: ["In what precise sense is a convolutional layer the most general linear map that commutes with translations?", "Why can a residual block learn the identity more easily than a plain block, and what did that change for depth?", "Count the parameters of a $3\\times3$ convolution with $c$ input and $c'$ output channels and compare with a dense layer on a $224\\times224\\times3$ image."],
        task: "The course's Colab task: train a miniature VGG-style CNN on MNIST for classification, then add residual skip connections; plot and discuss." },
      { id: "u6", week: 6, date: "Oct 13", title: "Recurrent neural networks", status: "planned", sec: "§6",
        blurb: "Sequences of any length through one shared map, why gradients vanish through time, and how to sample from a model.",
        topics: ["RNN architecture: hidden states, unrolling, memory", "Representation learning", "Encoder–decoder structure", "Sampling: greedy, beam search, temperature", "Case study: classification and machine translation"],
        refs: [{ t: "Karpathy, The Unreasonable Effectiveness of Recurrent Neural Networks (2015)", u: "https://karpathy.github.io/2015/05/21/rnn-effectiveness/" }],
        slides: F + "MATH_270_RNN.pdf", colab: [{ t: "Colab tutorial", u: "https://colab.research.google.com/drive/1cyXsLPScVMjsqkor0W5bd8JyOV3RxGC4?usp=sharing" }],
        papers: [
          { t: "Cho et al., Learning phrase representations using RNN encoder–decoder for statistical machine translation (2014)", u: ax("1406.1078") },
          { t: "Sutskever, Vinyals, Le, Sequence to sequence learning with neural networks (2014)", u: ax("1409.3215") },
          { t: "Bahdanau, Cho, Bengio, Neural machine translation by jointly learning to align and translate (2015)", u: ax("1409.0473") }],
        asks: ["Write the gradient of a loss at time $t$ with respect to the recurrent weights and show where the product of $t-s$ Jacobians comes from.", "Why does the additive cell update of an LSTM help gradients survive?", "What do temperature, beam search and nucleus sampling each optimize?"],
        task: "The course's Colab task: train a shallow RNN to predict tomorrow's temperature high from the previous 14 days (historical San Francisco weather); plot and discuss." },
      { id: "u7", week: 7, date: "Oct 20", title: "Transformers", status: "full", sec: "§7",
        blurb: "Attention as a soft lookup, the symmetries it has and the ones it lacks, and a small transformer trained on Shakespeare on your Mac.",
        topics: ["Attention mechanism", "Transformers", "Case studies: BERT, Vision Transformers, Transformer-XL"],
        refs: [{ t: "Vaswani et al., Attention is all you need (2017)", u: ax("1706.03762") }, { t: "Harvard NLP, The Annotated Transformer", u: "https://nlp.seas.harvard.edu/annotated-transformer/" }, { t: "Bishop and Bishop, chapter 12" }],
        slides: F + "MATH_270_Transformers.pdf", colab: [{ t: "Colab tutorial", u: "https://colab.research.google.com/drive/1AEbajLQtSz6bXtsaZOuDqxDZrz_Hb_8N?usp=sharing", who: ": the course page lists it under week 8, as joint with this week's presenters" }],
        papers: [
          { t: "Devlin, Chang, Lee, Toutanova, BERT: Pre-training of deep bidirectional transformers for language understanding (2019)", u: ax("1810.04805") },
          { t: "Dosovitskiy et al., An image is worth 16x16 words: Transformers for image recognition at scale (2021)", u: ax("2010.11929") },
          { t: "Dai et al., Transformer-XL: Attentive language models beyond a fixed-length context (2019)", u: ax("1901.02860") }],
        task: "The course's Colab task: train a decoder-only transformer on an NLP dataset such as tinyshakespeare to generate text; display and analyze its performance. This lab's second experiment is that task." },
      { id: "u8", week: 8, date: "Oct 27", title: "Large language models", status: "planned", sec: "§8",
        blurb: "Pretrain on next-token prediction, then adapt: the GPT line, what the data pipeline does, and how loss scales with parameters, data and compute.",
        topics: ["Decoder-only architecture", "Generative pretraining and supervised fine-tuning", "Data mixture, filtering and deduplication", "Chinchilla scaling laws", "Case studies: GPT-1, GPT-2, GPT-3, the Llama models"],
        refs: [],
        slides: F + "MATH_270_LLM.pdf", colab: [{ t: "Colab tutorial", u: "https://colab.research.google.com/drive/1AEbajLQtSz6bXtsaZOuDqxDZrz_Hb_8N?usp=sharing", who: " by the same students, jointly with the presenters of week 7" }],
        papers: [
          { t: "Radford et al., Improving language understanding by generative pre-training (OpenAI, 2018)" },
          { t: "Radford et al., Language models are unsupervised multitask learners (OpenAI, 2019)" },
          { t: "Brown et al., Language models are few-shot learners (2020)", u: ax("2005.14165") },
          { t: "Kaplan et al., Scaling laws for neural language models (2020)", u: ax("2001.08361") },
          { t: "Hoffmann et al., Training compute-optimal large language models (2022)", u: ax("2203.15556") },
          { t: "Pearce and Song, Reconciling Kaplan and Chinchilla scaling laws (2024)", u: ax("2406.12907") },
          { t: "Porian et al., Resolving discrepancies in compute-optimal scaling of language models (2024)", u: ax("2406.19146") },
          { t: "Touvron et al., LLaMA: Open and efficient foundation language models (2023)", u: ax("2302.13971") },
          { t: "Touvron et al., Llama 2: Open foundation and fine-tuned chat models (2023)", u: ax("2307.09288") },
          { t: "Llama team, The Llama 3 herd of models (2024)", u: ax("2407.21783") }],
        asks: ["State the parametric fit $L(N,D)=E+A/N^{\\alpha}+B/D^{\\beta}$ and derive the compute-optimal split between parameters and data from $C\\approx 6ND$.", "Where do the Kaplan et al. and Chinchilla conclusions disagree, and what explanations have been proposed?", "What does byte-pair encoding do, step by step, and why not train on characters or words?"],
        task: "This week has no Colab task. A natural experiment on your Mac: train the week 7 transformer at three sizes and three data fractions and fit the loss surface." },
      { id: "u9", week: 9, date: "Nov 3", title: "GANs and variational autoencoders", status: "planned", sec: "§9 and §10",
        blurb: "Two ways to learn a distribution you can sample from: a game between two networks, and a lower bound on the likelihood.",
        topics: ["Generative adversarial networks", "Variational autoencoders", "Evidence lower bound", "Reparametrization trick", "Case study: image generation, CycleGAN, β-VAE"],
        refs: [{ t: "Bishop and Bishop, chapters 17 and 19" }],
        slides: F + "MATH_270_GAN_and_VAE.pdf", colab: [{ t: "GAN Colab tutorial", u: "https://colab.research.google.com/drive/17JJpd99v5UpdARJJVCXk4XSLjDkUhr4W?usp=sharing" }, { t: "VAE Colab tutorial", u: "https://colab.research.google.com/drive/1NxtwX2HMezBvIoi8Bj7B4Koi5k19MoQr?usp=sharing" }],
        papers: [
          { t: "Radford, Metz, Chintala, Unsupervised representation learning with deep convolutional generative adversarial networks (2016)", u: ax("1511.06434") },
          { t: "Zhu, Park, Isola, Efros, Unpaired image-to-image translation using cycle-consistent adversarial networks (2017)", u: ax("1703.10593") },
          { t: "Higgins et al., β-VAE: Learning basic visual concepts with a constrained variational framework (ICLR 2017)" },
          { t: "Goodfellow et al., Generative adversarial nets (2014)", u: ax("1406.2661") },
          { t: "Kingma and Welling, Auto-encoding variational Bayes (2014)", u: ax("1312.6114") }],
        asks: ["Derive the evidence lower bound and identify the gap as a KL divergence.", "For a fixed generator, what is the optimal discriminator, and which divergence does the generator then minimize?", "Why does the reparametrization trick give a lower-variance gradient than the score-function estimator?"],
        task: "The course's Colab task: train a GAN and a VAE on the Generative Dog Images dataset. On a laptop, a two-dimensional mixture of Gaussians shows the same ideas (including mode collapse) in seconds." },
      { id: "u10", week: 10, date: "Nov 10", title: "Diffusion models", status: "planned", sec: "§11",
        blurb: "Destroy data with noise in small steps, learn to undo one step, and read the training loss as another evidence lower bound.",
        topics: ["Diffusion models", "The evidence lower bound again", "Case study: more image generation, Stable Diffusion"],
        refs: [{ t: "Bishop and Bishop, chapters 19 and 20" }],
        slides: F + "MATH_270_DIFFUSION.pdf", colab: [{ t: "Colab tutorial", u: "https://colab.research.google.com/drive/1OasfBSxtccvD2YwQIBAx2IMSN-H8uzwM?usp=sharing" }],
        papers: [
          { t: "Sohl-Dickstein et al., Deep unsupervised learning using nonequilibrium thermodynamics (2015)", u: ax("1503.03585") },
          { t: "Ho, Jain, Abbeel, Denoising diffusion probabilistic models (2020)", u: ax("2006.11239") },
          { t: "Rombach et al., High-resolution image synthesis with latent diffusion models (2022)", u: ax("2112.10752") }],
        asks: ["Derive the closed form of $q(x_t\\mid x_0)$ for the Gaussian forward process and the posterior $q(x_{t-1}\\mid x_t,x_0)$.", "Show how the evidence lower bound reduces to predicting the noise, and what the simplified loss drops.", "In what sense is a diffusion model a hierarchical VAE with a fixed encoder?"],
        task: "The course's Colab task: train a diffusion model on the Generative Dog Images dataset. On a laptop, a diffusion model on a two-dimensional point cloud trains in under a minute and shows every step." },
      { id: "u12", week: 12, date: "Nov 24", title: "Reinforcement learning I: value functions", status: "planned", sec: "§12 and §13",
        blurb: "Learning from delayed reward: Markov decision processes, Bellman's fixed-point equations, and learning values from experience.",
        topics: ["Markov decision processes", "Prediction and control", "Monte Carlo methods and temporal-difference learning", "SARSA and value function approximation", "Case study: Atari, AlphaGo, AlphaZero"],
        refs: [{ t: "Sutton and Barto, Reinforcement Learning: An Introduction, chapters 3–5", u: "http://incompleteideas.net/book/the-book-2nd.html" }, { t: "David Silver's lecture course on reinforcement learning (video)" }],
        slides: F + "MATH_270_MCRL.pdf", colab: [{ t: "Colab tutorial", u: "https://colab.research.google.com/drive/1jgTpob_3XUeQYnA377mYA-QTSpRLOzlV?usp=sharing" }],
        papers: [
          { t: "Mnih et al., Playing Atari with deep reinforcement learning (2013)", u: ax("1312.5602") },
          { t: "Silver et al., Mastering the game of Go with deep neural networks and tree search (Nature, 2016)", u: "https://doi.org/10.1038/nature16961" },
          { t: "Silver et al., Mastering chess and shogi by self-play with a general reinforcement learning algorithm (2017)", u: ax("1712.01815") }],
        asks: ["Prove that the Bellman optimality operator is a $\\gamma$-contraction in the sup norm and say what follows.", "Compare Monte Carlo and temporal-difference estimates of a value function: bias, variance, and what each needs to know.", "What is the 'deadly triad', and why does Q-learning with function approximation have no convergence guarantee?"],
        task: "The course's Colab task: Monte Carlo value optimization for Blackjack (no neural network needed). The game is simulated, so it runs here without any data." },
      { id: "u13", week: 13, date: "Dec 1", title: "Reinforcement learning II: policy optimization", status: "planned", sec: "§14",
        blurb: "Differentiate the expected return directly: policy gradients, baselines, and the clipped objective behind PPO.",
        topics: ["Policy gradients", "Proximal policy optimization", "Case study: reasoning models (DeepSeek-R1, AlphaGeometry, AlphaCode)"],
        refs: [{ t: "Schulman et al., Proximal policy optimization algorithms (2017)", u: ax("1707.06347") }, { t: "Denny Zhou's talk on reasoning in large language models (video and slides)" }],
        slides: F + "MATH_270_RLII.PDF", colab: [{ t: "Colab tutorial", u: "https://colab.research.google.com/drive/1O77m33aok0MzloMLYa2i4R_K-lpQ9Dme?usp=sharing" }],
        papers: [
          { t: "Li et al., Competition-level code generation with AlphaCode (2022)", u: ax("2203.07814") },
          { t: "Trinh et al., Solving olympiad geometry without human demonstrations (Nature, 2024)", u: "https://doi.org/10.1038/s41586-023-06747-5" },
          { t: "Chervonyi et al., Gold-medalist performance in solving olympiad geometry with AlphaGeometry2 (2025)", u: ax("2502.03544") },
          { t: "DeepSeek-AI, DeepSeek-R1: Incentivizing reasoning capability in LLMs via reinforcement learning (2025)", u: ax("2501.12948") }],
        asks: ["Derive the policy gradient theorem with the log-derivative trick and show that subtracting a baseline keeps it unbiased.", "State the performance difference lemma and explain how PPO's clipped objective approximates a trust region.", "Why is a stochastic policy necessary in rock–paper–scissors, and what does that say about value-based methods?"],
        task: "The course's Colab task: PPO for Blackjack. The game is simulated, so it runs here without any data." }
    ]
  };
  DL.unit = function (id) { for (var i = 0; i < DL.COURSE.units.length; i++) if (DL.COURSE.units[i].id === id) return DL.COURSE.units[i]; return null; };
  DL.partOf = function (id) { for (var i = 0; i < DL.COURSE.parts.length; i++) if (DL.COURSE.parts[i].units.indexOf(id) >= 0) return DL.COURSE.parts[i]; return null; };
})();
