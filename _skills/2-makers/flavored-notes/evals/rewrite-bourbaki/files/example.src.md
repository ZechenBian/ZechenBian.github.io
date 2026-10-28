---
title: "The Snake Lemma"
subtitle: "A two-page example of the note source format"
author: "Notes"
date: "2026"
abstract: |
  We state and prove the snake lemma for modules over a ring and derive the
  long exact sequence attached to a short exact sequence of complexes.
---

\newcommand{\coker}{\operatorname{coker}}
\newcommand{\im}{\operatorname{im}}

# Setup {#sec:setup}

Throughout, $R$ is a ring and all modules are left $R$-modules.

::: {.definition #def:exact}
A sequence $A \xrightarrow{f} B \xrightarrow{g} C$ is *exact at $B$* if
$\im f = \ker g$.
:::

::: {.remark .unnumbered}
Everything below holds verbatim in any abelian category, by the
Freyd–Mitchell embedding theorem, or by a direct element-free proof.
:::

# The lemma {#sec:lemma}

::: {.theorem #thm:snake title="Snake lemma"}
Suppose the rows of the commutative diagram
$$
\begin{CD}
@. A @>f>> B @>g>> C @>>> 0\\
@. @VaVV @VbVV @VcVV \\
0 @>>> A' @>f'>> B' @>g'>> C'
\end{CD}
\label{eq:diagram}
$$
are exact. Then there is an exact sequence
$$
\ker a \to \ker b \to \ker c \xrightarrow{\ \delta\ } \coker a \to \coker b \to \coker c .
\label{eq:snake}
$$
:::

::: proof
We construct $\delta$; exactness at each spot is a similar chase. Let
$z \in \ker c$. Since $g$ is onto, pick $y \in B$ with $g(y) = z$. Then
$g'(b(y)) = c(g(y)) = 0$, so $b(y) = f'(x')$ for a unique $x' \in A'$
(uniqueness because $f'$ is injective). Set $\delta(z) = [x'] \in \coker a$.
If $y$ is replaced by $y + f(x)$, then $x'$ changes by $a(x)$, so $[x']$ is
well defined.
:::

::: {.corollary #cor:les}
A short exact sequence of chain complexes $0 \to A_\bullet \to B_\bullet \to C_\bullet \to 0$
induces a long exact sequence in homology.
:::

::: {.proof title="Proof sketch"}
Apply @thm:snake to a diagram of shape @eq:diagram with rows
$A_n/\im d \to B_n/\im d \to C_n/\im d \to 0$ and
$0 \to \ker d_{n-1} \to \cdots$; the kernels and cokernels of the vertical maps
are $H_n$ and $H_{n-1}$, and @eq:snake becomes the connecting segment.
:::

::: {.exercise name="Important Exercise" #exr:nat}
Let $\delta$ be as in @thm:snake.

(a) Show that $\delta$ is natural in the diagram @eq:diagram.

(b) Deduce from (a) that the long exact sequence of @cor:les is natural.
:::

A diagram that only the PDF can draw:

```{=latex}
\[
\begin{tikzcd}
\ker c \arrow[r, dashed, "\delta"] & \coker a
\end{tikzcd}
\]
```

See @sec:setup for conventions.
