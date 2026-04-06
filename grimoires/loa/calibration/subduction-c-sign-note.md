# Subduction Omori c Parameter — Sign Correction Note

**Date**: 2026-04-06
**Status**: Resolved for now — no subduction c refit sprint justified from current evidence
**Triggered by**: Run 6 diagnostic report recommended "reduce c from 0.05" to address early-time over-prediction in 2/3 subduction sequences. This note corrects the direction of that recommendation.

---

## The correction

The Run 6 diagnostic report suggested reducing `c` to fix early-time over-prediction in the subduction regime. That directional suggestion is wrong.

### TREMOR's Omori form

```
n(t) = K / (t + c)^p
```

Integrated count over window [0, T] for p ≠ 1:

```
N(T) = K / (1 - p) * [(T + c)^(1-p) - c^(1-p)]
```

### Sign proof

The derivative of N(T) with respect to c:

```
dN(T)/dc = K * [(T + c)^(-p) - c^(-p)]
```

Since `T + c > c` and `p > 0`:

```
(T + c)^(-p) < c^(-p)
```

Therefore:

```
dN(T)/dc < 0
```

**Increasing c decreases cumulative expected count over any finite window [0, T].
Decreasing c increases it.**

### What this means for the diagnosis

With `p > 1`, lowering `c` makes the Omori curve more front-loaded — it increases early-time predicted rates. If the model is already predicting too many events in the first 6 hours, reducing `c` makes that worse, not better.

The correct directional effect is that **increasing `c` reduces early-time counts**. However, holding K and p fixed, increasing `c` also lowers cumulative expected count over any finite window including 72h. This matters because Maule and Iquique already fit the 72h total essentially perfectly — changing `c` alone would likely degrade those fits.

---

## Why no c sprint is justified

Three compounding reasons:

**1. The directional suggestion in the Run 6 report is inverted.** Any c refit sprint written from that report would move the parameter the wrong way.

**2. The early-time signal is inconsistent across the regime.** Early-time over-prediction was noted in Tōhoku. Maule (0.0% total error) and Iquique (0.2% total error) show essentially perfect 72h fits. A signal present in 1 of 3 sequences at n=3 is not a sufficient basis for a parameter adjustment.

**3. The 72h fit is already excellent for 2 of 3 subduction sequences.** Even if the early-time diagnosis were real, `c` is a poor next move when the total-window performance is this good. The bar for touching `c` should be very high, and current evidence does not clear it.

---

## Verdict

Leave subduction alone. The Pass verdict from Run 6 stands. No c refit sprint is warranted from current evidence.

If early-time behavior in subduction sequences becomes a recurring concern in future runs with larger n, revisit. At that point: note that the correct direction for reducing early-time over-prediction is to **increase c**, and verify that the 72h total fit remains acceptable before committing.

---

*Save to `grimoires/loa/calibration/subduction-c-sign-note.md`*
