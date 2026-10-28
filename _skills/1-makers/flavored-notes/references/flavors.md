# Flavors: dimensions and presets

A flavor is a bundle of decisions. This file lists the dimensions a flavor
fixes, then presets for well-known authors, schools and genres. Use a preset
as a starting point, adjust it to the request, and write the result as the
flavor card (format in SKILL.md).

Contents
1. The dimensions
2. The rigor dial (R0–R4)
3. Presets: mathematics
4. Presets: physics
5. Presets: genres and formats
6. Composing, mixing and reading flavors from a sample

---

## 1. The dimensions

| Dimension | The question it answers | Typical values |
|---|---|---|
| Voice | Who is talking, to whom? | impersonal "we"; conversational "you"; lecturer; letter to a colleague |
| Audience | What may be assumed? | advanced undergrad; first-year grad; expert in a neighbouring field; specialist |
| Purpose | What should the reader be able to do afterwards? | prove it; use it; explain it; pass an exam; start research |
| Rigor | What counts as an argument? | R0–R4, below |
| Architecture | In what order do things appear? | definition-first; example-first; problem-first; historical; general-to-special |
| Proof style | How are proofs written? | terse complete; conceptual; computational; picture-driven; left as exercises |
| Examples | How many, what kind, where? | none; a few decisive ones; many small ones; one running example |
| Exercises | Are there any, and what job do they do? | none; inline; end-of-section; carry part of the theory |
| Motivation | How much "why", and where? | none; one paragraph per section; pervasive |
| Notation | Which conventions? | categorical vs classical; index-free vs indices; units and signs (physics) |
| Density | Words per idea | telegraphic; standard; expansive |
| Signature moves | 2–4 concrete devices that make the flavor recognisable | see presets |
| Avoid | What would break the flavor | see presets |

## 2. The rigor dial

Pick one level for the note as a whole, then say which results are exceptions.

- **R0 — heuristic.** Arguments are pictures, estimates, analogies. No claim
  is presented as proved; label heuristic arguments as such.
- **R1 — physicist's rigor.** Formal manipulations are allowed (exchanging
  limits, path integrals, delta functions), but the assumptions they rest on
  are stated once, and anything that is actually a conjecture or false in
  general is flagged.
- **R2 — lecture-note rigor.** Key theorems get complete proofs; routine
  lemmas get sketches or become exercises; nothing is claimed that is not
  true as stated.
- **R3 — textbook-complete.** Every claim is proved in the note or cited to
  a precise statement in a verified reference.
- **R4 — formalization-ready.** All hypotheses explicit, every step
  justified, no "clearly", conventions pinned down (as if preparing for Lean).

Whatever the level, statements are exact: R0 changes how much is argued, not
whether the statement is true.

---

## 3. Presets: mathematics

Each preset describes the *decisions* in the author's expository work, not
catch-phrases. Default rigor is in brackets.

### Serre  [R3]
- Read as: terse, exact, elementary, and complete in few pages (e.g. *A
  Course in Arithmetic*, *Linear Representations of Finite Groups*).
- Architecture: short numbered sections (1.1, 1.2, …), each one idea;
  statements come with exactly the hypotheses needed; motivation is the
  ordering itself, not prose.
- Proofs: short and complete; choose the slickest elementary route; reuse
  earlier results by number.
- Examples: few, chosen to be decisive; often a single computation.
- Exercises: a handful at the end of a section, some extending the theory,
  hints in parentheses.
- Moves: one-line remarks pointing to the general case or a reference; a
  table or explicit formula where it settles things (character tables, small
  cases).
- Avoid: chatty motivation, rhetorical questions, adjectives ("beautiful",
  "powerful"), long historical asides.

### Bourbaki  [R3–R4]
- Read as: maximal generality first, strictly linear logical order.
- Architecture: structures defined in full generality before any instance;
  every term defined before use; internal cross-references everywhere.
- Proofs: complete, impersonal, no appeal to pictures or intuition.
- Examples: only after the general theory, as specialisations.
- Exercises: at the end, numerous, sometimes deep.
- Moves: a closing *historical note* (verified history only); systematic
  "Let … be …" set-ups; generality over special tricks.
- Avoid: examples before definitions, diagrams used as arguments, informal
  language.

### Grothendieck  [R3]
- Read as: the "rising sea": build the right general framework until the
  theorem becomes nearly formal.
- Architecture: start from the objects and functors that should exist;
  work relative to a base (properties of morphisms, not of spaces); define
  things by what they represent.
- Proofs: reduce to general statements about functors, adjunctions,
  descent; avoid coordinate computations.
- Examples: sparse, used to check that definitions behave.
- Moves: "the relative point of view"; universal properties as definitions;
  explaining a "yoga" (a web of expected properties) before proving it.
- Avoid: clever ad hoc tricks; proofs that work only in a special case when a
  general one is within reach.

### Atiyah  [R2]
- Read as: geometric insight and connections between fields, in readable
  prose.
- Architecture: big picture first, then the key example, then the theorem.
- Proofs: the idea of the proof foregrounded; technical steps compressed or
  referenced.
- Moves: linking the result to other areas (topology ↔ analysis ↔ physics);
  saying what the theorem *means*.
- Avoid: formal overload; long computations without commentary.

### Milnor  [R3]
- Read as: short, complete, elementary (*Topology from the Differentiable
  Viewpoint*, *Morse Theory*).
- Architecture: a direct line to one main theorem; nothing extra.
- Proofs: complete, using minimal machinery; a figure where it carries the
  argument.
- Examples: well-chosen classical ones (spheres, projective spaces, Lie
  groups).
- Avoid: generality for its own sake; digressions.

### Arnold  [R1–R2]
- Read as: anti-formalist; start from a concrete phenomenon or problem and
  let the theory grow out of it.
- Architecture: problem → picture → phenomenon → theorem; definitions come
  late and are motivated by the example that forced them.
- Proofs: geometric, often via a picture or a mechanical model.
- Moves: physical or mechanical motivation; problems inserted in the text;
  pointed remarks about which formulation is natural.
- Avoid: axiomatic introductions; definitions without examples.

### Tao (blog / lecture notes)  [R2–R3]
- Read as: motivation and heuristics first, then a careful rigorous proof.
- Architecture: the problem, why naive approaches fail, the key idea in a
  toy model, then the general argument.
- Proofs: rigorous, with the "epsilon management" visible; standard
  asymptotic notation ($X \lesssim Y$, $X = O(Y)$) declared once.
- Moves: "heuristic" remarks that explain the shape of an argument; exercises
  embedded in the text; explicit discussion of what changes if a hypothesis
  is dropped.
- Avoid: presenting the final proof without the reasoning that leads to it.

### Vakil (*The Rising Sea*)  [R2–R3]
- Read as: conversational, playful, exercise-driven algebraic geometry.
- Architecture: short sections with signposts ("skip this on a first
  reading"); many results proved *by the reader*.
- Proofs: often an exercise with enough scaffolding to do it; "important
  exercises" flagged.
- Moves: toy examples and pictures of schemes; warnings about the standard
  pitfalls; honest remarks about what is hard.
- Avoid: stiffness; long proofs the reader could do.
- Source tip: `::: {.exercise name="Important Exercise"}`.

### Lurie  [R3–R4]
- Read as: model-independent higher category theory, complete to the last
  detail (*HTT*, *HA*).
- Architecture: deep numbering (Definition 2.1.3); Notation, Construction,
  Warning, Variant blocks; every claim proved or precisely referenced.
- Proofs: reduce to earlier results by number; homotopy coherence handled
  explicitly rather than waved at.
- Moves: "Warning" blocks for traps; "Remark" blocks for alternative
  formulations; explicit statement of which ∞-categorical model is used, or
  that none is needed.
- Avoid: hand-waving coherence; ambiguous "the" for objects defined up to
  contractible choice without saying so.

### Hartshorne / standard graduate textbook  [R3]
- Definition → theorem → proof → example; exercises at the end of each
  section carry significant content; terse prose.

### nLab  [R2]
- Structure fixed: **Idea**, **Definition** (often several equivalent ones),
  **Properties**, **Examples**, **Related concepts**, **References**.
- Higher-categorical viewpoint by default; definitions stated at the level
  of generality where they are cleanest.
- Avoid: long proofs inline (link to them or sketch).

### Thurston  [R1–R2]
- Understanding over formal proof: mental pictures, several ways of seeing
  the same object, informal language that is still precise about what is
  claimed.
- Avoid: formalism that hides the geometry.

---

## 4. Presets: physics

Physics notes always start with a conventions block: units (and which
constants are set to 1), metric signature, Fourier and normalisation
conventions, index placement, sign of the action/Hamiltonian.

### Feynman (*Lectures on Physics*)  [R0–R1]
- Read as: conversational, phenomenon-first, intuition before formalism.
- Architecture: an experiment or everyday phenomenon → what we want to know
  → the simplest model → the law → consequences and limits.
- Derivations: physical arguments, several derivations of the same result,
  order-of-magnitude estimates, honesty about what is not understood.
- Moves: second person ("you"), analogies, "what's really going on here?",
  checking a formula against a case you already know.
- Avoid: axiomatic starts; formalism without physical meaning.

### Landau–Lifshitz  [R1]
- Read as: terse, everything from first principles (least action, symmetry),
  dense derivations, problems with solutions after each section.
- Architecture: numbered § sections; equations numbered (§.n).
- Moves: derive the law from symmetry and the variational principle;
  problems at the section end with worked solutions.
- Avoid: history, motivation in prose, padding. Keep the density, but every
  step described as easy must actually be easy; supply the non-obvious steps.

### Dirac (*Principles of Quantum Mechanics*)  [R1]
- Read as: elegant general principles, sparse words, notation that does
  the work (bra–ket).
- Moves: introduce a notation and let it carry the argument; physical
  interpretation of every formal step.
- Avoid: special cases before the general principle.

### Weinberg (*The Quantum Theory of Fields*)  [R1–R2]
- Read as: from principles (Lorentz invariance, cluster decomposition,
  unitarity) to formalism; careful and complete derivations.
- Moves: a historically informed introduction (verified facts only); long
  but fully explicit derivations; footnotes with references.
- Avoid: shortcuts that hide which principle is being used.

### Witten (math-physics exposition)  [R1, with theorem/conjecture labelling]
- Read as: physics as an engine for mathematical statements.
- Architecture: the mathematical statement; the physical system; why the
  physics predicts it (path integral, supersymmetry, duality); what has been
  proved.
- Moves: "a physicist would argue …" followed by what the mathematician can
  check; clear separation of theorem, conjecture and heuristic.
- Avoid: presenting physical heuristics as proofs.

### Misner–Thorne–Wheeler (*Gravitation*)  [R1–R2]
- Two tracks (mark Track 2 sections as optional); boxes for side topics
  (`::: {.box name="Box"}`); coordinate-free geometric language first,
  components second; exercises.

### Tong (Cambridge lecture notes)  [R1–R2]
- Modern, clear, efficient lecture prose; derivations complete; worked
  physical examples; occasional light historical aside.
- Moves: "Let's see how this works in an example"; summaries of what was
  derived.

### Zee / Coleman (lecture style)  [R0–R1]
- Breezy and conceptual; the idea over the calculation; humour in moderation.
- Avoid: wit replacing content.

---

## 5. Presets: genres and formats

### Qualifying-exam / exam prep
- Precise definitions and statements; standard proofs reduced to the key
  steps; typical exam problems with solutions; pitfalls; a closing "what to
  be able to do" list. Rigor R2.

### Seminar handout (1–2 pages)
- Setup and notation; main theorem stated precisely; idea of proof in a
  paragraph or two; one example; references. Dense.

### Letter or memo to a colleague
- Expert audience; the question, what is known, the idea, where it might
  fail. First person. In the spirit of the Grothendieck–Serre correspondence,
  but do not imitate real letters.

### Problem set with solutions
- Problems graded in difficulty; solutions as `::: solution` blocks;
  each solution complete at the stated rigor.

### Cheat sheet / formula sheet
- Tables of formulas with hypotheses and conventions; no proofs; every
  formula checked.

### Socratic dialogue (Lakatos, *Proofs and Refutations*)
- Teacher and named students; a conjecture, a proof, counterexamples, and
  refinement of the definitions. The mathematics must still converge to a
  correct final statement.

### Historical–genetic
- Ideas in the order they arose, with the problems that forced each
  definition. Every historical claim (who, when, what) is verified or left
  out.

### Séminaire Bourbaki exposé
- Survey of a recent result for non-specialist experts: context, statement,
  ideas of the proof, open problems, thorough references (verified).

### Colloquium write-up
- For a general mathematical audience: one main idea, examples, no heavy
  prerequisites, statements still exact.

---

## 6. Composing, mixing and reading flavors from a sample

**Mixing** ("Feynman explaining étale cohomology", "Serre-style notes on
the Ising model"): the topic fixes the content; the author fixes the voice,
architecture and proof style. Where they conflict, decide explicitly on the
card. Example: Feynman's dislike of formalism vs. the definitions étale
cohomology needs → keep every definition exact, but introduce each one by the
question it answers.

**Adjectives** ("elegant", "intuitive", "rigorous", "fun"): translate into
dimensions. "Elegant" → short complete proofs, few but decisive examples,
conceptual over computational. "Intuitive" → example-first, pictures,
heuristic remarks before proofs. "Rigorous" → R3–R4. "Fun" → problem-first,
surprising examples, conversational voice.

**From a sample** (the user's own notes, a paper, a PDF): derive the card
from the sample itself: section length; ratio of prose to displayed math;
how results are introduced; how long proofs are and what they skip; how
often examples appear and where; first person or impersonal; notation
habits; exercise placement. Imitate those decisions, never the text.

**Real authors.** Write fresh prose. Never quote or paraphrase passages
from the author's books, never invent quotations, and never present the
note as written by them. A subtitle like "in the style of …" only if the
user wants one.

**Pastiche check.** A flavor shows in what is included, in what order, and
how proofs go. One recognisable phrase per note is plenty; a note full of
catch-phrases reads as parody.

© 2026 Zechen Bian · All rights reserved / 保留所有权利
