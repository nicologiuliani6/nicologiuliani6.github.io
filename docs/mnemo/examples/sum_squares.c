#include <stdio.h>
int sq(int x) { return x * x; }
int main(void) {
    int a[4] = {1, 2, 3, 4};
    int s = 0;
    for (int i = 0; i < 4; i++) s += sq(a[i]);
    printf("%d\n", s);          /* 30 */
    return 0;
}
