// sat_solver.c — a mini SAT solver using built-in backtracking (try/rollback).
//
// CNF formula over 3 variables a, b, c:
//     (a ∨ b) ∧ (¬a ∨ c) ∧ (¬b ∨ ¬c) ∧ (a ∨ c)
//
// We look for an assignment that satisfies ALL the clauses. Each candidate is
// encoded in the 3 bits of `assign` (0..7). For each one the body:
//   1. decodes the bits into a, b, c;
//   2. counts the satisfied clauses in `sat`.
// The commit condition is `sat == 4` (all 4 clauses true).
//
// Why built-in backtracking helps here:
//   evaluating a candidate CHANGES many cells (a, b, c, sat and the clause
//   temporaries). For a candidate that does NOT satisfy the formula everything
//   has to go back to the initial state before trying the next one. With
//   try/rollback you only write the FORWARD evaluation: the rollback undoes the
//   whole evaluation AUTOMATICALLY (a, b, c, sat go back to 0) — no manual
//   reset, no risk of forgetting a cell. It is the exact inverse of the body.

#include <stdio.h>

int main(void) {
    int assign = 0;
    int a = 0, b = 0, c = 0;
    int sat = 0;

    while (sat != 4 && assign < 8) {
        try (sat == 4) {
            // candidate: bits 0..2 of assign
            a = assign & 1;
            b = (assign >> 1) & 1;
            c = (assign >> 2) & 1;
            // count the satisfied clauses
            if (a || b)   sat += 1;     // (a ∨ b)
            if (!a || c)  sat += 1;     // (¬a ∨ c)
            if (!b || !c) sat += 1;     // (¬b ∨ ¬c)
            if (a || c)   sat += 1;     // (a ∨ c)
        } rollback {
            // unsatisfying candidate: a, b, c, sat already restored
            // by the automatic inversion → move on to the next
            assign += 1;
        }
    }

    if (sat == 4)
        printf("SAT: a=%d b=%d c=%d (assign=%d)\n", a, b, c, assign);
    else
        printf("UNSAT\n");

    return assign;     // expected solution: a=1 b=0 c=1, assign=5
}
