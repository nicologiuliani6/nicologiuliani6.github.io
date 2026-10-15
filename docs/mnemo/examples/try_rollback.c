// mnemo-main-argc: 0
/*
 * try / rollback: a greedy knapsack with backtracking. budget=10, weights 1..6:
 * 1+2+3+4 = 10 are kept, 5 and 6 exceed the budget and are undone; each
 * rollback counts one rejected attempt.
 * Expected output: "load=10 rejected=2".
 */
#include <stdio.h>
void add_weight(int *load, int w) {
    *load += w;
}
int main(void) {
    int load = 0;
    int budget = 10;
    int rejected = 0;
    for (int i = 1; i <= 6; i++) {
        try (load <= budget) {
            add_weight(&load, i);
        } rollback {
            rejected++;
        }
    }
    printf("load=%d rejected=%d\n", load, rejected);
    return 0;
}
