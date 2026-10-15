// argc.c — main's argument. Set argc in the field next to the
// --opt-uncall-user-calls box (or with --main-argc N on the command line).
// Mnemo has no real input: argc is the one value you can pass to main,
// and argv is accepted but cannot be read.
#include <stdio.h>

int main(int argc, char **argv) {
    int sum = 0;
    for (int i = 1; i <= argc; i++)
        sum += i * i;
    printf("argc = %d, sum of squares up to argc = %d\n", argc, sum);
    return argc;
}
